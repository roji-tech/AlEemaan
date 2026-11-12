import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0064: a number field of the Coursework dialogs shows what was typed. The assignment's "Total Points" and a quiz question's "Points" used to turn an empty field into 0 or 1 at once, so
// typing "20" over "100" gave "020" and typing "7" over "5" gave "17".

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async ({ page }) => {
  await resetDatabase();
  const branch = await seedInstance();
  await db.subject.create({ data: { branchId: branch.id, name: "Civic", code: "CIV" } });
  const admin = await createUser({ role: Role.ADMIN, name: "Coursework Admin", superAdmin: false });
  await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
  await page.goto("/lms");
  await expect(page.getByRole("heading", { name: "Coursework & LMS" })).toBeVisible();
});

test("the assignment's Total Points shows 20 after 20 is typed over 100, and the assignment is made with 20 points", async ({ page }) => {
  await page.getByRole("button", { name: "+ Create Assignment" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Coursework Assignment" });
  await dialog.getByLabel("Assignment Title").fill("Points check");
  const points = dialog.getByLabel("Total Points");
  await expect(points).toHaveValue("100");
  await points.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await expect(points).toHaveValue("");
  await page.keyboard.type("20");
  await expect(points).toHaveValue("20");
  await dialog.getByRole("button", { name: "Publish Assignment" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("20 pts")).toBeVisible();
});

test("a quiz question's Points shows 7 after 7 is typed over 5, and a question left empty counts as 1 point", async ({ page }) => {
  await page.getByRole("tab", { name: /Quizzes & Assessments/ }).click();
  await page.getByRole("button", { name: "+ Create Quiz" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Interactive Quiz / Test" });
  const question = dialog.getByRole("group", { name: "Question 1" });
  const points = question.getByLabel("Points");
  await expect(points).toHaveValue("5");
  await points.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await expect(points).toHaveValue("");
  await page.keyboard.type("7");
  await expect(points).toHaveValue("7");

  await dialog.getByLabel("Quiz Title").fill("Points quiz");
  await question.getByLabel("Question prompt").fill("What is 2+2?");
  await question.getByLabel("Option 1", { exact: true }).fill("Four");
  await question.getByLabel("Option 2", { exact: true }).fill("Five");
  await dialog.getByRole("button", { name: "Save & Publish Quiz" }).click();
  await expect(dialog).toBeHidden();
  const quiz = await db.quiz.findFirstOrThrow({ where: { title: "Points quiz" }, include: { questions: true } });
  expect(quiz.questions.map((q) => q.points)).toEqual([7]);
});
