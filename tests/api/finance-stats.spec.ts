import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0106: Finance's Overview, against the real server and database. The figures are worked out by hand from the invoices made here and compared with what the API adds up; then who may read
// them (the same rule as the invoices) and the all-branches view.

let home: { id: string };
let other: { id: string };
let p1: { id: string; label: string }; // the current term of `home`
let p2: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});

const as = async (role: Role, branchId: string, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
/// A calendar date `days` days from today, as the UTC midnight the database stores dates at.
const dayFromNow = (days: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + days));
};
let seq = 0;
const pupil = (branchId: string, name: string) =>
  db.studentRecord.create({
    data: { branchId, firstName: name, lastName: "Stat", gender: "FEMALE", admissionNo: `ST/${Date.now()}/${seq++}` },
  });

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.create({ data: { name: `Other ${Date.now()}` } });

  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: dayFromNow(-100), endDate: dayFromNow(200), status: "ACTIVE" },
  });
  const period = (ordinal: number, isCurrent: boolean) =>
    db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: session.id,
        kind: "TERM",
        ordinal,
        label: `${ordinal} Term`,
        startDate: dayFromNow(-100 + ordinal * 10),
        isCurrent,
      },
    });
  p1 = await period(1, true);
  p2 = await period(2, false);

  // Six pupils with invoices in the current term (P1), and one more invoice for the first pupil in the other term (P2).
  const [a, b, c, d, e, f] = await Promise.all(["Ada", "Bola", "Chi", "Dayo", "Efe", "Femi"].map((n) => pupil(home.id, n)));
  const invoice = (
    studentId: string,
    periodId: string,
    total: string,
    paid: string,
    status: "PAID" | "PARTIALLY_PAID" | "UNPAID" | "WAIVED" | "CANCELLED",
    due: number | null,
  ) =>
    db.invoice.create({
      data: {
        branchId: home.id,
        studentId,
        periodId,
        invoiceNo: `INV-T-${Date.now()}-${seq++}`,
        totalAmount: total,
        amountPaid: paid,
        status,
        dueDate: due === null ? null : dayFromNow(due),
      },
    });
  const iA = await invoice(a!.id, p1.id, "100000.00", "100000.00", "PAID", -50);
  const iB = await invoice(b!.id, p1.id, "50000.50", "20000.25", "PARTIALLY_PAID", -40); // owes 30000.25, 40 days late
  await invoice(c!.id, p1.id, "30000.00", "0", "UNPAID", -5); // 5 days late
  await invoice(d!.id, p1.id, "20000.00", "0", "UNPAID", null); // no due date
  const iE = await invoice(e!.id, p1.id, "10000.00", "0", "WAIVED", null);
  await invoice(f!.id, p1.id, "5000.00", "0", "CANCELLED", null);
  await invoice(a!.id, p2.id, "40000.00", "0", "UNPAID", -90); // another term, 90 days late

  // A discount on a live invoice counts; one on a waived invoice does not.
  await db.invoiceDiscount.create({
    data: { branchId: home.id, invoiceId: iB.id, amount: "5000.00", reason: "Staff child", appliedByUserId: (await createUser({})).id },
  });
  await db.invoiceDiscount.create({
    data: { branchId: home.id, invoiceId: iE.id, amount: "10000.00", reason: "Waived", appliedByUserId: (await createUser({})).id },
  });

  // Payments: two that count, a failed and a pending one that do not.
  const pay = (invoiceId: string, amount: string, status: "SUCCESS" | "FAILED" | "PENDING", channel: string) =>
    db.payment.create({
      data: {
        branchId: home.id,
        invoiceId,
        amount,
        status,
        provider: "MANUAL",
        providerRef: `REF-${Date.now()}-${seq++}`,
        channel,
        paidAt: status === "SUCCESS" ? new Date() : null,
      },
    });
  await pay(iA.id, "100000.00", "SUCCESS", "card");
  await pay(iB.id, "20000.25", "SUCCESS", "cash");
  await pay(iB.id, "99999.00", "FAILED", "card");
  await pay(iB.id, "88888.00", "PENDING", "card");

  // Classes, by the pupils' enrolments in the invoice's own session: Ada and Bola in JSS 1, Chi in JSS 2, Dayo in none.
  const enrol = (studentId: string, className: string) =>
    db.studentEnrollment.create({ data: { studentId, branchId: home.id, sessionId: session.id, className } });
  await enrol(a!.id, "JSS 1");
  await enrol(b!.id, "JSS 1");
  await enrol(c!.id, "JSS 2");
});

const stats = async (cookie: string, query: string) => api(`/api/v1/finance/stats?${query}`, { cookie });

