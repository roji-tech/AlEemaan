import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";

// Printing and offering a quiz question back, in a real browser (Task 0041, slice F6b): a member of staff prints a question or a quiz as a PDF (with or without the key, with a reason),
// the print log shows it to the people who review, and a quiz's question is offered back to the question bank. The APIs are tested in tests/api/printing*.spec.ts and
// question-bank-assessments.spec.ts; this is the screen: what is offered to whom, and the API's refusal shown as a sentence. Axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
async function checkBothThemes(page: Page, what: string) {
  const initial = await page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page, `${what} [${theme} theme]`);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `horizontal overflow on ${what} [${theme} theme]`).toBeLessThanOrEqual(innerWidth);
  }
  await page.evaluate((t) => void (document.documentElement.dataset.theme = t), initial);
}

test.describe.configure({ timeout: 120_000 });
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
});

const dialogNamed = (page: Page, name: string): Locator => page.getByRole("dialog", { name, exact: true });
const PROMPT = "Which planet is nearest to the Sun in our solar system?";

/// A branch with the people printing involves: the teacher who prints, a reviewer who reads the log, an administrator.
async function school() {
  const home = await seedInstance();
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Tariq Teacher", superAdmin: false });
  const reviewer = await createUser({ role: Role.TEACHING_STAFF, name: "Rashid Reviewer", superAdmin: false });
  const admin = await createUser({ role: Role.ADMIN, name: "Amina Admin", superAdmin: false });
  await db.questionBankReviewer.create({ data: { userId: reviewer.id, assignedById: admin.id, scope: "GENERAL", branchId: home.id } });
  return { home, teacher, reviewer, admin };
}
type School = Awaited<ReturnType<typeof school>>;

const approved = (s: School) =>
  db.questionBankItem.create({
    data: {
      branchId: s.home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: PROMPT,
      points: 2,
      subjectLabel: "Civics",
      subjectKey: "civics",
      options: [
        { id: "A", text: "Venus" },
        { id: "B", text: "Mercury" },
      ],
      correctAnswer: "B",
      visibility: "PRACTICE",
      status: "APPROVED",
      version: 1,
      submittedById: s.reviewer.id,
      approvedById: s.reviewer.id,
      approvedAt: new Date(),
    },
  });

/// A published quiz of the branch with one question, as a teacher who manages it sees it in Coursework.
async function quizOf(s: School) {
  const subject = await db.subject.create({ data: { branchId: s.home.id, name: "Civics", code: "CIV101" } });
  const group = await db.classGroup.create({ data: { branchId: s.home.id, name: "Grade 4" } });
  return db.quiz.create({
    data: {
      branchId: s.home.id,
      subjectId: subject.id,
      classGroupId: group.id,
      title: "Term One Civics Check",
      instructions: "Answer every question.",
      status: "PUBLISHED",
      questions: {
        create: [
          {
            prompt: "What is the capital of Nigeria?",
            questionType: "MULTIPLE_CHOICE",
            options: [
              { id: "a", text: "Lagos" },
              { id: "b", text: "Abuja" },
            ],
            correctAnswer: "b",
            points: 3,
            sortOrder: 0,
          },
        ],
      },
    },
  });
}

async function openQuestion(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).click();
  return dialogNamed(page, "Question");
}
const tab = (page: Page, name: string) => page.getByRole("tab", { name });

test.describe("printing a question", () => {
  test("a teacher prints it with the key and a reason; a reviewer finds the line in the print log; a teacher who does not review has no Print log", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await school();
    await approved(s);
    await signInThroughUi(page, s.teacher);
    await page.goto("/question-bank");
    // not a reviewer, not an administrator: no Print log tab
    await expect(tab(page, "Print log")).toHaveCount(0);

    const detail = await openQuestion(page, /nearest to the Sun/);
    await detail.getByRole("button", { name: "Print", exact: true }).click();
    const ask = dialogNamed(page, "Print this question");
    await expect(ask).toBeVisible();
    await checkBothThemes(page, "print a question");

    await ask.getByLabel("Include the answer key").check();
    await ask.getByLabel("Reason (optional)").fill("Handout for the Monday revision class");
    const download = page.waitForEvent("download");
    await ask.getByRole("button", { name: "Download PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect(ask).toBeHidden();
    await expect(detail.getByText("The PDF was downloaded and the print is in the print log.")).toBeVisible();

    const log = await db.questionBankPrintLog.findFirstOrThrow({});
    expect(log).toMatchObject({ targetKind: "QUESTION_BANK_ITEM", userId: s.teacher.id, reason: "Handout for the Monday revision class" });

    // the reviewer reads it
    const other = await browser.newContext({ baseURL: baseURL! });
    const reviewerPage = await other.newPage();
    await signInThroughUi(reviewerPage, s.reviewer);
    await reviewerPage.goto("/question-bank");
    await tab(reviewerPage, "Print log").click();
    const rows = reviewerPage.getByRole("list", { name: "Print log" }).locator(":scope > li");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("A question");
    await expect(rows.first()).toContainText("printed by Tariq Teacher");
    await expect(rows.first()).toContainText("Reason: Handout for the Monday revision class");
    await checkBothThemes(reviewerPage, "the print log");
    await other.close();
  });

  test("a print the API refuses is shown as the sentence it sends, and nothing is downloaded", async ({ page }) => {
    const s = await school();
    await approved(s);
    await signInThroughUi(page, s.teacher);
    await page.goto("/question-bank");
    const detail = await openQuestion(page, /nearest to the Sun/);
    await page.route("**/api/v1/question-bank/print", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "FORBIDDEN", message: "This exam is restricted to exam approvers and administrators." } }),
      }),
    );
    await detail.getByRole("button", { name: "Print", exact: true }).click();
    const ask = dialogNamed(page, "Print this question");
    await ask.getByRole("button", { name: "Download PDF" }).click();
    await expect(ask.getByRole("alert")).toContainText("This exam is restricted to exam approvers and administrators.");
    await expect(detail.getByText("The PDF was downloaded and the print is in the print log.")).toHaveCount(0);
    expect(await db.questionBankPrintLog.count()).toBe(0);
  });
});

