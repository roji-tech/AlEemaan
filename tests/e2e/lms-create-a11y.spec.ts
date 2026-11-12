import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";
import { setTheme } from "../support/theme";

// The three "create" dialogs of Coursework (an assignment, a study material, a quiz) and the quiz builder's questions: every control has a name that a screen reader reads, in both
// themes (task 0062). The existing lms-a11y spec scans the lists and the Speed Grader and never opens a create dialog, which is why the quiz builder's unnamed controls were not seen.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, what: string) {
  for (const theme of ["dark", "light"]) {
    // the shared helper flips the theme and waits for the colour transitions in ONE step (a scan between the two sampled a colour that is neither theme's)
    await setTheme(page, theme);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map(
        (v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => `${n.target.join(" ")} (${n.any[0]?.message ?? ""})`).join(" | ")}`,
      ),
      `accessibility violations on ${what} (${theme})`,
    ).toEqual([]);
  }
  await setTheme(page, "dark");
}

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async ({ page }) => {
  await resetDatabase();
  const branch = await seedInstance();
  await db.subject.create({ data: { branchId: branch.id, name: "Civic", code: "CIV" } });
  await db.classGroup.create({ data: { branchId: branch.id, name: "Grade 4" } });
  const admin = await createUser({ role: Role.ADMIN, name: "Coursework Admin", superAdmin: false });
  await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
  await page.goto("/lms");
  await expect(page.getByRole("heading", { name: "Coursework & LMS" })).toBeVisible();
});

test.describe("the create dialogs of Coursework", () => {
  test("the assignment and the material dialogs pass the accessibility check in both themes", async ({ page }) => {
    await page.getByRole("button", { name: "+ Create Assignment" }).click();
    const assignment = page.getByRole("dialog", { name: "Create Coursework Assignment" });
    await expect(assignment).toBeVisible();
    await expectAccessible(page, "the assignment dialog");
    await page.keyboard.press("Escape");
    await expect(assignment).toBeHidden();

    await page.getByRole("tab", { name: /Study Materials & Notes/ }).click();
    await page.getByRole("button", { name: "+ Add Material" }).click();
    const material = page.getByRole("dialog", { name: "Add Learning Material" });
    await expect(material).toBeVisible();
    await expectAccessible(page, "the material dialog");
  });

  test("the quiz builder: each question is a named group, every control in it has a name, and the dialog passes the accessibility check in both themes", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: /Quizzes & Assessments/ }).click();
    await page.getByRole("button", { name: "+ Create Quiz" }).click();
    const quiz = page.getByRole("dialog", { name: "Create Interactive Quiz / Test" });
    await expect(quiz).toBeVisible();

    // one question of each kind
    await quiz.getByRole("button", { name: "+ Add Question" }).click();
    await quiz.getByRole("button", { name: "+ Add Question" }).click();
    const first = quiz.getByRole("group", { name: "Question 1" });
    const second = quiz.getByRole("group", { name: "Question 2" });
    const third = quiz.getByRole("group", { name: "Question 3" });
    await expect(third).toBeVisible();
    await second.getByLabel("Question type").selectOption("TRUE_FALSE");
    await third.getByLabel("Question type").selectOption("SHORT_ANSWER");

    // the multiple-choice question: a prompt, two options, the correct one marked, its points
    await first.getByLabel("Question prompt").fill("What is 2+2?");
    await first.getByLabel("Option 1", { exact: true }).fill("Three");
    await first.getByLabel("Option 2", { exact: true }).fill("Four");
    await first.getByRole("radio", { name: "Option 2 is the correct answer" }).check();
    await expect(first.getByRole("radio", { name: "Option 2 is the correct answer" })).toBeChecked();
    await expect(first.getByLabel("Points")).toHaveValue("5");

    // the others
    await second.getByLabel("Question prompt").fill("The sun is a star.");
    await second.getByRole("radio", { name: "True", exact: true }).check();
    await third.getByLabel("Question prompt").fill("Name the capital of Nigeria.");
    await third.getByLabel("Expected exact keyword or phrase").fill("Abuja");

    // a question can be removed by a name that says which
    await expect(quiz.getByRole("button", { name: "Remove question 3" })).toBeVisible();

    await expectAccessible(page, "the quiz builder with three questions");
  });
});
