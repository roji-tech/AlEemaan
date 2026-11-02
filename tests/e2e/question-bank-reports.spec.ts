import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { signInThroughUi } from "./helpers";

// The question bank's reports in a real browser (Task 0041, slice F6a): a teacher reports a problem on a question, a reviewer reads the reports and answers them (and, for a fixed
// question, corrects the assessments that copied it). The APIs are tested in tests/api/question-reports.spec.ts and question-report-regrade.spec.ts; this is the screen: what is
// offered to whom, what is said when the person gets it wrong, and the API's refusal shown as a sentence. Axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes.

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
const SHORT_REASON_SENTENCE = "Say what is wrong in at least 5 characters.";
const NO_REASON_SENTENCE = "Give a reason, at least 3 characters.";

/// A branch with the people a report involves: the teacher who wrote the question, another who reports it, a reviewer (the one the API lets resolve), and a pupil whose name must never be shown.
async function school() {
  const home = await seedInstance();
  const writer = await createUser({ role: Role.TEACHING_STAFF, name: "Wale Writer", superAdmin: false });
  const reporter = await createUser({ role: Role.TEACHING_STAFF, name: "Tariq Reporter", superAdmin: false });
  const reviewer = await createUser({ role: Role.TEACHING_STAFF, name: "Rashid Reviewer", superAdmin: false });
  const admin = await createUser({ role: Role.ADMIN, name: "Amina Admin", superAdmin: false });
  await db.questionBankReviewer.create({ data: { userId: reviewer.id, assignedById: admin.id, scope: "GENERAL", branchId: home.id } });
  const pupil = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Zainab",
      lastName: "Hiddenname",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
      guardianPhone: "+2348011110001",
    },
  });
  return { home, writer, reporter, reviewer, admin, pupil };
}
type School = Awaited<ReturnType<typeof school>>;

/// An approved question of the branch (version 1, the key is "B"), written by `school.writer`.
const approved = (s: School, prompt = PROMPT) =>
  db.questionBankItem.create({
    data: {
      branchId: s.home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt,
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
      submittedById: s.writer.id,
      approvedById: s.reviewer.id,
      approvedAt: new Date(),
    },
  });
type Item = Awaited<ReturnType<typeof approved>>;

const teacherReport = (s: School, item: Item, reason = "The key says Mercury but the picture shows Venus.") =>
  db.questionReport.create({
    data: {
      branchId: s.home.id,
      itemId: item.id,
      itemVersion: item.version,
      reporterRole: "TEACHER",
      reporterSection: "Main Branch",
      reporterUserId: s.reporter.id,
      reason,
    },
  });
const pupilReport = (s: School, item: Item, reason = "I think two of the answers are right.") =>
  db.questionReport.create({
    data: {
      branchId: s.home.id,
      itemId: item.id,
      itemVersion: item.version,
      reporterRole: "PUPIL",
      reporterSection: "JSS",
      reporterStudentId: s.pupil.id,
      reason,
    },
  });

async function openQuestion(page: Page, name: RegExp) {
  await page.getByRole("button", { name }).click();
  return dialogNamed(page, "Question");
}
const reportRows = (page: Page): Locator => page.getByRole("list", { name: "Reports" }).locator(":scope > li");

