import { TEST_PAYSTACK_SECRET } from "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, uniqueEmail } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { mockPaystack } from "@/lib/finance/mock-paystack";

// Part payment "if allowed" (task 0046): the school's rule and a branch's, the per-invoice mark, both ways of paying, and the webhook that must never refuse money already taken.
// Real HTTP against a production build, real database.

const RULE = "/api/v1/settings/part-payment";
const TOTAL = 45_000;

type Person = { id: string; cookie: string };
let A: { id: string; name: string };
let B: { id: string; name: string };
let sa: Person;
let adminA: Person;
let adminB: Person;
let teacherA: Person;
let invoiceId: string;

async function staffIn(branchId: string, role: Role, name: string): Promise<Person> {
  const user = await createUser({ name, email: uniqueEmail(name.toLowerCase().replace(/\W+/g, "-")) });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { id: user.id, cookie: cookieHeader((await loginAs(user)).token!) };
}
const patch = (path: string, who: Person, body: unknown) => api(path, { method: "PATCH", cookie: who.cookie, body });
const setSchool = (policy: unknown, who: Person = sa) => patch(RULE, who, { scope: "GLOBAL", policy });
const setBranch = (branchId: string, policy: unknown, who: Person = adminA) => patch(RULE, who, { scope: "BRANCH", branchId, policy });
const OFF = { allowed: false, minimum: { kind: "NONE" } };
const amount = (value: number) => ({ allowed: true, minimum: { kind: "AMOUNT", value } });
const percent = (value: number) => ({ allowed: true, minimum: { kind: "PERCENT", value } });

const record = (value: number, who: Person = adminA, id = invoiceId, branchId = A.id) =>
  api(`/api/v1/finance/invoices/${id}/record-payment?branchId=${branchId}`, {
    method: "POST",
    cookie: who.cookie,
    body: { amount: value, channel: "cash" },
  });
const gateway = (value: number | undefined, who: Person = adminA) =>
  api(`/api/v1/finance/invoices/${invoiceId}/pay?branchId=${A.id}`, {
    method: "POST",
    cookie: who.cookie,
    body: { email: "parent@example.com", ...(value === undefined ? {} : { amount: value }) },
  });
const detail = async (who: Person = adminA) =>
  (await api(`/api/v1/finance/invoices/${invoiceId}?branchId=${A.id}`, { cookie: who.cookie })).json.data;
const paid = async () => Number((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).amountPaid);
const markPayInFull = (value: boolean, who: Person = adminA, branchId = A.id, id = invoiceId) =>
  patch(`/api/v1/finance/invoices/${id}/pay-in-full?branchId=${branchId}`, who, { payInFull: value });

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  mockPaystack.reset();
  const branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  [A, B] = [branches[0]!, branches[1]!];
  const superUser = await createUser({ role: Role.ADMIN, name: "Super Admin" });
  sa = { id: superUser.id, cookie: cookieHeader((await loginAs(superUser)).token!) };
  const branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Admin A" });
  adminA = { id: branchAdmin.id, cookie: cookieHeader((await loginAs(branchAdmin)).token!) };
  adminB = await staffIn(B.id, Role.ADMIN, "Admin B");
  teacherA = await staffIn(A.id, Role.TEACHING_STAFF, "Teacher A");
  const session = await db.academicSession.create({
    data: { branchId: A.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: { branchId: A.id, sessionId: session.id, ordinal: 1, label: "1st Term", startDate: new Date("2026-09-01"), isCurrent: true },
  });
  const student = await db.studentRecord.create({
    data: {
      branchId: A.id,
      firstName: "Bilal",
      lastName: "Yusuf",
      admissionNo: "2026/0002",
      gender: Gender.MALE,
      dateOfBirth: new Date("2013-02-10"),
    },
  });
  invoiceId = (
    await db.invoice.create({
      data: {
        branchId: A.id,
        studentId: student.id,
        periodId: period.id,
        invoiceNo: "INV-PP-0001",
        totalAmount: TOTAL,
        amountPaid: 0,
        status: "UNPAID",
      },
    })
  ).id;
});

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("the default is what the system did before there was a setting", () => {
  test("with nothing stored any amount up to the balance is accepted, by both ways of paying", async () => {
    expect((await record(1)).status).toBe(201);
    expect((await record(12_345.67)).status).toBe(201);
    expect((await gateway(500)).status).toBe(200);
    expect(await paid()).toBe(12_346.67);
    const view = await detail();
    expect(view.partPayment).toMatchObject({ allowed: true });
    expect(view.partPayment.text).toMatch(/Part payments are allowed/);
    expect(view.payInFull).toBe(false);
  });

  test("zero, negative and more than the balance are still refused as before", async () => {
    expect((await record(0)).status).toBe(400);
    expect((await record(-5)).status).toBe(400);
    const over = await record(TOTAL + 1);
    expect(over.status).toBe(400);
    expect(over.json.error.message).toMatch(/exceed the balance/);
    expect(await paid()).toBe(0);
  });
});