test.describe("the print log", () => {
  test("lists the lines newest first, filters by what was printed, and shows a handout's recipient and reason", async ({ page }) => {
    const s = await school();
    const pupil = await db.studentRecord.create({
      data: {
        branchId: s.home.id,
        firstName: "Zainab",
        lastName: "Handout",
        gender: "FEMALE",
        dateOfBirth: new Date("2013-05-10"),
        admissionNo: "2026/0007",
        guardianPhone: "+2348011110007",
      },
    });
    const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000);
    await db.questionBankPrintLog.createMany({
      data: [
        {
          branchId: s.home.id,
          userId: s.teacher.id,
          targetKind: "QUIZ",
          targetId: "quiz-1",
          title: "Term One Civics Check",
          watermark: "w1",
          pageCount: 2,
          createdAt: at(5),
        },
        {
          branchId: s.home.id,
          userId: s.teacher.id,
          targetKind: "FORM",
          targetId: "form-1",
          title: "Fractions practice",
          watermark: "w2",
          pageCount: 1,
          reason: "Take-home copy",
          recipientStudentId: pupil.id,
          createdAt: at(1),
        },
      ],
    });
    await signInThroughUi(page, s.admin);
    await page.goto("/question-bank");
    await tab(page, "Print log").click();
    const rows = page.getByRole("list", { name: "Print log" }).locator(":scope > li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Fractions practice");
    await expect(rows.nth(0)).toContainText("Handout for Zainab Handout.");
    await expect(rows.nth(0)).toContainText("Reason: Take-home copy");
    await expect(rows.nth(1)).toContainText("Term One Civics Check");
    await expect(rows.nth(1)).toContainText("2 pages");

    await page.getByLabel("What was printed").selectOption("QUIZ");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Term One Civics Check");
    await page.getByLabel("What was printed").selectOption("QUESTION_BANK_ITEM");
    await expect(page.getByText("Nothing of that kind has been printed.")).toBeVisible();
    await checkBothThemes(page, "the print log, filtered");
  });
});

test.describe("a quiz's questions", () => {
  test("the Questions button lists them; one is offered to the question bank and appears in My questions; the quiz can be printed from the dialog", async ({
    page,
  }) => {
    const s = await school();
    await quizOf(s);
    await signInThroughUi(page, { email: s.admin.email, password: DEFAULT_PASSWORD });
    await page.goto("/lms");
    await page.getByRole("tab", { name: /Quizzes & Assessments/i }).click();
    await page.getByRole("button", { name: "Questions of Term One Civics Check" }).click();
    const list = dialogNamed(page, "Quiz questions");
    await expect(list).toBeVisible();
    await expect(list.getByRole("list", { name: "Questions of the quiz" }).locator(":scope > li")).toHaveCount(1);
    await expect(list).toContainText("What is the capital of Nigeria?");
    await expect(list).toContainText("One correct answer · 3 points");
    await checkBothThemes(page, "a quiz's questions");

    await list.getByRole("button", { name: "Offer to the question bank" }).click();
    const offer = dialogNamed(page, "Offer to the question bank");
    await expect(offer.getByLabel("Subject")).toHaveValue("Civics");
    await offer.getByLabel("Topic (optional)").fill("Government");
    await offer.getByLabel("Difficulty (optional)").selectOption("3");
    await offer.getByRole("button", { name: "Offer it" }).click();
    await expect(offer).toBeHidden();
    await expect(list.getByText("Offered to the question bank.")).toBeVisible();
    await expect(list.getByText(/Offered\. A reviewer will look at it/)).toBeVisible();
    const offered = await db.questionBankItem.findFirstOrThrow({ where: { prompt: "What is the capital of Nigeria?" } });
    expect(offered).toMatchObject({ status: "PENDING", topic: "Government", difficulty: 3, subjectLabel: "Civics" });

    const download = page.waitForEvent("download");
    await list.getByRole("button", { name: "Print this quiz" }).click();
    await dialogNamed(page, "Print this quiz").getByRole("button", { name: "Download PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect(list.getByText("The PDF was downloaded and the print is in the print log.")).toBeVisible();
    expect(await db.questionBankPrintLog.count({ where: { targetKind: "QUIZ" } })).toBe(1);
  });

  test("an offer the API refuses is shown as the sentence it sends", async ({ page }) => {
    const s = await school();
    await quizOf(s);
    await signInThroughUi(page, { email: s.admin.email, password: DEFAULT_PASSWORD });
    await page.goto("/lms");
    await page.getByRole("tab", { name: /Quizzes & Assessments/i }).click();
    await page.getByRole("button", { name: "Questions of Term One Civics Check" }).click();
    const list = dialogNamed(page, "Quiz questions");
    await page.route("**/api/v1/question-bank/items/offer-back", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "FORBIDDEN", message: "You may only offer questions from quizzes you manage." } }),
      }),
    );
    await list.getByRole("button", { name: "Offer to the question bank" }).click();
    const offer = dialogNamed(page, "Offer to the question bank");
    await offer.getByRole("button", { name: "Offer it" }).click();
    await expect(offer.getByRole("alert")).toContainText("You may only offer questions from quizzes you manage.");
    expect(await db.questionBankItem.count()).toBe(0);
  });
});