test.describe("a teacher reports a problem", () => {
  test("it is offered on an approved question someone else wrote; a short reason is refused on the screen; a second report is refused in the API's words", async ({
    page,
  }) => {
    const s = await school();
    const item = await approved(s);
    await signInThroughUi(page, s.reporter);
    await page.goto("/question-bank");
    const detail = await openQuestion(page, /nearest to the Sun/);
    await expect(detail.getByRole("button", { name: "Report a problem" })).toBeVisible();

    await detail.getByRole("button", { name: "Report a problem" }).click();
    const ask = dialogNamed(page, "Report a problem with this question");
    await expect(ask).toBeVisible();
    await checkBothThemes(page, "report a problem");

    // nothing typed, then too little: told in words, and nothing is sent
    await ask.getByRole("button", { name: "Send report" }).click();
    await expect(ask.getByText(SHORT_REASON_SENTENCE)).toBeVisible();
    await ask.getByLabel("What is wrong with it?").fill("abc");
    await ask.getByRole("button", { name: "Send report" }).click();
    await expect(ask.getByText(SHORT_REASON_SENTENCE)).toBeVisible();
    expect(await db.questionReport.count()).toBe(0);

    await ask.getByLabel("What is wrong with it?").fill("The key says Mercury but the picture shows Venus.");
    await ask.getByRole("button", { name: "Send report" }).click();
    await expect(ask).toBeHidden();
    await expect(detail.getByText("Your report went to the reviewers.")).toBeVisible();
    const filed = await db.questionReport.findFirstOrThrow({});
    expect(filed).toMatchObject({
      itemId: item.id,
      reporterRole: "TEACHER",
      reporterUserId: s.reporter.id,
      status: "OPEN",
      itemVersion: 1,
    });
    expect(filed.reason).toBe("The key says Mercury but the picture shows Venus.");

    // a person has one waiting report on a question: the API says so, the screen shows its sentence and the first report stays the only one
    await detail.getByRole("button", { name: "Report a problem" }).click();
    await dialogNamed(page, "Report a problem with this question")
      .getByLabel("What is wrong with it?")
      .fill("The picture is also blurred.");
    await dialogNamed(page, "Report a problem with this question").getByRole("button", { name: "Send report" }).click();
    await expect(dialogNamed(page, "Report a problem with this question").getByRole("alert")).toContainText(
      "You have already reported this question; your report is waiting for a reviewer.",
    );
    expect(await db.questionReport.count()).toBe(1);
  });

  test("it is not offered on a question the person wrote, and the switch for teachers' reports is respected in the API's words", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await school();
    await approved(s);
    await signInThroughUi(page, s.writer);
    await page.goto("/question-bank");
    const own = await openQuestion(page, /nearest to the Sun/);
    await expect(own).toContainText("Written by: You");
    await expect(own.getByRole("button", { name: "Report a problem" })).toHaveCount(0);

    // reporting by teachers switched off for the school: the button is still offered (the screen does not read settings), the API refuses, and the sentence is shown
    await db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.reports.teachers", value: false as never, status: "APPROVED" } });
    const other = await browser.newContext({ baseURL: baseURL! });
    const reporterPage = await other.newPage();
    await signInThroughUi(reporterPage, s.reporter);
    await reporterPage.goto("/question-bank");
    const detail = await openQuestion(reporterPage, /nearest to the Sun/);
    await detail.getByRole("button", { name: "Report a problem" }).click();
    const ask = dialogNamed(reporterPage, "Report a problem with this question");
    await ask.getByLabel("What is wrong with it?").fill("The key says Mercury but the picture shows Venus.");
    await ask.getByRole("button", { name: "Send report" }).click();
    await expect(ask.getByRole("alert")).toContainText("Question reporting by teachers is currently disabled.");
    expect(await db.questionReport.count()).toBe(0);
    await other.close();
  });
});