test.describe("the school's rule", () => {
  test("only a super admin edits it; a branch administrator and a teacher don't", async () => {
    expect((await setSchool(OFF, adminA)).status).toBe(403);
    expect((await setSchool(OFF, teacherA)).status).toBe(403);
    expect((await api(RULE)).status).toBe(401);
    expect((await api(RULE, { cookie: teacherA.cookie })).status).toBe(403);
    expect((await setSchool(OFF)).status).toBe(200);
    expect(await db.auditLog.count({ where: { action: "PART_PAYMENT_SETTING_CHANGED" } })).toBe(1);
  });

  test("with part payment off, only the whole balance goes through, whoever pays and however", async () => {
    await setSchool(OFF);
    const refused = await record(10_000);
    expect(refused.status).toBe(400);
    expect(refused.json.error.code).toBe("PAY_IN_FULL");
    expect(refused.json.error.message).toContain("45,000");
    expect((await gateway(10_000)).json.error.code).toBe("PAY_IN_FULL");
    expect(await db.payment.count()).toBe(0);
    expect((await gateway(undefined)).status).toBe(200); // no amount = the whole balance
    expect((await record(TOTAL)).status).toBe(201);
    const view = await detail();
    expect(view.status).toBe("PAID");
  });

  test("after a part was paid when it was allowed, turning it off means the balance is what has to be paid", async () => {
    expect((await record(30_000)).status).toBe(201);
    await setSchool(OFF);
    expect((await record(5_000)).json.error.code).toBe("PAY_IN_FULL");
    expect((await record(15_000)).status).toBe(201);
    expect(await paid()).toBe(TOTAL);
  });

  test("a smallest amount: under it is refused, at it is accepted, and the payment that settles the balance is always accepted", async () => {
    await setSchool(amount(5_000));
    const under = await record(4_999.99);
    expect(under.status).toBe(400);
    expect(under.json.error.code).toBe("BELOW_MINIMUM");
    expect(under.json.error.message).toContain("5,000");
    expect((await record(5_000)).status).toBe(201);
    expect((await record(37_000)).status).toBe(201); // the balance is now 3,000
    expect((await record(2_999)).json.error.code).toBe("BELOW_MINIMUM");
    expect((await record(3_000)).status).toBe(201); // under the smallest part, but it settles the balance
    expect(await paid()).toBe(TOTAL);
  });

  test("a smallest percentage of the invoice", async () => {
    await setSchool(percent(10)); // 4,500 of 45,000
    expect((await record(4_499.99)).json.error.code).toBe("BELOW_MINIMUM");
    expect((await record(4_500)).status).toBe(201);
    expect((await gateway(100)).json.error.code).toBe("BELOW_MINIMUM");
  });

  test("a rule that is not a rule is refused, and nothing is stored", async () => {
    for (const bad of [
      { allowed: true },
      { allowed: "yes", minimum: { kind: "NONE" } },
      { allowed: true, minimum: { kind: "AMOUNT", value: 0 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: -5 } },
      { allowed: true, minimum: { kind: "AMOUNT", value: 12.345 } },
      { allowed: true, minimum: { kind: "PERCENT", value: 0 } },
      { allowed: true, minimum: { kind: "PERCENT", value: 101 } },
      { allowed: true, minimum: { kind: "SOMETHING" } },
      { allowed: true, minimum: { kind: "NONE" }, extra: 1 },
    ]) {
      expect((await setSchool(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await patch(RULE, sa, { scope: "GLOBAL", branchId: A.id, policy: OFF })).status).toBe(400);
    expect((await patch(RULE, sa, { scope: "BRANCH", policy: OFF })).status).toBe(400);
    expect(await db.settingValue.count({ where: { key: "finance.partPayment" } })).toBe(0);
  });

  test("removing it goes back to the default; saving the same value twice writes one audit entry", async () => {
    await setSchool(OFF);
    await setSchool(OFF);
    expect(await db.auditLog.count({ where: { action: "PART_PAYMENT_SETTING_CHANGED" } })).toBe(1);
    expect((await setSchool(null)).status).toBe(200);
    expect((await record(1_000)).status).toBe(201);
    expect(await db.settingValue.count({ where: { key: "finance.partPayment" } })).toBe(0);
  });

  test("the screen's view: the school's value, each branch's value and the sentence that applies", async () => {
    await setSchool(amount(2_500));
    await setBranch(A.id, amount(4_000));
    const view = (await api(RULE, { cookie: sa.cookie })).json.data;
    expect(view.canEditSchool).toBe(true);
    expect(view.school.stored).toEqual(amount(2_500));
    expect(view.school.text).toContain("2,500");
    const a = view.branches.find((b: { id: string }) => b.id === A.id);
    expect(a.stored).toEqual(amount(4_000));
    expect(a.text).toContain("₦2,500 or ₦4,000");
    const mine = (await api(RULE, { cookie: adminA.cookie })).json.data;
    expect(mine.canEditSchool).toBe(false);
    expect(mine.branches.map((b: { id: string }) => b.id)).toEqual([A.id]);
  });
});

test.describe("a branch can only tighten", () => {
  test("a branch administrator sets their own branch's rule and no other, and not the school's", async () => {
    expect((await setBranch(A.id, amount(3_000))).status).toBe(200);
    expect((await setBranch(B.id, amount(3_000))).status).toBe(404);
    expect((await setBranch(A.id, amount(3_000), teacherA)).status).toBe(403);
    expect((await setBranch(B.id, OFF, adminB)).status).toBe(200);
    expect((await record(2_999)).json.error.code).toBe("BELOW_MINIMUM"); // branch A's rule
    expect((await record(3_000)).status).toBe(201);
    // branch B has part payments off but A is untouched
    const bInvoice = await db.invoice.create({
      data: {
        branchId: B.id,
        studentId: (
          await db.studentRecord.create({
            data: {
              branchId: B.id,
              firstName: "Zed",
              lastName: "B",
              admissionNo: "2026/0099",
              gender: Gender.MALE,
              dateOfBirth: new Date("2012-01-01"),
            },
          })
        ).id,
        periodId: (
          await db.academicPeriod.create({
            data: {
              branchId: B.id,
              sessionId: (
                await db.academicSession.create({
                  data: {
                    branchId: B.id,
                    label: "2026/2027",
                    startDate: new Date("2026-09-01"),
                    endDate: new Date("2027-07-31"),
                    status: "ACTIVE",
                  },
                })
              ).id,
              ordinal: 1,
              label: "1st Term",
              startDate: new Date("2026-09-01"),
              isCurrent: true,
            },
          })
        ).id,
        invoiceNo: "INV-PP-B-1",
        totalAmount: 10_000,
        amountPaid: 0,
        status: "UNPAID",
      },
    });
    const bPart = await record(1_000, adminB, bInvoice.id, B.id);
    expect(bPart.json.error.code).toBe("PAY_IN_FULL");
    expect((await record(10_000, adminB, bInvoice.id, B.id)).status).toBe(201);
  });

  test("a branch can't allow what the school forbids, or remove or lower the school's smallest part", async () => {
    await setSchool(OFF);
    const widen = await setBranch(A.id, amount(1_000));
    expect(widen.status).toBe(400);
    expect(widen.json.error.message).toMatch(/does not allow part payments/);
    await setSchool(amount(5_000));
    expect((await setBranch(A.id, { allowed: true, minimum: { kind: "NONE" } })).status).toBe(400);
    const lower = await setBranch(A.id, amount(4_000));
    expect(lower.status).toBe(400);
    expect(lower.json.error.message).toMatch(/only raise it/);
    expect((await setBranch(A.id, amount(6_000))).status).toBe(200);
    expect((await setBranch(A.id, percent(5))).status).toBe(200); // another kind: compared on the invoice at hand
    expect(await db.settingValue.count({ where: { key: "finance.partPayment", scope: "BRANCH" } })).toBe(1);
  });

  test("a looser value that got into the database by hand is ignored: the stricter of the two applies", async () => {
    await setSchool(amount(5_000));
    await db.settingValue.create({
      data: {
        scope: "BRANCH",
        branchId: A.id,
        key: "finance.partPayment",
        value: { allowed: true, minimum: { kind: "NONE" } },
        status: "APPROVED",
      },
    });
    expect((await record(4_000)).json.error.code).toBe("BELOW_MINIMUM");
    await db.settingValue.updateMany({ where: { key: "finance.partPayment", scope: "BRANCH" }, data: { value: "nonsense" } });
    expect((await record(4_000)).json.error.code).toBe("BELOW_MINIMUM"); // a value that does not parse is ignored; the school's still applies
    expect((await record(5_000)).status).toBe(201);
  });

  test("a branch goes back to the school's rule by removing its own", async () => {
    await setBranch(A.id, OFF);
    expect((await record(1_000)).status).toBe(400);
    expect((await setBranch(A.id, null)).status).toBe(200);
    expect((await record(1_000)).status).toBe(201);
  });
});

test.describe("one invoice marked pay in full", () => {
  test("an administrator marks it and clears it; a part is refused while it is marked; the whole balance is not", async () => {
    expect((await markPayInFull(true)).status).toBe(200);
    expect((await detail()).payInFull).toBe(true);
    expect((await detail()).partPayment).toMatchObject({ allowed: false, text: "This invoice has to be paid in full." });
    expect((await record(1_000)).json.error.code).toBe("PAY_IN_FULL");
    expect((await gateway(1_000)).json.error.code).toBe("PAY_IN_FULL");
    expect((await markPayInFull(false)).status).toBe(200);
    expect((await record(1_000)).status).toBe(201);
    expect(await db.auditLog.count({ where: { action: "INVOICE_PAY_IN_FULL_CHANGED" } })).toBe(2);
    expect((await markPayInFull(false)).status).toBe(200); // the same value again writes nothing
    expect(await db.auditLog.count({ where: { action: "INVOICE_PAY_IN_FULL_CHANGED" } })).toBe(2);
  });

  test("it can only tighten: it never allows a part the school's rule forbids", async () => {
    await setSchool(OFF);
    await markPayInFull(false);
    expect((await record(1_000)).json.error.code).toBe("PAY_IN_FULL");
  });

  test("who: an administrator of that branch; not a teacher, not another branch's administrator, not signed out; a paid invoice can't be changed", async () => {
    expect((await markPayInFull(true, teacherA)).status).toBe(403);
    expect((await markPayInFull(true, adminB)).status).toBe(404);
    expect(
      (await api(`/api/v1/finance/invoices/${invoiceId}/pay-in-full?branchId=${A.id}`, { method: "PATCH", body: { payInFull: true } }))
        .status,
    ).toBe(401);
    expect((await patch(`/api/v1/finance/invoices/${invoiceId}/pay-in-full`, adminA, { payInFull: true })).status).toBe(400); // no branch
    expect((await patch(`/api/v1/finance/invoices/${invoiceId}/pay-in-full?branchId=${A.id}`, adminA, { payInFull: "yes" })).status).toBe(
      400,
    );
    expect(
      (await patch(`/api/v1/finance/invoices/${invoiceId}/pay-in-full?branchId=${A.id}`, adminA, { payInFull: true, x: 1 })).status,
    ).toBe(400);
    expect((await markPayInFull(true, adminA, A.id, "nonexistentinvoiceid0000")).status).toBe(404);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).payInFull).toBe(false);
    await record(TOTAL);
    const closed = await markPayInFull(true);
    expect(closed.status).toBe(409);
    expect(closed.json.error.code).toBe("NOT_OPEN");
  });
});

