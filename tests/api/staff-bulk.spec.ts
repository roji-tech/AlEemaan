import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Bulk staff over real HTTP (task 0084): a dry run that writes nothing, a save that is all or nothing, every rule checked again on the server, and the same scope as the single form.

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
const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const IMPORT = "/api/v1/staff/import";
const row = (line: number, values: Record<string, string> = {}) => ({
  line,
  values: { category: "Teaching", firstName: `Person${line}`, lastName: "Test", phone: "", email: "", ...values },
});
const send = (cookie: string, rows: unknown[], extra: Record<string, unknown> = {}) =>
  api(IMPORT, { method: "POST", cookie, body: { branchId: home.id, dryRun: true, rows, ...extra } });
const staffCount = () => db.staffRecord.count({ where: { branchId: home.id } });

test("who may use it: signed out 401; a teacher 403; the administrator of another branch 403; a branch administrator may", async () => {
  const body = { branchId: home.id, dryRun: true, rows: [row(2)] };
  expect((await api(IMPORT, { method: "POST", body })).status).toBe(401);
  const teacher = await asRole(Role.TEACHING_STAFF);
  expect((await api(IMPORT, { method: "POST", cookie: teacher.cookie, body })).status).toBe(403);
  const foreign = await asRole(Role.ADMIN, other.id);
  const refused = await api(IMPORT, { method: "POST", cookie: foreign.cookie, body });
  expect([refused.status, refused.json.error.code]).toEqual([403, "FORBIDDEN"]);
  const admin = await asRole(Role.ADMIN);
  expect((await api(IMPORT, { method: "POST", cookie: admin.cookie, body })).status).toBe(200);
});

test("a dry run answers every row and writes nothing: good rows ready, bad rows with the column and the sentence, a saved email named", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  await db.staffRecord.create({ data: { branchId: home.id, category: "TEACHING", firstName: "Old", lastName: "Hand", email: "taken@x.com" } });
  await db.staffRecord.create({ data: { branchId: home.id, category: "TEACHING", firstName: "Gone", lastName: "Away", email: "archived@x.com", archivedAt: new Date() } });
  const before = await staffCount();
  const res = await send(cookie, [
    row(2, { email: "new@x.com" }),
    row(3, { firstName: "" }),
    row(4, { email: "TAKEN@x.com" }),
    row(5, { email: "archived@x.com" }),
    row(7, { category: "Principal" }),
  ]);
  expect(res.status).toBe(200);
  const { verdicts } = res.json.data;
  expect(verdicts.map((v: { line: number; status: string }) => [v.line, v.status])).toEqual([[2, "ready"], [3, "error"], [4, "error"], [5, "ready"], [7, "error"]]);
  expect(verdicts[1].problems).toEqual([{ column: "firstName", message: "Give a name." }]);
  expect(verdicts[2].problems).toEqual([{ column: "email", message: "Another staff record in this branch already uses that email." }]);
  expect(await staffCount()).toBe(before);
});

test("a save is all or nothing: one bad row among many saves nothing and says which; with every row good it saves all, audited", async () => {
  const { user, cookie } = await asRole(Role.ADMIN);
  const blocked = await send(cookie, [row(2), row(3), row(4, { email: "nope" })], { dryRun: false });
  expect([blocked.status, blocked.json.error.code, blocked.json.data.saved]).toEqual([422, "BULK_PROBLEMS", 0]);
  expect(blocked.json.data.verdicts.filter((v: { status: string }) => v.status === "error").map((v: { line: number }) => v.line)).toEqual([4]);
  expect(await staffCount()).toBe(0);

  const saved = await send(cookie, [row(2, { email: "A@X.com", category: "non-teaching" }), row(3), row(4, { phone: "8031234567" })], { dryRun: false });
  expect([saved.status, saved.json.data.saved]).toEqual([201, 3]);
  const rows = await db.staffRecord.findMany({ where: { branchId: home.id }, orderBy: { firstName: "asc" } });
  expect(rows.map((r) => [r.firstName, r.category, r.email, r.phone])).toEqual([
    ["Person2", "NON_TEACHING", "a@x.com", null],
    ["Person3", "TEACHING", null, null],
    ["Person4", "TEACHING", null, "08031234567"],
  ]);
  const audits = await db.auditLog.findMany({ where: { actorUserId: user.id, action: { in: ["STAFF_CREATED", "STAFF_BULK_IMPORTED"] } } });
  expect(audits.filter((a) => a.action === "STAFF_CREATED")).toHaveLength(3);
  expect(audits.filter((a) => a.action === "STAFF_BULK_IMPORTED")).toHaveLength(1);
});

test("the real run checks again: an email taken after the dry run blocks the save, and nothing is written", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  const rows = [row(2, { email: "late@x.com" }), row(3)];
  expect((await send(cookie, rows)).json.data.verdicts.every((v: { status: string }) => v.status === "ready")).toBe(true);
  await db.staffRecord.create({ data: { branchId: home.id, category: "TEACHING", firstName: "Quick", lastName: "Fox", email: "late@x.com" } });
  const res = await send(cookie, rows, { dryRun: false });
  expect([res.status, res.json.error.code, res.json.data.saved]).toEqual([422, "BULK_PROBLEMS", 0]);
  expect(await staffCount()).toBe(1);
});

test("the server trusts nothing the browser says: rules are run again, repeats inside the file are caught, extra cell keys are ignored, the body is strict", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  const twice = await send(cookie, [row(2, { email: "same@x.com" }), row(3, { email: "SAME@x.com" })], { dryRun: false });
  expect([twice.status, twice.json.data.verdicts[1].problems[0].message]).toEqual([422, "Repeats row 2."]);
  const extra = await send(cookie, [{ line: 2, values: { ...row(2).values, role: "ADMIN", branchId: other.id } }]);
  expect([extra.status, extra.json.data.verdicts[0].status]).toEqual([200, "ready"]);
  expect((await send(cookie, [row(2)], { surprise: 1 })).status).toBe(400);
  expect((await api(IMPORT, { method: "POST", cookie, body: { branchId: home.id, rows: [row(2)] } })).status).toBe(400);
  expect((await send(cookie, [])).status).toBe(400);
  expect((await send(cookie, Array.from({ length: 1001 }, (_, i) => row(i + 2)))).status).toBe(400);
  expect((await send(cookie, [{ line: 0, values: {} }])).status).toBe(400);
});

test("a branch the caller does not administer is a 403 even when the body is otherwise good, and it is rate limited", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  const res = await api(IMPORT, { method: "POST", cookie, body: { branchId: other.id, dryRun: true, rows: [row(2)] } });
  expect(res.status).toBe(403);
  let last = 200;
  for (let i = 0; i < 40 && last !== 429; i++) last = (await send(cookie, [row(2)])).status;
  expect(last).toBe(429);
});
