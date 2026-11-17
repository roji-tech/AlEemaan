import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Bulk fee items over real HTTP (task 0084): the period and the class are found by name, a line that already exists is refused, the amount is exact money, a save is all or nothing, and
// an invoice already issued is not touched.

let home: { id: string };
let other: { id: string };
let ids: { t1: string; t2: string; t1next: string; jss1: string; prim1: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  const s1 = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20") },
  });
  const s2 = await db.academicSession.create({
    data: { branchId: home.id, label: "2027/2028", startDate: new Date("2027-09-01"), endDate: new Date("2028-07-20") },
  });
  const period = (sessionId: string, ordinal: number, label: string) =>
    db.academicPeriod.create({
      data: { branchId: home.id, sessionId, ordinal, label, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15") },
    });
  const t1 = await period(s1.id, 1, "1st Term");
  const t2 = await period(s1.id, 2, "2nd Term");
  const t1next = await period(s2.id, 1, "1st Term");
  const jss1 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const prim1 = await db.classGroup.create({ data: { branchId: home.id, name: "Primary 1" } });
  ids = { t1: t1.id, t2: t2.id, t1next: t1next.id, jss1: jss1.id, prim1: prim1.id };
});
const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const IMPORT = "/api/v1/finance/fee-structures/import";
const row = (line: number, values: Record<string, string> = {}) => ({
  line,
  values: { period: "1st Term (2026/2027)", classGroup: "JSS 1", name: `Fee ${line}`, amount: "1000", ...values },
});
const send = (cookie: string, rows: unknown[], extra: Record<string, unknown> = {}) =>
  api(IMPORT, { method: "POST", cookie, body: { branchId: home.id, dryRun: true, rows, ...extra } });
const fees = () => db.feeStructure.findMany({ where: { branchId: home.id }, orderBy: { name: "asc" } });

test("who may use it: signed out 401; a teacher 403; the administrator of another branch 403; a branch administrator may", async () => {
  const body = { branchId: home.id, dryRun: true, rows: [row(2)] };
  expect((await api(IMPORT, { method: "POST", body })).status).toBe(401);
  expect((await api(IMPORT, { method: "POST", cookie: (await asRole(Role.TEACHING_STAFF)).cookie, body })).status).toBe(403);
  expect((await api(IMPORT, { method: "POST", cookie: (await asRole(Role.ADMIN, other.id)).cookie, body })).status).toBe(403);
  expect((await api(IMPORT, { method: "POST", cookie: (await asRole(Role.ADMIN)).cookie, body })).status).toBe(200);
});

test("a dry run finds the period and class by name and says what is wrong, and writes nothing", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  await db.feeStructure.create({
    data: { branchId: home.id, periodId: ids.t2, classGroupId: ids.jss1, name: "Tuition", amount: "150000.00" },
  });
  const res = await send(cookie, [
    row(2),
    row(3, { period: "2nd Term" }),
    row(4, { period: "1st Term" }),
    row(5, { period: "3rd Term (2026/2027)" }),
    row(6, { classGroup: "SSS 9" }),
    row(7, { classGroup: "" }),
    row(8, { period: "2nd Term", name: "tuition" }),
    row(9, { name: "Fee 2" }),
    row(10, { amount: "12.345" }),
  ]);
  expect(res.status).toBe(200);
  const v = res.json.data.verdicts as { line: number; status: string; problems: { column?: string; message: string }[] }[];
  expect(v.map((x) => [x.line, x.status])).toEqual([
    [2, "ready"],
    [3, "ready"],
    [4, "error"],
    [5, "error"],
    [6, "error"],
    [7, "ready"],
    [8, "error"],
    [9, "error"],
    [10, "error"],
  ]);
  expect(v[2].problems[0].message).toContain("More than one period is called");
  expect(v[3].problems[0].column).toBe("period");
  expect(v[4].problems[0].column).toBe("classGroup");
  expect(v[6].problems).toEqual([{ column: "name", message: expect.stringContaining("already exists for that period and class") }]);
  expect(v[7].problems).toEqual(
    [{ column: "name", message: "Same period, class and fee item as row 2." }].map((p) => ({ ...p, message: expect.any(String) })),
  );
  expect(v[8].problems[0].column).toBe("amount");
  expect(await db.feeStructure.count({ where: { branchId: home.id } })).toBe(1);
});

