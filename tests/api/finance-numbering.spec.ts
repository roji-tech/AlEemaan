import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, seedInstance, BRANCH_NAMES } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Invoice and receipt numbers are `INV-<branch code>-<year>-<seq>` and `RCP-<branch code>-<year>-<seq>`, with one sequence per branch and year, and `Invoice.invoiceNo` is unique
// across the whole school. The code used to be the first four letters of the branch NAME, so the four branches the setup wizard creates collided in pairs (Secondary (English) and
// Secondary (Arabic) are both SECO; the two Primary branches are both PRIM): the second branch to issue its first invoice of a year hit the unique index and the whole generation
// failed with a 500. Receipts have no unique index, so they were silently duplicated. A branch now has its own code, unique by construction.

test.beforeAll(async () => {
  await seedInstance();
});

test.beforeEach(async () => {
  await db.payment.deleteMany();
  await db.invoiceDiscount.deleteMany();
  await db.invoice.deleteMany();
  await db.feeStructure.deleteMany();
  await db.studentEnrollment.deleteMany();
  await db.studentRecord.deleteMany();
  await db.classArm.deleteMany();
  await db.classGroup.deleteMany();
  await db.academicPeriod.deleteMany();
  await db.academicSession.deleteMany();
  await db.receiptCounter.deleteMany();
  await db.invoiceCounter.deleteMany();
});

const branchNamed = (name: (typeof BRANCH_NAMES)[number]) => db.branch.findUniqueOrThrow({ where: { name } });

async function adminOf(branchId: string) {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId, role: Role.ADMIN } });
  return cookieHeader((await loginAs(user)).token!);
}

