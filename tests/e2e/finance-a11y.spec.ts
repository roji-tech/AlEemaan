import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  if (results.violations.length > 0) {
    console.log(
      "AXE VIOLATIONS ON " + what + ":",
      JSON.stringify(
        results.violations.map((v) => ({
          id: v.id,
          help: v.help,
          nodes: v.nodes.map((n) => ({ html: n.html, failureSummary: n.failureSummary })),
        })),
        null,
        2,
      ),
    );
  }
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.describe("Slice P4 — Finance & Billing Accessibility & Workflows", () => {
  test("renders Invoices Dashboard, verifies detail & payment modals, and passes WCAG 2.2 AA audits", async ({ page }) => {
    const branch = await seedInstance();
    const admin = await createUser({ role: Role.ADMIN, name: "Finance Admin", superAdmin: false });

    // Seed academic session, period, class group, and student
    const session = await db.academicSession.create({
      data: {
        branchId: branch.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-20"),
      },
    });

    const period = await db.academicPeriod.create({
      data: {
        branchId: branch.id,
        sessionId: session.id,
        ordinal: 1,
        label: "First Term 2026",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
      },
    });

    const group = await db.classGroup.create({
      data: {
        branchId: branch.id,
        name: "Basic 1",
      },
    });

    const student = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        admissionNo: "ALM-2026-FIN",
        firstName: "Zainab",
        lastName: "Umar",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2015-05-15"),
      },
    });

    // Seed fee structure
    await db.feeStructure.create({
      data: {
        branchId: branch.id,
        periodId: period.id,
        classGroupId: group.id,
        name: "Tuition & Development Levy",
        amount: 35000,
      },
    });

    // Seed invoice
    const invoice = await db.invoice.create({
      data: {
        branchId: branch.id,
        studentId: student.id,
        periodId: period.id,
        invoiceNo: "INV-2026-0001",
        totalAmount: 35000,
        amountPaid: 10000,
        status: "PARTIALLY_PAID",
      },
    });

    // Seed partial payment
    await db.payment.create({
      data: {
        branchId: branch.id,
        invoiceId: invoice.id,
        receiptNo: "REC-2026-0001",
        amount: 10000,
        provider: "MANUAL",
        providerRef: "MAN_TRF_1001",
        status: "SUCCESS",
        channel: "Direct Bank Transfer",
        paidAt: new Date(),
      },
    });

    await signInThroughUi(page, admin);
    await page.goto("/finance");

    await expect(page.getByRole("heading", { name: "Finance & Fee Invoicing" })).toBeVisible();
    await expect(page.getByText("INV-2026-0001")).toBeVisible();
    await expect(page.getByText("Zainab Umar")).toBeVisible();

    // Check accessibility of Invoices Dashboard
    await expectAccessible(page, "Finance Invoices Dashboard");

    // Open Batch Generate Invoices modal
    await page.getByRole("button", { name: "Batch Generate Invoices" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Batch Generate Student Invoices" })).toBeVisible();

    // Check accessibility of Batch Invoices modal
    await expectAccessible(page, "Batch Generate Invoices Modal");

    // Close Batch modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Open Invoice Details modal
    await page.getByRole("button", { name: "View & Pay" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invoice INV-2026-0001" })).toBeVisible();

    // Check accessibility of Invoice Detail Modal
    await expectAccessible(page, "Invoice Detail Modal");

    // Open Record Payment modal from details
    await page.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByRole("heading", { name: /Record Offline Payment/i })).toBeVisible();
    await expectAccessible(page, "Record Payment Modal");
    await page.getByRole("button", { name: "Cancel" }).click();

    // Open Apply Discount modal from details
    await page.getByRole("button", { name: "Waiver / Discount" }).click();
    await expect(page.getByRole("heading", { name: /Apply Fee Waiver/i })).toBeVisible();
    await expectAccessible(page, "Discount Modal");
    await page.getByRole("button", { name: "Cancel" }).click();

    // Close Invoice Details modal
    await page.getByRole("button", { name: "Close" }).first().click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("renders Fee Structures panel, opens fee creation modal, and passes WCAG 2.2 AA audits", async ({ page }) => {
    const branch = await seedInstance();
    const admin = await createUser({ role: Role.ADMIN, name: "Finance Admin", superAdmin: false });

    // Seed academic session and period
    const session = await db.academicSession.create({
      data: {
        branchId: branch.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-20"),
      },
    });

    const period = await db.academicPeriod.create({
      data: {
        branchId: branch.id,
        sessionId: session.id,
        ordinal: 1,
        label: "First Term 2026",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-12-15"),
      },
    });

    await db.feeStructure.create({
      data: {
        branchId: branch.id,
        periodId: period.id,
        name: "Termly Tuition Fee",
        amount: 50000,
      },
    });

    await signInThroughUi(page, admin);
    await page.goto("/finance");

    // Switch to Fee Structures tab
    await page.getByRole("tab", { name: /Fee Schedules/i }).click();
    await expect(page.getByText("Termly Tuition Fee")).toBeVisible();

    // Check accessibility of Fee Structures Panel
    await expectAccessible(page, "Fee Structures Panel");

    // Open Add Fee Item modal
    await page.getByRole("button", { name: /Add Fee Item/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create New Fee Structure Item" })).toBeVisible();

    // Check accessibility of Fee Structure modal
    await expectAccessible(page, "Create Fee Structure Modal");

    // Close modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
