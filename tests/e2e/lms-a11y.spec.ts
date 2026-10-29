import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
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

test.describe("Slice P5 — LMS & Coursework Accessibility & Interactive Workflows", () => {
  test("renders Coursework LMS Console, tests tabs, modals, speed grader, and passes WCAG 2.2 AA", async ({ page }) => {
    const branch = await seedInstance();
    const admin = await createUser({ role: Role.ADMIN, name: "LMS Admin", superAdmin: false });

    // Seed Subject and Class Group
    const subject = await db.subject.create({
      data: {
        branchId: branch.id,
        name: "Islamic Studies",
        code: "ISL101",
      },
    });

    const classGroup = await db.classGroup.create({
      data: {
        branchId: branch.id,
        name: "Grade 4",
      },
    });

    // Seed Assignment
    const assignment = await db.assignment.create({
      data: {
        branchId: branch.id,
        subjectId: subject.id,
        classGroupId: classGroup.id,
        title: "Pillars of Faith Essay",
        description: "Write an essay explaining the 6 articles of faith in Islam.",
        dueDate: new Date(Date.now() + 86400000 * 7),
        totalPoints: 100,
        status: "PUBLISHED",
      },
    });

    // Seed Student and StudentRecord
    await createUser({
      role: Role.STUDENT,
      name: "Tariq Ali",
      superAdmin: false,
    });

    const studentRecord = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        admissionNo: "STU-2026-001",
        firstName: "Tariq",
        lastName: "Ali",
        gender: "MALE",
        dateOfBirth: new Date("2012-05-10"),
      },
    });

    // Seed Submission
    await db.assignmentSubmission.create({
      data: {
        branchId: branch.id,
        assignmentId: assignment.id,
        studentId: studentRecord.id,
        content: "Here is my detailed essay on the six pillars of iman...",
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    // Seed Learning Material
    await db.learningMaterial.create({
      data: {
        branchId: branch.id,
        subjectId: subject.id,
        classGroupId: classGroup.id,
        title: "Fiqh & Hadith Study Pack",
        description: "Comprehensive notes for semester 1 revision.",
        content: "Key principles of Taharah and Salah with Quranic citations.",
      },
    });

    // Seed Quiz
    await db.quiz.create({
      data: {
        branchId: branch.id,
        subjectId: subject.id,
        title: "Tawheed & Aqeedah Quick Check",
        instructions: "Answer all questions to test your knowledge.",
        timeLimitMinutes: 15,
        passingScore: 70,
        status: "PUBLISHED",
        questions: {
          create: [
            {
              prompt: "How many articles of faith (iman) are there in Islam?",
              questionType: "MULTIPLE_CHOICE",
              options: [
                { id: "opt-1", text: "5" },
                { id: "opt-2", text: "6" },
                { id: "opt-3", text: "7" },
              ],
              correctAnswer: "opt-2",
              points: 10,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    // Sign in through UI
    await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });

    // Navigate to LMS Coursework page
    await page.goto("/lms");
    await page.waitForLoadState("networkidle");

    // Verify Page Header and Tablist
    await expect(page.getByRole("heading", { name: "Coursework & LMS" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Coursework sections" })).toBeVisible();

    // Verify Assignment card rendered
    await expect(page.getByText("Pillars of Faith Essay")).toBeVisible();
    await expect(page.locator("span").filter({ hasText: "Islamic Studies" }).first()).toBeVisible();

    // WCAG 2.2 AA audit on main LMS dashboard
    await expectAccessible(page, "Coursework Assignments Dashboard");

    // Open Speed Grader Modal
    await page.getByRole("button", { name: "Speed Grader" }).first().click();
    await page.waitForSelector("dialog[open]");
    await expect(page.getByText(/Speed Grader: Pillars of Faith Essay/i)).toBeVisible();
    await expect(page.getByText("Tariq Ali").first()).toBeVisible();
    await expect(page.getByText("STU-2026-001").first()).toBeVisible();

    // Audit Speed Grader Modal
    await expectAccessible(page, "Speed Grader Modal");

    // Close Speed Grader Modal
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    // Switch to Study Materials Tab
    await page.getByRole("tab", { name: /Study Materials & Notes/i }).click();
    await expect(page.getByText("Fiqh & Hadith Study Pack")).toBeVisible();
    await expect(page.getByText("Key principles of Taharah")).toBeVisible();

    // Audit Study Materials Tab
    await expectAccessible(page, "Study Materials Tab");

    // Switch to Quizzes & Assessments Tab
    await page.getByRole("tab", { name: /Quizzes & Assessments/i }).click();
    await expect(page.getByText("Tawheed & Aqeedah Quick Check")).toBeVisible();

    // Audit Quizzes Tab
    await expectAccessible(page, "Quizzes & Assessments Tab");

    // Staff do not take quizzes here: pupils take them in the portal (see portal-coursework.spec.ts).
    await expect(page.getByRole("button", { name: "Take Quiz" })).toHaveCount(0);
  });
});
