import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { resetDatabase, seedInstance, db } from "../support/db";
import { Gender } from "@prisma/client";

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

test.describe("Slice P8 — Parent & Student Portal UI & WCAG 2.2 AA", () => {
  test("portal login, sibling switcher, results card, billing, LMS, and passes WCAG 2.2 AA", async ({ page }) => {
    const branch = await db.branch.findFirstOrThrow();

    // 1. Setup Academic Session, Class & Arm
    const session = await db.academicSession.create({
      data: {
        branchId: branch.id,
        label: "2025/2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-07-20"),
        status: "ACTIVE",
      },
    });

    const period = await db.academicPeriod.create({
      data: {
        branchId: branch.id,
        sessionId: session.id,
        ordinal: 1,
        label: "1st Term",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2025-12-15"),
        isCurrent: true,
      },
    });

    const classGroup = await db.classGroup.create({
      data: {
        branchId: branch.id,
        name: "JSS 1",
        sortOrder: 1,
      },
    });

    const classArm = await db.classArm.create({
      data: {
        branchId: branch.id,
        classGroupId: classGroup.id,
        name: "Gold",
      },
    });

    // 2. Setup Sibling Students
    const guardianPhone = "+2348011112222";
    const guardianEmail = "musa.family@example.com";

    const student1 = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: "Fatima",
        lastName: "Musa",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2013-05-10T00:00:00Z"),
        admissionNo: "2025/0001",
        guardianName: "Alhaji Musa",
        guardianPhone,
        guardianEmail,
      },
    });

    const student2 = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: "Ibrahim",
        lastName: "Musa",
        gender: Gender.MALE,
        dateOfBirth: new Date("2015-08-22T00:00:00Z"),
        admissionNo: "2025/0002",
        guardianName: "Alhaji Musa",
        guardianPhone,
        guardianEmail,
      },
    });

    await db.studentEnrollment.createMany({
      data: [
        {
          studentId: student1.id,
          branchId: branch.id,
          sessionId: session.id,
          className: "JSS 1",
          arm: "Gold",
          classArmId: classArm.id,
          status: "ACTIVE",
        },
        {
          studentId: student2.id,
          branchId: branch.id,
          sessionId: session.id,
          className: "JSS 1",
          arm: "Gold",
          classArmId: classArm.id,
          status: "ACTIVE",
        },
      ],
    });

    // Create Invoice for student 1
    await db.invoice.create({
      data: {
        branchId: branch.id,
        studentId: student1.id,
        periodId: period.id,
        invoiceNo: "INV-2025-0001",
        totalAmount: 45000,
        amountPaid: 20000,
        status: "PARTIALLY_PAID",
      },
    });

    // --- A. Login Screen Accessibility Audit ---
    await page.goto("/portal");
    await expect(page.locator("h1")).toContainText("AlEemaan Portal");
    await expect(page.locator("#admissionNo")).toBeVisible();
    await expectAccessible(page, "Portal Login Screen");

    // --- B. Log in as Fatima Musa via Guardian Phone ---
    await page.fill("#admissionNo", "2025/0001");
    await page.fill("#secret", "08011112222");
    await page.click("button:has-text('Access Student Portal')");

    // Wait for Dashboard
    await expect(page.locator("header")).toContainText("AlEemaan Portal");
    await expect(page.locator("h2")).toContainText("Fatima Musa");

    // --- C. Overview Tab Accessibility Audit ---
    await expectAccessible(page, "Portal Overview Tab");

    // Verify Sibling Selector is visible and lists both siblings
    const siblingSelect = page.locator("#siblingSelect");
    await expect(siblingSelect).toBeVisible();
    await expect(siblingSelect).toContainText("Fatima Musa");
    await expect(siblingSelect).toContainText("Ibrahim Musa");

    // --- D. Results Tab Accessibility Audit ---
    await page.click("button[role='tab']:has-text('Academic Results')");
    await expect(page.locator("main")).toBeVisible();
    await expectAccessible(page, "Portal Academic Results Tab");

    // --- E. Fees & Billing Tab Accessibility Audit ---
    await page.click("button[role='tab']:has-text('Fees & Billing')");
    await expect(page.locator("text=Fee Invoices")).toBeVisible();
    await expect(page.locator("text=INV-2025-0001")).toBeVisible();
    await expectAccessible(page, "Portal Fees & Billing Tab");

    // Open Invoice Details Modal
    await page.click("button:has-text('Pay / View')");
    await expect(page.locator("div[role='dialog']")).toBeVisible();
    await expectAccessible(page, "Portal Invoice Details Modal");
    await page.click("button:has-text('Done')");

    // --- F. Coursework (LMS) Tab Accessibility Audit ---
    await page.click("button[role='tab']:has-text('Coursework (LMS)')");
    await expect(page.locator("text=Assignments & Coursework")).toBeVisible();
    await expectAccessible(page, "Portal Coursework (LMS) Tab");

    // --- G. Sibling Switcher Switch to Ibrahim Musa ---
    await siblingSelect.selectOption(student2.id);
    await page.click("button[role='tab']:has-text('Overview')");
    await expect(page.locator("h2")).toContainText("Ibrahim Musa");

    // --- H. Sign Out ---
    await page.locator("button:has-text('Sign Out'):visible").click();
    await expect(page.locator("h1")).toContainText("AlEemaan Portal");
  });
});
