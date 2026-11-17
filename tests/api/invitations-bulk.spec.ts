import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { waitForMail } from "../support/outbox";

// Bulk invitations over real HTTP (task 0084): a dry run that writes nothing and says what a save would replace, a save that is all or nothing, the same authority as one invitation
// (a branch administrator never invites an administrator), the e-mails sent after the save, and its own limits.

let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});
const asBranchAdmin = async (branchId = home.id) => {
  const user = await createUser({ role: Role.ADMIN, superAdmin: false });
  if (branchId !== home.id)
    await db.membership.update({ where: { userId_branchId: { userId: user.id, branchId: home.id } }, data: { branchId } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const asSuperAdmin = async () => {
  const user = await createUser({ role: Role.ADMIN, superAdmin: true });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const unique = (n: string) => `${n}-${Math.random().toString(36).slice(2, 8)}@bulk.test`;
const IMPORT = "/api/v1/invitations/import";
const row = (line: number, email: string, role = "Teaching staff") => ({ line, values: { email, role } });
const send = (cookie: string, rows: unknown[], extra: Record<string, unknown> = {}) =>
  api(IMPORT, { method: "POST", cookie, body: { branchId: home.id, dryRun: true, rows, ...extra } });
const invitations = () => db.invitation.findMany({ where: { branchId: home.id }, orderBy: { createdAt: "asc" } });

test("who may use it: signed out 401; a teacher 403; the administrator of another branch 403; a branch administrator may", async () => {
  const body = { branchId: home.id, dryRun: true, rows: [row(2, unique("a"))] };
  expect((await api(IMPORT, { method: "POST", body })).status).toBe(401);
  const teacher = await createUser({ role: Role.TEACHING_STAFF });
  expect((await api(IMPORT, { method: "POST", cookie: cookieHeader((await loginAs(teacher)).token!), body })).status).toBe(403);
  const foreign = await asBranchAdmin(other.id);
  expect((await api(IMPORT, { method: "POST", cookie: foreign.cookie, body })).status).toBe(403);
  const mine = await asBranchAdmin();
  expect((await api(IMPORT, { method: "POST", cookie: mine.cookie, body })).status).toBe(200);
});

test("a dry run says what is wrong and what a save would replace, and writes nothing", async () => {
  const { user, cookie } = await asBranchAdmin();
  const member = await createUser({ role: Role.TEACHING_STAFF });
  const gone = await createUser({ role: Role.TEACHING_STAFF });
  await db.membership.update({ where: { userId_branchId: { userId: gone.id, branchId: home.id } }, data: { deactivatedAt: new Date() } });
  const open = unique("open");
  await db.invitation.create({
    data: {
      email: open,
      role: "PARENT",
      branchId: home.id,
      tokenHash: "h".repeat(64),
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const before = (await invitations()).length;
  const res = await send(cookie, [
    row(2, unique("new")),
    row(3, member.email),
    row(4, gone.email),
    row(5, open, "Student"),
    row(6, unique("adm"), "Administrator"),
    row(7, unique("bad"), "Janitor"),
    row(8, "nope"),
  ]);
  expect(res.status).toBe(200);
  const v = res.json.data.verdicts as { line: number; status: string; note?: string; problems: { column?: string; message: string }[] }[];
  expect(v.map((x) => [x.line, x.status])).toEqual([
    [2, "ready"],
    [3, "error"],
    [4, "error"],
    [5, "note"],
    [6, "error"],
    [7, "error"],
    [8, "error"],
  ]);
  expect(v[1].problems).toEqual([{ column: "email", message: "That person is already a member." }]);
  expect(v[2].problems).toEqual([{ column: "email", message: "That person was deactivated. Reactivate them instead." }]);
  expect(v[3].note).toBe("Will replace the open invitation.");
  expect(v[4].problems).toEqual([{ column: "role", message: "Only a superadmin can invite an administrator." }]);
  expect(v[5].problems[0].column).toBe("role");
  expect(v[6].problems[0].column).toBe("email");
  expect((await invitations()).length).toBe(before);
});

test("a superadmin may invite an administrator, and a repeat inside the file is caught", async () => {
  const { cookie } = await asSuperAdmin();
  const email = unique("dup");
  const res = await send(cookie, [row(2, unique("boss"), "Administrator"), row(3, email), row(4, email.toUpperCase(), "Parent")]);
  expect(res.json.data.verdicts.map((x: { status: string }) => x.status)).toEqual(["ready", "ready", "error"]);
  expect(res.json.data.verdicts[2].problems[0].message).toBe("Repeats row 3.");
});

test("a save is all or nothing; with every row good it creates the invitations, replaces an open one, audits each and the bulk, and mails everyone after", async () => {
  const { user, cookie } = await asBranchAdmin();
  const member = await createUser({ role: Role.TEACHING_STAFF });
  const blocked = await send(cookie, [row(2, unique("a")), row(3, member.email)], { dryRun: false });
  expect([blocked.status, blocked.json.error.code, blocked.json.data.saved]).toEqual([422, "BULK_PROBLEMS", 0]);
  expect((await invitations()).length).toBe(0);

  const open = unique("open");
  await db.invitation.create({
    data: {
      email: open,
      role: "PARENT",
      branchId: home.id,
      tokenHash: "h".repeat(64),
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const [a, b] = [unique("a"), unique("b")];
  const saved = await send(cookie, [row(2, a, "teacher"), row(3, b, "pupil"), row(4, open, "Student")], { dryRun: false });
  expect([saved.status, saved.json.data.saved]).toEqual([201, 3]);
  const rows = await invitations();
  expect(
    rows
      .filter((r) => !r.revokedAt)
      .map((r) => [r.email, r.role])
      .sort(),
  ).toEqual(
    [
      [a, "TEACHING_STAFF"],
      [b, "STUDENT"],
      [open, "STUDENT"],
    ].sort(),
  );
  expect(rows.find((r) => r.email === open && r.role === "PARENT")!.revokedAt).not.toBeNull();
  const audits = await db.auditLog.findMany({ where: { actorUserId: user.id } });
  expect(audits.filter((x) => x.action === "INVITATION_CREATED")).toHaveLength(3);
  expect(audits.filter((x) => x.action === "INVITATION_REVOKED")).toHaveLength(1);
  expect(audits.filter((x) => x.action === "INVITATIONS_BULK_IMPORTED")).toHaveLength(1);
  for (const email of [a, b, open]) expect((await waitForMail(email)).length).toBe(1);
});

test("the real run checks again: someone who became a member after the dry run blocks the save and nothing is written", async () => {
  const { cookie } = await asBranchAdmin();
  const late = await createUser({ email: unique("late") });
  const rows = [row(2, late.email), row(3, unique("fine"))];
  expect((await send(cookie, rows)).json.data.verdicts.every((v: { status: string }) => v.status === "ready")).toBe(true);
  await db.membership.create({ data: { userId: late.id, branchId: home.id, role: "PARENT" } });
  const res = await send(cookie, rows, { dryRun: false });
  expect([res.status, res.json.error.code, res.json.data.saved]).toEqual([422, "BULK_PROBLEMS", 0]);
  expect((await invitations()).length).toBe(0);
});

test("limits: at most 200 rows, and a body that is not exactly the shape is refused; saving is limited to twice in five minutes", async () => {
  const { cookie } = await asBranchAdmin();
  expect(
    (
      await send(
        cookie,
        Array.from({ length: 201 }, (_, i) => row(i + 2, unique(`m${i}`))),
      )
    ).status,
  ).toBe(400);
  expect((await send(cookie, [row(2, unique("x"))], { surprise: 1 })).status).toBe(400);
  expect((await send(cookie, [])).status).toBe(400);
  expect((await send(cookie, [row(2, unique("one"))], { dryRun: false })).status).toBe(201);
  expect((await send(cookie, [row(2, unique("two"))], { dryRun: false })).status).toBe(201);
  const third = await send(cookie, [row(2, unique("three"))], { dryRun: false });
  expect([third.status, third.json.error.code]).toEqual([429, "RATE_LIMITED"]);
  expect((await send(cookie, [row(2, unique("dry"))])).status).toBe(200);
});