test("a save is all or nothing; every line is saved with exact money, the right period and class (or every class), and one audit entry", async () => {
  const { user, cookie } = await asRole(Role.ADMIN);
  const blocked = await send(cookie, [row(2), row(3, { period: "Nope" })], { dryRun: false });
  expect([blocked.status, blocked.json.error.code, blocked.json.data.saved]).toEqual([422, "BULK_PROBLEMS", 0]);
  expect((await fees()).length).toBe(0);

  const saved = await send(
    cookie,
    [
      row(2, { name: "Tuition", amount: "150,000" }),
      row(3, { name: "Books", amount: "₦1,500.5", classGroup: "Primary 1", period: "2nd Term" }),
      row(4, { name: "Levy", amount: "0.07", classGroup: "", period: "1st Term (2027/2028)" }),
    ],
    { dryRun: false },
  );
  expect([saved.status, saved.json.data.saved]).toEqual([201, 3]);
  const rows = await fees();
  expect(rows.map((f) => [f.name, f.periodId, f.classGroupId, f.amount.toString()])).toEqual([
    ["Books", ids.t2, ids.prim1, "1500.5"],
    ["Levy", ids.t1next, null, "0.07"],
    ["Tuition", ids.t1, ids.jss1, "150000"],
  ]);
  const audits = await db.auditLog.findMany({ where: { actorUserId: user.id, action: "FEE_STRUCTURES_BULK_IMPORTED" } });
  expect(audits).toHaveLength(1);
  expect(audits[0].afterValue).toMatchObject({ count: 3, branchId: home.id });
});

test("the real run checks again: a fee line added after the dry run blocks the save, and nothing is written", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  const rows = [row(2, { name: "Late" }), row(3)];
  expect((await send(cookie, rows)).json.data.verdicts.every((v: { status: string }) => v.status === "ready")).toBe(true);
  await db.feeStructure.create({ data: { branchId: home.id, periodId: ids.t1, classGroupId: ids.jss1, name: "late", amount: "5" } });
  const res = await send(cookie, rows, { dryRun: false });
  expect([res.status, res.json.error.code, res.json.data.saved]).toEqual([422, "BULK_PROBLEMS", 0]);
  expect((await fees()).length).toBe(1);
});

test("an invoice already issued is not changed by saving fee lines", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  const pupil = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Ada",
      lastName: "Okoro",
      gender: "FEMALE",
      dateOfBirth: new Date("2014-01-01"),
      admissionNo: "INV/1",
    },
  });
  const invoice = await db.invoice.create({
    data: {
      branchId: home.id,
      studentId: pupil.id,
      periodId: ids.t1,
      invoiceNo: "INV-2026-0001",
      totalAmount: "1000",
      dueDate: new Date("2026-12-01"),
    },
  });
  const before = JSON.stringify(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }));
  expect((await send(cookie, [row(2, { name: "Tuition", amount: "99999" })], { dryRun: false })).status).toBe(201);
  expect(JSON.stringify(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))).toBe(before);
});

test("limits: 1000 rows, a strict body, a branch that is not yours, and a rate limit", async () => {
  const { cookie } = await asRole(Role.ADMIN);
  expect(
    (
      await send(
        cookie,
        Array.from({ length: 1001 }, (_, i) => row(i + 2)),
      )
    ).status,
  ).toBe(400);
  expect((await send(cookie, [row(2)], { surprise: 1 })).status).toBe(400);
  expect((await send(cookie, [])).status).toBe(400);
  expect((await api(IMPORT, { method: "POST", cookie, body: { branchId: other.id, dryRun: true, rows: [row(2)] } })).status).toBe(403);
  let last = 200;
  for (let i = 0; i < 40 && last !== 429; i++) last = (await send(cookie, [row(2)])).status;
  expect(last).toBe(429);
});
