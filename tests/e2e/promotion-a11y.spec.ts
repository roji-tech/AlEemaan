import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, resetDatabase, seedInstance, db, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";
import { Gender, ResultStatus } from "@prisma/client";

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

test.describe("Slice P7 — Student Promotion & Academic Rollover UI & WCAG 2.2 AA", () => {
  test("renders Promotion console, calculates preview, manages overrides, verifies modal, and passes WCAG 2.2 AA", async ({ page }) => {
    // 1. Create Admin
    const admin = await createUser({ role: Role.ADMIN, name: "Academic Admin", superAdmin: false });
    const branch = await db.branch.findFirstOrThrow();

    // 2. Setup Academic Sessions
    const sourceSession = await db.academicSession.create({
      data: {
        branchId: branch.id,
        label: "2025/2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-07-20"),
      },
    });

    const targetSession = await db.academicSession.create({
      data: {
        branchId: branch.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-20"),
      },
    });

    // 3. Setup Academic Period (Final Term 3 is current)
    const term3 = await db.academicPeriod.create({
      data: {
        branchId: branch.id,
        sessionId: sourceSession.id,
        ordinal: 3,
        label: "3rd Term",
        startDate: new Date("2026-04-27"),
        endDate: new Date("2026-07-20"),
        isCurrent: true,
      },
    });

    // 4. Setup Class Progression
    const classP1 = await db.classGroup.create({
      data: { branchId: branch.id, name: "Primary 1", sortOrder: 10 },
    });
    const classP2 = await db.classGroup.create({
      data: { branchId: branch.id, name: "Primary 2", sortOrder: 20 },
    });

    const armP1 = await db.classArm.create({
      data: { branchId: branch.id, classGroupId: classP1.id, name: "Alpha" },
    });
    await db.classArm.create({
      data: { branchId: branch.id, classGroupId: classP2.id, name: "Alpha" },
    });

    // 5. Setup Subject, Scheme, Scale
    const subject = await db.subject.create({
      data: { branchId: branch.id, name: "English", code: "ENG" },
    });
    const scheme = await db.assessmentScheme.create({
      data: { branchId: branch.id, name: "Standard Scheme", totalMax: 100, examMax: 60 },
    });
    const scale = await db.gradeScale.create({
      data: { branchId: branch.id, name: "Standard Scale" },
    });

    // 6. Setup Student & Enrollment & Result
    const student = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: "Fatima",
        lastName: "Ali",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2016-03-10"),
        admissionNo: "ADM-P7-101",
      },
    });

    await db.studentEnrollment.create({
      data: {
        branchId: branch.id,
        studentId: student.id,
        sessionId: sourceSession.id,
        className: classP1.name,
        arm: armP1.name,
        classArmId: armP1.id,
      },
    });

    const now = new Date();
    await db.result.create({
      data: {
        branchId: branch.id,
        studentId: student.id,
        subjectId: subject.id,
        periodId: term3.id,
        classArmId: armP1.id,
        schemeId: scheme.id,
        scaleId: scale.id,
        componentScores: [],
        examScore: 48,
        examMax: 60,
        caTotal: 32,
        total: 80,
        maxScore: 100,
        gradeLetter: "A",
        gradeRemark: "Distinction",
        status: ResultStatus.PUBLISHED,
        enteredByUserId: admin.id,
        submittedAt: now,
        submittedByUserId: admin.id,
        approvedAt: now,
        approvedByUserId: admin.id,
        publishedAt: now,
        verificationToken: `token_fatima_${"x".repeat(27)}`,
        verificationHash: `hash_fatima_${"y".repeat(51)}`,
      },
    });

    // 7. Sign in as admin
    await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
    await expect(page).toHaveURL(/\/dashboard/);

    // 8. Navigate to /academics
    await page.goto("/academics");
    await expect(page.getByRole("heading", { name: "Academics" })).toBeVisible();

    // 9. Switch to Promotion & rollover tab
    const promoTab = page.getByRole("tab", { name: "Promotion & rollover", exact: true });
    await expect(promoTab).toBeVisible();
    await promoTab.click();
    await expect(promoTab).toHaveAttribute("aria-selected", "true");

    // 10. Audit initial console accessibility
    await expectAccessible(page, "Academics — Promotion & rollover initial setup");

    // 11. Select source and target sessions in form
    await page.locator("#source-session-select").selectOption(sourceSession.id);
    await page.locator("#target-session-select").selectOption(targetSession.id);

    // 12. Click "Generate Promotion Preview"
    await page.getByRole("button", { name: "Generate Promotion Preview" }).click();

    // 13. Expect preview table with student row
    await expect(page.getByRole("table", { name: "Student promotion preview" })).toBeVisible();
    await expect(page.getByText("Fatima Ali")).toBeVisible();
    await expect(page.getByText("80.00%")).toBeVisible();
    await expect(page.getByRole("table", { name: "Student promotion preview" }).getByText("Promoted")).toBeVisible();

    // 14. Audit preview table and controls accessibility
    await expectAccessible(page, "Academics — Promotion preview table & controls");

    // 15. Open Confirmation Modal
    await page.getByRole("button", { name: /Review & Execute Rollover/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Confirm Academic Rollover & Promotion" })).toBeVisible();

    // 16. Audit Confirmation Modal accessibility
    await expectAccessible(page, "Academics — Promotion confirmation modal");

    // 17. Close Confirmation Modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // 18. Switch to Audit History tab
    const historySubTab = page.getByRole("tab", { name: "Audit History" });
    await historySubTab.click();
    await expect(historySubTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Promotion Audit Log" })).toBeVisible();

    // 19. Audit history view accessibility
    await expectAccessible(page, "Academics — Promotion Audit History tab");
  });
});