test("every figure of one branch equals the hand count (all terms): invoiced, collected, outstanding, overdue, ageing, status, rate", async () => {
  const admin = await as(Role.ADMIN, home.id);
  const res = await stats(admin.cookie, `branchId=${home.id}`);
  expect(res.status).toBe(200);
  const d = res.json.data;
  // Live invoices (not waived, not cancelled): 100000 + 50000.50 + 30000 + 20000 + 40000 = 240000.50 invoiced; 100000 + 20000.25 = 120000.25 collected.
  expect(d.totals.invoices).toBe(5);
  expect(d.totals.invoicedKobo).toBe(24_000_050);
  expect(d.totals.collectedKobo).toBe(12_000_025);
  // Owed: 30000.25 (Bola) + 30000 (Chi) + 20000 (Dayo) + 40000 (Ada, second term) = 120000.25.
  expect(d.totals.outstandingKobo).toBe(12_000_025);
  // Late: Bola 30000.25 + Chi 30000 + Ada's second term 40000 = 100000.25; Dayo has no due date.
  expect(d.totals.overdueKobo).toBe(10_000_025);
  expect(d.ageing).toEqual({ notDue: 2_000_000, d1to30: 3_000_000, d31to60: 3_000_025, d61plus: 4_000_000 });
  expect(d.totals.ratePercent).toBe(50);
  expect(d.totals.discountsKobo).toBe(500_000); // the discount on the waived invoice is not counted
  expect(d.totals.waived).toBe(1);
  expect(d.totals.cancelled).toBe(1);
  expect(d.byStatus.PAID).toEqual({ count: 1, invoicedKobo: 10_000_000, collectedKobo: 10_000_000 });
  expect(d.byStatus.PARTIALLY_PAID).toEqual({ count: 1, invoicedKobo: 5_000_050, collectedKobo: 2_000_025 });
  expect(d.byStatus.UNPAID.count).toBe(3);
  // The ageing adds up to what is owed.
  expect(Object.values(d.ageing as Record<string, number>).reduce((n, v) => n + v, 0)).toBe(d.totals.outstandingKobo);
});

test("limited to one term the figures are that term's: the current term holds 200000.50 invoiced and a 60 % rate", async () => {
  const admin = await as(Role.ADMIN, home.id);
  const d = (await stats(admin.cookie, `branchId=${home.id}&periodId=${p1.id}`)).json.data;
  expect(d.totals.invoicedKobo).toBe(20_000_050);
  expect(d.totals.collectedKobo).toBe(12_000_025);
  expect(d.totals.outstandingKobo).toBe(8_000_025);
  expect(d.totals.ratePercent).toBe(60);
  const other2 = (await stats(admin.cookie, `branchId=${home.id}&periodId=${p2.id}`)).json.data;
  expect(other2.totals).toMatchObject({ invoices: 1, invoicedKobo: 4_000_000, collectedKobo: 0, overdueKobo: 4_000_000, ratePercent: 0 });
});

test("by class: each pupil's class in the invoice's own session, with 'No class' for one who has none; by method: successful payments only, failed and pending left out", async () => {
  const admin = await as(Role.ADMIN, home.id);
  const d = (await stats(admin.cookie, `branchId=${home.id}`)).json.data;
  const byName = Object.fromEntries((d.byClass as { name: string; ratePercent: number }[]).map((c) => [c.name, c]));
  expect(byName["JSS 1"]).toMatchObject({ invoices: 3, invoicedKobo: 19_000_050, collectedKobo: 12_000_025 }); // Ada twice (both terms) and Bola
  expect(byName["JSS 2"]).toMatchObject({ invoices: 1, invoicedKobo: 3_000_000, collectedKobo: 0, ratePercent: 0 });
  expect(byName["No class"]).toMatchObject({ invoices: 1, invoicedKobo: 2_000_000 });
  expect(byName["JSS 1"]!.ratePercent).toBe(63.2); // 120000.25 / 190000.50 = 63.158 %
  expect(d.byMethod).toEqual([
    { label: "Card", payments: 1, amountKobo: 10_000_000 },
    { label: "Cash", payments: 1, amountKobo: 2_000_025 },
  ]);
});

