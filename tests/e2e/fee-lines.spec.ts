import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0122 on screen: a fee line made with who it is for (new or returning, gender) and the optional / handed-over settings; a pupil opted out of the school uniform and back in (the invoice
// follows while nothing is paid); the uniform marked received from the pupil's Fee lines, and the handover list that shows it. Desktop and phone, axe on each screen.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}

test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function setUp(page: Page) {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Fees Admin" });
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-01-01"), endDate: new Date("2027-12-31"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: {
      branchId: branch.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: new Date("2026-01-10"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "Basic 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
  const pupil = await db.studentRecord.create({
    data: { branchId: branch.id, firstName: "Holder", lastName: "Pupil", gender: "MALE", admissionNo: `E2E/FL/${Date.now() % 100000}` },
  });
  await db.studentEnrollment.create({
    data: {
      studentId: pupil.id,
      branchId: branch.id,
      sessionId: session.id,
      className: group.name,
      arm: "A",
      classArmId: arm.id,
      status: "ACTIVE",
    },
  });
  const fees = await db.feeStructure.create({
    data: { branchId: branch.id, periodId: period.id, name: "School fees", amount: "40000.00" },
  });
  const uniform = await db.feeStructure.create({
    data: {
      branchId: branch.id,
      periodId: period.id,
      name: "Uniform",
      amount: "10000.00",
      optional: true,
      trackHandover: true,
      scholarshipCovers: false,
    },
  });
  await db.invoice.create({
    data: {
      branchId: branch.id,
      studentId: pupil.id,
      periodId: period.id,
      invoiceNo: `INV-E2E-${Date.now() % 100000}`,
      totalAmount: "50000.00",
      amountPaid: "0",
      status: "UNPAID",
      lineItems: [
        { feeStructureId: fees.id, name: "School fees", amount: "40000.00" },
        { feeStructureId: uniform.id, name: "Uniform", amount: "10000.00", covered: false },
      ],
    },
  });
  await signInThroughUi(page, admin);
  return { branch, admin, pupil, period, uniform };
}

test("a fee line is made with who it is charged to, and the table says so", async ({ page }) => {
  const { branch } = await setUp(page);
  await page.goto("/finance?tab=invoices");
  await page.getByRole("tab", { name: "Fee Schedules & Structures" }).click();
  await page.getByRole("button", { name: "Add Fee Item" }).click();
  const dialog = page.getByRole("dialog", { name: "Create New Fee Structure Item" });
  await dialog.getByLabel("Fee Item Name").fill("Cardigan");
  await dialog.getByLabel("Amount (₦ Naira)").fill("9000");
  await dialog.getByLabel("New or returning").selectOption({ label: "New pupils" });
  await dialog.getByLabel("Gender", { exact: true }).selectOption({ label: "Male" });
  await dialog.getByLabel(/Optional: a pupil can opt out/).check();
  await dialog.getByLabel(/an item that is handed over/).check();
  await expectAccessible(page, "the fee line form with who is charged");
  await dialog.getByRole("button", { name: "Create Item" }).click();
  const row = page.getByRole("row").filter({ hasText: "Cardigan" });
  await expect(row).toContainText("New pupils, Male");
  await expect(row).toContainText("Optional");
  await expect(row).toContainText("Handed over");
  const made = await db.feeStructure.findFirstOrThrow({ where: { branchId: branch.id, name: "Cardigan" } });
  expect(made).toMatchObject({
    audienceAdmission: "NEW",
    audienceGender: "MALE",
    audienceResidence: null,
    optional: true,
    trackHandover: true,
    scholarshipCovers: true,
  });
  await expectAccessible(page, "the fees table with the new settings");
});

test("a pupil is opted out of the uniform and back in, and marked as having received it; the handover list shows it", async ({ page }) => {
  const { branch, pupil, uniform } = await setUp(page);
  await page.goto(`/students?branch=${branch.id}&q=Holder`);
  await clickAction(page, "Fee lines of Holder Pupil");
  const dialog = page.getByRole("dialog", { name: "Fee lines of Holder Pupil" });
  const lines = dialog.getByRole("list", { name: "Fee lines" });
  await expect(lines).toContainText("School fees");
  await expect(lines.getByRole("listitem").filter({ hasText: "Uniform" })).toContainText("Optional");
  await expectAccessible(page, "the pupil's Fee lines dialog");

  await dialog.getByRole("button", { name: "Opt out of Uniform" }).click();
  await expect(lines.getByRole("listitem").filter({ hasText: "Uniform" })).toContainText("Opted out: not charged");
  await expect(dialog).toContainText("Charged this term: ₦40,000");
  expect((await db.invoice.findFirstOrThrow({ where: { studentId: pupil.id } })).totalAmount.toString()).toBe("40000");

  await dialog.getByRole("button", { name: "Charge Uniform" }).click();
  await expect(lines.getByRole("listitem").filter({ hasText: "Uniform" })).toContainText("Optional");
  expect((await db.invoice.findFirstOrThrow({ where: { studentId: pupil.id } })).totalAmount.toString()).toBe("50000");

  await dialog.getByRole("button", { name: "Mark received for Uniform" }).click();
  await expect(lines.getByRole("listitem").filter({ hasText: "Uniform" })).toContainText("Received");
  expect(await db.feeItemHandover.count({ where: { studentId: pupil.id, feeStructureId: uniform.id } })).toBe(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();

  await page.goto("/finance?tab=invoices");
  await page.getByRole("tab", { name: "Fee Schedules & Structures" }).click();
  await page.getByRole("button", { name: "Handover list for Uniform" }).click();
  const list = page.getByRole("dialog", { name: "Handover: Uniform" });
  await expect(list).toContainText("1 of 1 received");
  await expect(list.getByRole("list", { name: "Pupils" })).toContainText("Holder Pupil");
  await expectAccessible(page, "the handover list");
  await list.getByRole("button", { name: "Undo received for Holder Pupil" }).click();
  await expect(list).toContainText("0 of 1 received");
  expect(await db.feeItemHandover.count({ where: { studentId: pupil.id } })).toBe(0);
});
