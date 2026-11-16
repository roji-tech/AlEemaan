import { Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";
import type { Locator, Page } from "@playwright/test";

// Task 0059: every save on Finance refreshed the data with `loading = true`, and while that is true the panel shows "Loading finance records..." INSTEAD of the dashboard, so the dashboard and
// every dialog open inside it were unmounted. Found by the product walkthrough (C11 step 88): after "Generate Invoices" the dialog was gone, and with it the message that says how many
// invoices were made and how many skipped. The same refresh closed the invoice dialog after every payment, although the dashboard refetches the invoice to reopen it.

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

async function seeded() {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Finance Admin", superAdmin: false });
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: {
      branchId: branch.id,
      sessionId: session.id,
      ordinal: 1,
      label: "1st Term",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "Primary 1" } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
  await db.feeStructure.create({
    data: { branchId: branch.id, periodId: period.id, classGroupId: group.id, name: "Tuition", amount: 50000 },
  });
  return { branch, admin, session, period, group, arm };
}

async function enrolPupil(ctx: Awaited<ReturnType<typeof seeded>>, first: string, last: string, admissionNo: string) {
  const student = await db.studentRecord.create({
    data: {
      branchId: ctx.branch.id,
      firstName: first,
      lastName: last,
      admissionNo,
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2015-05-15"),
    },
  });
  await db.studentEnrollment.create({
    data: {
      branchId: ctx.branch.id,
      studentId: student.id,
      sessionId: ctx.session.id,
      className: "Primary 1",
      classArmId: ctx.arm.id,
      status: "ACTIVE",
    },
  });
  return student;
}

/// A figure under its label inside the invoice's dialog.
const figure = (dialog: Locator, label: string) => dialog.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");

async function openFinance(page: Page, admin: Awaited<ReturnType<typeof seeded>>["admin"]) {
  await signInThroughUi(page, admin);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance & Fee Invoicing" })).toBeVisible();
}

test("making the term's invoices shows how many were made, and pressing it again shows how many were skipped", async ({ page }) => {
  const ctx = await seeded();
  await enrolPupil(ctx, "Aisha", "Bello", "2026/0001");
  await enrolPupil(ctx, "Zainab", "Musa", "2026/0002");
  await openFinance(page, ctx.admin);
  await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(0);

  await page.getByRole("button", { name: /Batch Generate Invoices/ }).click();
  const dialog = page.getByRole("dialog", { name: "Batch Generate Student Invoices" });
  await dialog.getByLabel("Academic Term / Period").selectOption({ label: "1st Term (2026/2027)" });
  await dialog.getByRole("button", { name: "Generate Invoices", exact: true }).click();
  // the dialog has to STAY, with its result: the refresh the save asks for must not unmount it
  await expect(dialog.getByRole("status")).toContainText("2 new invoices created, 0 existing invoices skipped.");
  await dialog.getByRole("button", { name: "Generate Invoices", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("0 new invoices created, 2 existing invoices skipped.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(2);

  // and the next opening is a new form, not the last one with its result still in it
  await page.getByRole("button", { name: /Batch Generate Invoices/ }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveCount(0);
});

test("after a part payment the invoice stays open with the new figures, and the next payment starts clean", async ({ page }) => {
  const ctx = await seeded();
  const student = await enrolPupil(ctx, "Aisha", "Bello", "2026/0001");
  await db.invoice.create({
    data: {
      branchId: ctx.branch.id,
      studentId: student.id,
      periodId: ctx.period.id,
      invoiceNo: "INV-2026-0001",
      totalAmount: 50000,
      amountPaid: 0,
      status: "UNPAID",
    },
  });
  await openFinance(page, ctx.admin);
  await page.getByRole("button", { name: "View & Pay" }).click();
  const invoice = page.getByRole("dialog", { name: "Invoice INV-2026-0001" });
  await expect(figure(invoice, "Balance Due")).toHaveText("₦50,000.00");

  await invoice.getByRole("button", { name: "Record Payment", exact: true }).click();
  const pay = page.getByRole("dialog", { name: /^Record Offline Payment/ });
  await pay.getByLabel("Payment Amount (₦)").fill("20000");
  await pay.getByLabel("Receipt / Teller Ref (Optional)").fill("POS-83921");
  await pay.getByLabel("Notes / Depositor Name (Optional)").fill("Deposited by Hauwa Bello");
  await pay.getByRole("button", { name: "Record Payment & Issue Receipt", exact: true }).click();
  await expect(pay).toBeHidden();

  // the invoice's own dialog is still there, with what was just paid
  await expect(invoice).toBeVisible();
  await expect(figure(invoice, "Amount Paid")).toHaveText("₦20,000.00");
  await expect(figure(invoice, "Balance Due")).toHaveText("₦30,000.00");

  // and the next payment is a new form: the new balance, and nothing left over from the last one
  await invoice.getByRole("button", { name: "Record Payment", exact: true }).click();
  const again = page.getByRole("dialog", { name: /^Record Offline Payment/ });
  await expect(again.getByLabel("Payment Amount (₦)")).toHaveValue("30000");
  await expect(again.getByLabel("Receipt / Teller Ref (Optional)")).toHaveValue("");
  await expect(again.getByLabel("Notes / Depositor Name (Optional)")).toHaveValue("");
});