/// A branch with one enrolled pupil and one fee, ready for `POST /finance/invoices`; returns what the test needs to bill it and take a payment.
async function billableBranch(branchId: string, admin: string, admissionNo: string) {
  const session = await db.academicSession.create({
    data: { branchId, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: { branchId, sessionId: session.id, ordinal: 1, label: "1st Term", startDate: new Date("2026-09-01"), isCurrent: true },
  });
  const group = await db.classGroup.create({ data: { branchId, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId, classGroupId: group.id, name: "A" } });
  const student = await db.studentRecord.create({
    data: { branchId, firstName: "Amina", lastName: "Bello", admissionNo, gender: Gender.FEMALE, dateOfBirth: new Date("2012-05-15") },
  });
  await db.studentEnrollment.create({
    data: { branchId, studentId: student.id, sessionId: session.id, className: "JSS 1", classArmId: arm.id, status: "ACTIVE" },
  });
  const fee = await api("/api/v1/finance/fee-structures", {
    method: "POST",
    cookie: admin,
    body: { branchId, periodId: period.id, classGroupId: group.id, name: "Tuition", amount: 50000 },
  });
  expect(fee.status).toBe(201);
  return { periodId: period.id, branchId, admin };
}

const generate = (b: { periodId: string; branchId: string; admin: string }) =>
  api("/api/v1/finance/invoices", { method: "POST", cookie: b.admin, body: { branchId: b.branchId, periodId: b.periodId } });

async function invoiceOf(b: { periodId: string; branchId: string; admin: string }) {
  const list = await api(`/api/v1/finance/invoices?branchId=${b.branchId}&periodId=${b.periodId}`, { cookie: b.admin });
  expect(list.status).toBe(200);
  return list.json.data.invoices[0] as { id: string; invoiceNo: string };
}

test.describe("invoice and receipt numbers across branches", () => {
  for (const [first, second] of [
    ["Secondary (English)", "Secondary (Arabic)"],
    ["Primary (English)", "Primary (Arabic)"],
  ] as const) {
    test(`${first} and ${second} (the same first four letters) each bill their first invoice of the year, with different numbers`, async () => {
      const one = await billableBranch((await branchNamed(first)).id, await adminOf((await branchNamed(first)).id), "2026/1001");
      const two = await billableBranch((await branchNamed(second)).id, await adminOf((await branchNamed(second)).id), "2026/2001");

      const a = await generate(one);
      expect(a.status, JSON.stringify(a.json)).toBe(201);
      expect(a.json.data.created).toBe(1);
      const b = await generate(two);
      expect(b.status, JSON.stringify(b.json)).toBe(201);
      expect(b.json.data.created).toBe(1);

      const invoiceA = await invoiceOf(one);
      const invoiceB = await invoiceOf(two);
      expect(invoiceA.invoiceNo).toMatch(/^INV-[A-Z0-9]{2,6}-\d{4}-0001$/);
      expect(invoiceB.invoiceNo).toMatch(/^INV-[A-Z0-9]{2,6}-\d{4}-0001$/);
      expect(invoiceA.invoiceNo).not.toBe(invoiceB.invoiceNo);

      // and the receipts: no unique index protects them, so the test looks at the values
      for (const [branch, invoice] of [
        [one, invoiceA],
        [two, invoiceB],
      ] as const) {
        const paid = await api(`/api/v1/finance/invoices/${invoice.id}/record-payment?branchId=${branch.branchId}`, {
          method: "POST",
          cookie: branch.admin,
          body: { amount: 1000, channel: "cash" },
        });
        expect(paid.status, JSON.stringify(paid.json)).toBe(201);
      }
      const receipts = (await db.payment.findMany({ select: { receiptNo: true } })).map((p) => p.receiptNo);
      expect(receipts).toHaveLength(2);
      expect(new Set(receipts).size).toBe(2);
    });
  }

  test("every branch has a code, they are all different, and the code does not change when the branch is renamed", async () => {
    const branches = await db.branch.findMany({ select: { id: true, name: true, code: true } });
    expect(branches.length).toBeGreaterThanOrEqual(4);
    for (const b of branches) expect(b.code, b.name).toMatch(/^[A-Z0-9]{2,6}$/);
    expect(new Set(branches.map((b) => b.code)).size).toBe(branches.length);

    const probe = await db.branch.create({ data: { name: `Rename probe ${Date.now()}` } });
    const before = (await db.branch.findUniqueOrThrow({ where: { id: probe.id } })).code;
    await db.branch.update({ where: { id: probe.id }, data: { name: `Renamed probe ${Date.now()}` } });
    expect((await db.branch.findUniqueOrThrow({ where: { id: probe.id } })).code).toBe(before);
    await db.branch.delete({ where: { id: probe.id } });
  });

  test("a new branch gets a code of its own even when its name starts like another's, and a code that is set by hand is kept but cannot repeat or be malformed", async () => {
    const stamp = Date.now();
    const made = [] as string[];
    try {
      const first = await db.branch.create({ data: { name: `Zeta One ${stamp}` } });
      const second = await db.branch.create({ data: { name: `Zeta Two ${stamp}` } });
      made.push(first.id, second.id);
      expect(first.code).toBe("ZETA");
      expect(second.code).toBe("ZETA2");

      const chosen = await db.branch.create({ data: { name: `Chosen ${stamp}`, code: "MINE" } });
      made.push(chosen.id);
      expect(chosen.code).toBe("MINE");

      await expect(db.branch.create({ data: { name: `Copycat ${stamp}`, code: "MINE" } })).rejects.toThrow();
      for (const bad of ["a", "lower", "TOO-LONG-CODE", "SP ACE", "ÄÖ"]) {
        await expect(db.branch.create({ data: { name: `Bad ${bad} ${stamp}`, code: bad } }), bad).rejects.toThrow();
      }

      // nothing to derive a code from: still a valid, distinct code
      const symbols = await db.branch.create({ data: { name: `!!! ${stamp}`.replace(/\d/g, "") } });
      made.push(symbols.id);
      expect(symbols.code).toMatch(/^[A-Z0-9]{2,6}$/);
    } finally {
      await db.branch.deleteMany({ where: { id: { in: made } } });
    }
  });
});