test.describe("racing payments and money already taken", () => {
  test("two payments at the same moment can't take more than the balance", async () => {
    const results = await Promise.all([record(30_000), record(30_000)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await paid()).toBe(30_000);
    expect(await db.payment.count({ where: { status: "SUCCESS" } })).toBe(1);
  });

  test("two payments of the whole balance at the same moment: one is taken, the other is told it is paid", async () => {
    await setSchool(OFF);
    const results = await Promise.all([record(TOTAL), record(TOTAL), record(TOTAL)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400]);
    expect(await paid()).toBe(TOTAL);
  });

  test("two parts racing under a smallest amount both honour it", async () => {
    await setSchool(amount(10_000));
    const results = await Promise.all([record(9_999), record(10_000), record(9_000)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400]);
    expect(await paid()).toBe(10_000);
  });

  test("the webhook still accepts a payment that was started before the rule changed: money already taken is never refused", async () => {
    const start = await gateway(10_000);
    expect(start.status, start.text).toBe(200);
    await setSchool(OFF);
    await markPayInFull(true);
    const webhook = mockPaystack.generateWebhookPayload(start.json.data.reference, TEST_PAYSTACK_SECRET, 1_000_000, "parent@example.com");
    const res = await api("/api/v1/webhooks/paystack", {
      method: "POST",
      headers: { "x-paystack-signature": webhook.signature, "content-type": "application/json" },
      rawBody: webhook.rawBody,
    });
    expect(res.status).toBe(200);
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(invoice.status).toBe("PARTIALLY_PAID");
    expect(Number(invoice.amountPaid)).toBe(10_000);
    // and the next part is refused, as the rule now says
    expect((await record(1_000)).json.error.code).toBe("PAY_IN_FULL");
  });
});