test.describe("a reviewer reads and answers the reports", () => {
  test("the Reports section is for reviewers; reporters are shown by role and section, never by name; the filter finds answered reports", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await school();
    const item = await approved(s);
    await teacherReport(s, item);
    await pupilReport(s, item);

    // a teacher who is not a reviewer has no such section
    const other = await browser.newContext({ baseURL: baseURL! });
    const reporterPage = await other.newPage();
    await signInThroughUi(reporterPage, s.reporter);
    await reporterPage.goto("/question-bank");
    await expect(reporterPage.getByRole("tab", { name: "Review queue" })).toHaveCount(0);
    await expect(reporterPage.getByRole("tab", { name: "Reports" })).toHaveCount(0);
    await other.close();

    await signInThroughUi(page, s.reviewer);
    await page.goto("/question-bank");
    await page.getByRole("tab", { name: "Reports" }).click();
    await expect(page.getByRole("tab", { name: "Reports" })).toHaveAttribute("aria-selected", "true");
    await expect(reportRows(page)).toHaveCount(2);
    const teacherRow = reportRows(page).filter({ hasText: "The key says Mercury" });
    await expect(teacherRow).toContainText("Teacher in Main Branch");
    await expect(teacherRow).toContainText("Waiting");
    await expect(teacherRow).toContainText("Question has not been copied into any assessments.");
    const pupilRow = reportRows(page).filter({ hasText: "I think two of the answers are right." });
    await expect(pupilRow.getByText(/^Pupil( |$)/)).toBeVisible();
    // no name, no admission number, no class: the API masks them and the screen does not go and fetch them
    for (const secret of ["Zainab", "Hiddenname", "2026/0001", "Tariq"]) await expect(page.getByRole("tabpanel")).not.toContainText(secret);
    await checkBothThemes(page, "reports (waiting)");

    // nothing answered yet: the other states are empty, in words
    await page.getByLabel("Show", { exact: true }).selectOption("RESOLVED");
    await expect(page.getByText("No reports to show.")).toBeVisible();
    await page.getByLabel("Show", { exact: true }).selectOption("ALL");
    await expect(reportRows(page)).toHaveCount(2);
    await page.getByLabel("Show", { exact: true }).selectOption("OPEN");

    // the question opens from its report
    await teacherRow.getByRole("button", { name: /nearest to the Sun/ }).click();
    await expect(dialogNamed(page, "Question").getByText(PROMPT)).toBeVisible();
  });

  test("answering: a choice and a reason are asked for; the answer is kept; the report leaves Waiting and shows its outcome and reason; the correction is not offered when nothing copied the question", async ({
    page,
  }) => {
    const s = await school();
    const item = await approved(s);
    const report = await teacherReport(s, item);
    await signInThroughUi(page, s.reviewer);
    await page.goto("/question-bank");
    await page.getByRole("tab", { name: "Reports" }).click();
    await reportRows(page).first().getByRole("button", { name: "Answer this report" }).click();
    const ask = dialogNamed(page, "Answer this report");
    await expect(ask).toContainText("A pupil who reported it sees the outcome and your reason.");
    await checkBothThemes(page, "answer a report");

    // nothing chosen, then no reason: told in words, and the report is untouched
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask.getByText("Choose what you decided.")).toBeVisible();
    await ask.getByLabel("Outcome").selectOption("FIXED");
    // no assessment copied this question: there is nothing to correct, so the tick is not offered
    await expect(ask.getByLabel(/Correct the copies/)).toHaveCount(0);
    await ask.getByLabel("Outcome").selectOption("NOT_AN_ERROR");
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask.getByText(NO_REASON_SENTENCE)).toBeVisible();
    await ask.getByLabel("Your reason").fill("ab");
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask.getByText(NO_REASON_SENTENCE)).toBeVisible();
    expect((await db.questionReport.findUniqueOrThrow({ where: { id: report.id } })).status).toBe("OPEN");

    await ask.getByLabel("Your reason").fill("The picture is of Mercury; the key is right.");
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask).toBeHidden();
    await expect(page.getByText("Report answered.")).toBeVisible();
    await expect(page.getByText("No report is waiting for you.")).toBeVisible();
    expect(await db.questionReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
      status: "DISMISSED",
      outcome: "NOT_AN_ERROR",
      outcomeReason: "The picture is of Mercury; the key is right.",
      resolvedById: s.reviewer.id,
    });

    await page.getByLabel("Show", { exact: true }).selectOption("DISMISSED");
    const row = reportRows(page).first();
    await expect(row).toContainText("Dismissed");
    await expect(row).toContainText("Not an error");
    await expect(row).toContainText("The picture is of Mercury; the key is right.");
    await expect(row.getByRole("button", { name: "Answer this report" })).toHaveCount(0);
    await checkBothThemes(page, "reports (answered)");
  });

  test("a report someone else has just answered is refused in the API's words and the list is brought up to date", async ({ page }) => {
    const s = await school();
    const item = await approved(s);
    const report = await teacherReport(s, item);
    await signInThroughUi(page, s.reviewer);
    await page.goto("/question-bank");
    await page.getByRole("tab", { name: "Reports" }).click();
    await reportRows(page).first().getByRole("button", { name: "Answer this report" }).click();
    const ask = dialogNamed(page, "Answer this report");
    await ask.getByLabel("Outcome").selectOption("NEEDS_DISCUSSION");
    await ask.getByLabel("Your reason").fill("We will talk about it on Monday.");

    // another reviewer answers it first
    await db.questionReport.update({
      where: { id: report.id },
      data: {
        status: "DISMISSED",
        outcome: "NOT_AN_ERROR",
        outcomeReason: "Already checked.",
        resolvedById: s.admin.id,
        resolvedAt: new Date(),
      },
    });
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(
      page.getByRole("main").getByRole("alert").filter({ hasText: "This report has already been resolved or dismissed." }),
    ).toBeVisible();
    await expect(ask).toBeHidden();
    await expect(page.getByText("No report is waiting for you.")).toBeVisible();
    expect(await db.questionReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
      outcome: "NOT_AN_ERROR",
      outcomeReason: "Already checked.",
    });
  });

  test("a fixed question copied into an assessment: the correction is offered only for Fixed, said in words, applied, and what it did is shown", async ({
    page,
  }) => {
    const s = await school();
    const item = await approved(s, "What is the capital of Nigeria?");
    const subject = await db.subject.create({ data: { branchId: s.home.id, name: "Civics", code: "CIV" } });
    const quiz = await db.quiz.create({
      data: { branchId: s.home.id, subjectId: subject.id, title: "Civics test", status: "PUBLISHED", passingScore: 60 },
    });
    const copy = await db.quizQuestion.create({
      data: {
        branchId: s.home.id,
        quizId: quiz.id,
        prompt: item.prompt,
        options: [
          { id: "A", text: "Lagos" },
          { id: "B", text: "Abuja" },
        ],
        correctAnswer: "B",
        points: 2,
        sortOrder: 1,
        sourceItemId: item.id,
        sourceVersion: 1,
      },
    });
    const own = await db.quizQuestion.create({
      data: { branchId: s.home.id, quizId: quiz.id, prompt: "Name the colour of grass.", correctAnswer: "x", points: 2, sortOrder: 2 },
    });
    // the pupil answered "A" and was marked wrong; the reviewer then corrects the question so that "A" is the key
    const attempt = await db.quizAttempt.create({
      data: {
        branchId: s.home.id,
        quizId: quiz.id,
        studentId: s.pupil.id,
        answers: [
          { questionId: copy.id, answer: "A" },
          { questionId: own.id, answer: "x" },
        ],
        score: 50,
        isPassed: false,
        completedAt: new Date(),
      },
    });
    await db.questionBankItem.update({
      where: { id: item.id },
      data: {
        prompt: "What is the capital of Nigeria? (corrected)",
        options: [
          { id: "A", text: "Abuja" },
          { id: "B", text: "Lagos" },
        ],
        correctAnswer: "A",
        version: 2,
      },
    });
    const report = await teacherReport(s, item, "The key marks Abuja wrong.");

    await signInThroughUi(page, s.reviewer);
    await page.goto("/question-bank");
    await page.getByRole("tab", { name: "Reports" }).click();
    const row = reportRows(page).first();
    // what the report was filed against, and that the question has changed since
    await expect(row).toContainText("Reported on version 1; the question is now version 2.");
    await expect(row).toContainText("Question was used in 1 assessment(s) with 1 student attempt(s).");
    await row.getByRole("button", { name: "Answer this report" }).click();
    const ask = dialogNamed(page, "Answer this report");
    const tick = ask.getByLabel(/Correct the copies in this branch's assessments/);
    await expect(tick).toHaveCount(0);
    await ask.getByLabel("Outcome").selectOption("NEEDS_DISCUSSION");
    await expect(tick).toHaveCount(0);
    await ask.getByLabel("Outcome").selectOption("FIXED");
    await expect(tick).toBeVisible();
    await expect(ask).toContainText("past papers");
    await checkBothThemes(page, "answer a report with a correction");
    await ask.getByLabel("Outcome").selectOption("NOT_AN_ERROR");
    await expect(tick).toHaveCount(0);
    await ask.getByLabel("Outcome").selectOption("FIXED");
    await tick.check();
    await ask.getByLabel("Your reason").fill("The key was wrong and is corrected.");
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask).toBeHidden();
    await expect(page.getByText(/Report answered\. Corrected 1 copy in assessments; checked 1 attempt, scored 1 again/)).toBeVisible();

    expect(await db.questionReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({ status: "RESOLVED", outcome: "FIXED" });
    expect(await db.quizQuestion.findUniqueOrThrow({ where: { id: copy.id } })).toMatchObject({
      correctAnswer: "A",
      sourceVersion: 2,
      prompt: "What is the capital of Nigeria? (corrected)",
    });
    expect((await db.quizAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).score).toBeGreaterThan(50);
  });
});

test.describe("who is asked", () => {
  test("an administrator who is not a reviewer by name still sees the Reports section; a pupil reaches nothing", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await school();
    const item = await approved(s);
    await pupilReport(s, item);
    await signInThroughUi(page, s.admin);
    await page.goto("/question-bank");
    await page.getByRole("tab", { name: "Reports" }).click();
    await expect(reportRows(page)).toHaveCount(1);

    const user = await createUser({ role: Role.STUDENT, name: "Sam Pupil" });
    const context = await browser.newContext({ baseURL: baseURL! });
    const pupilPage = await context.newPage();
    await signInThroughUi(pupilPage, user);
    await pupilPage.goto("/question-bank");
    await expect(pupilPage.getByRole("main").getByRole("alert")).toContainText("Only staff can open this page.");
    await expect(pupilPage.getByRole("tab")).toHaveCount(0);
    await context.close();
  });
});