test("month by month: six months in order, this month holding what was invoiced and collected today", async () => {
  const admin = await as(Role.ADMIN, home.id);
  const months = (await stats(admin.cookie, `branchId=${home.id}`)).json.data.months as {
    month: string;
    invoicedKobo: number;
    collectedKobo: number;
  }[];
  expect(months).toHaveLength(6);
  expect(months.map((m) => m.month)).toEqual([...months.map((m) => m.month)].sort());
  const now = new Date();
  expect(months[5]!.month).toBe(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  expect(months[5]).toMatchObject({ invoicedKobo: 24_000_050, collectedKobo: 12_000_025 });
  expect(months.slice(0, 5).every((m) => m.invoicedKobo === 0 && m.collectedKobo === 0)).toBe(true);
});

test("a branch with nothing invoiced answers zeros, not an error", async () => {
  const admin = await as(Role.ADMIN, other.id);
  const res = await stats(admin.cookie, `branchId=${other.id}`);
  expect(res.status).toBe(200);
  expect(res.json.data.totals).toMatchObject({
    invoices: 0,
    invoicedKobo: 0,
    collectedKobo: 0,
    outstandingKobo: 0,
    overdueKobo: 0,
    ratePercent: 0,
  });
  expect(res.json.data.byClass).toEqual([]);
  expect(res.json.data.byMethod).toEqual([]);
});

test.describe("who may read it", () => {
  test("nobody signed in", async () => {
    expect((await api(`/api/v1/finance/stats?branchId=${home.id}`)).status).toBe(401);
    expect((await api(`/api/v1/finance/overview`)).status).toBe(401);
  });

  test("teachers and non-teaching staff are refused in every branch, on both routes", async () => {
    for (const role of [Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF]) {
      const who = await as(role, home.id);
      expect((await stats(who.cookie, `branchId=${home.id}`)).status, `${role} stats`).toBe(403);
      expect((await api(`/api/v1/finance/overview`, { cookie: who.cookie })).status, `${role} overview`).toBe(403);
    }
  });

  test("an administrator reads their own branch and is refused another's, by id and by a term of another branch", async () => {
    const admin = await as(Role.ADMIN, home.id);
    expect((await stats(admin.cookie, `branchId=${home.id}`)).status).toBe(200);
    expect((await stats(admin.cookie, `branchId=${other.id}`)).status).toBe(403);
    const mine = await as(Role.ADMIN, other.id);
    // A term that belongs to `home` asked through `other`: not found, never a figure.
    expect((await stats(mine.cookie, `branchId=${other.id}&periodId=${p1.id}`)).status).toBe(404);
  });

  test("a missing branch is a 400; a made-up term is a 404", async () => {
    const admin = await as(Role.ADMIN, home.id);
    expect((await stats(admin.cookie, ``)).status).toBe(400);
    expect((await stats(admin.cookie, `branchId=${home.id}&periodId=nope`)).status).toBe(404);
  });
});

test.describe("every branch side by side", () => {
  test("a superadmin gets a row per branch and a total that is the sum of the rows, with the rate worked out from the sums", async () => {
    const sup = await as(Role.ADMIN, home.id, true);
    const res = await api(`/api/v1/finance/overview?scope=all`, { cookie: sup.cookie });
    expect(res.status).toBe(200);
    const d = res.json.data;
    expect(d.scope).toBe("all");
    expect(d.branches.length).toBeGreaterThanOrEqual(5); // the four seeded branches and `other`
    const homeRow = d.branches.find((b: { branchId: string }) => b.branchId === home.id);
    expect(homeRow.totals).toMatchObject({ invoicedKobo: 24_000_050, collectedKobo: 12_000_025, overdueKobo: 10_000_025, ratePercent: 50 });
    const sum = (pick: (t: Record<string, number>) => number) =>
      d.branches.reduce((n: number, b: { totals: Record<string, number> }) => n + pick(b.totals), 0);
    expect(d.total.invoicedKobo).toBe(sum((t) => t.invoicedKobo!));
    expect(d.total.collectedKobo).toBe(sum((t) => t.collectedKobo!));
    expect(d.total.outstandingKobo).toBe(sum((t) => t.outstandingKobo!));
    expect(d.total.ratePercent).toBe(50);
  });

  test("'current' is each branch's own current term: home's current term only, and a branch with no current term shows zeros and no term name", async () => {
    const sup = await as(Role.ADMIN, home.id, true);
    const d = (await api(`/api/v1/finance/overview`, { cookie: sup.cookie })).json.data;
    expect(d.scope).toBe("current");
    const homeRow = d.branches.find((b: { branchId: string }) => b.branchId === home.id);
    expect(homeRow.periodLabel).toBe(p1.label);
    expect(homeRow.totals).toMatchObject({ invoicedKobo: 20_000_050, ratePercent: 60 });
    const otherRow = d.branches.find((b: { branchId: string }) => b.branchId === other.id);
    expect(otherRow.periodLabel).toBeNull();
    expect(otherRow.totals.invoicedKobo).toBe(0);
  });

  test("a branch administrator is shown only their own branch: another branch is left out, not named", async () => {
    const admin = await as(Role.ADMIN, home.id);
    const d = (await api(`/api/v1/finance/overview?scope=all`, { cookie: admin.cookie })).json.data;
    expect(d.branches.map((b: { branchId: string }) => b.branchId)).toEqual([home.id]);
    expect(JSON.stringify(d)).not.toContain(other.id);
    expect(d.total.invoicedKobo).toBe(24_000_050);
  });

  test("a bad scope is a 400", async () => {
    const admin = await as(Role.ADMIN, home.id);
    expect((await api(`/api/v1/finance/overview?scope=everything`, { cookie: admin.cookie })).status).toBe(400);
  });
});
