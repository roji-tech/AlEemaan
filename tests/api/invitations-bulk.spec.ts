import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { tokenFrom, waitForMail } from "../support/outbox";

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
      sentAt: new Date(),
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
      sentAt: new Date(),
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

test("limits: at most 200 rows, and a body that is not exactly the shape is refused; saving is limited to 20 batches in five minutes (the old two saves of 200)", async () => {
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
  for (let i = 0; i < 20; i++) expect((await send(cookie, [row(2, unique(`s${i}`))], { dryRun: false })).status, `save ${i + 1}`).toBe(201);
  const next = await send(cookie, [row(2, unique("over"))], { dryRun: false });
  expect([next.status, next.json.error.code]).toEqual([429, "RATE_LIMITED"]);
  expect((await send(cookie, [row(2, unique("dry"))])).status).toBe(200);
});

test.describe("the Department column (task 0127)", () => {
  const turnOn = (enabled = true) =>
    db.settingValue.upsert({
      where: { scope_branchId_key: { scope: "BRANCH", branchId: home.id, key: "academics.useDepartments" } },
      create: { scope: "BRANCH", branchId: home.id, key: "academics.useDepartments", value: enabled, status: "APPROVED" },
      update: { value: enabled },
    });
  const withDepartment = (line: number, email: string, department: string, role = "Teaching staff") => ({
    line,
    values: { email, role, department },
  });

  test("a staff row names a department by its name (any capitals); the invitation carries it and accepting puts the person in it as a member, never its head", async () => {
    const { cookie } = await asSuperAdmin();
    await turnOn();
    const sciences = await db.department.create({ data: { branchId: home.id, name: "Sciences" } });
    const email = unique("dept");
    const saved = await send(cookie, [withDepartment(2, email, "sCiEnCeS")], { dryRun: false });
    expect(saved.status, saved.text).toBe(201);
    expect((await invitations())[0].departmentId).toBe(sciences.id);

    const mail = await waitForMail(email);
    const accepted = await api("/api/v1/invitations/accept", {
      body: { token: tokenFrom(mail[0]), name: "Dept Person", password: "a-fresh-unseen-passphrase-3" },
    });
    expect(accepted.status, accepted.text).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const members = await db.departmentMember.findMany({ where: { departmentId: sciences.id }, include: { staffRecord: true } });
    expect(members.map((m) => [m.staffRecord.userId, m.isHead])).toEqual([[user.id, false]]);
    expect(await db.auditLog.count({ where: { action: "DEPARTMENT_MEMBER_ADDED", targetId: sciences.id } })).toBe(1);
  });

  test("problems on the row: an unknown department, a department for a student or a parent; nothing is saved", async () => {
    const { cookie } = await asSuperAdmin();
    await turnOn();
    await db.department.create({ data: { branchId: home.id, name: "Sciences" } });
    const res = await send(
      cookie,
      [withDepartment(2, unique("a"), "Cooking"), withDepartment(3, unique("b"), "Sciences", "Student"), row(4, unique("c"))],
      {
        dryRun: false,
      },
    );
    expect(res.status).toBe(422);
    const verdicts = res.json.data.verdicts as { line: number; status: string; problems: { column: string; message: string }[] }[];
    expect(verdicts.find((v) => v.line === 2)?.problems[0]).toMatchObject({ column: "department" });
    expect(verdicts.find((v) => v.line === 3)?.problems[0].message).toMatch(/for staff/);
    expect(verdicts.find((v) => v.line === 4)?.status).toBe("ready");
    expect(await invitations()).toHaveLength(0);
  });

  test("while the branch does not use departments the column is ignored and the review says so; the invitation has no department", async () => {
    const { cookie } = await asSuperAdmin();
    await db.department.create({ data: { branchId: home.id, name: "Sciences" } });
    const dry = await send(cookie, [withDepartment(2, unique("a"), "Sciences")]);
    expect(dry.status).toBe(200);
    expect(JSON.stringify(dry.json.data.verdicts)).toContain("does not use departments");
    expect((await send(cookie, [withDepartment(2, unique("b"), "Sciences")], { dryRun: false })).status).toBe(201);
    expect((await invitations())[0].departmentId).toBeNull();
  });
});
