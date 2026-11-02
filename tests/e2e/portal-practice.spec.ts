import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { EnrollmentStatus, Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";

// Task 0041, slice F4: the pupil's Practice tab in the portal: set up a session within the daily cap and the school's switches, answer one question at a time with feedback after each
// answer or at the end, finish, the history with archive and a PDF, a report on a question just practised and "My reports" with the reviewer's answer. A guardian gets a summary
// and never a question. Everything the pupil does is clicked and typed; the question bank and the sessions behind it are written straight to the database. Axe in both themes and a
// horizontal-overflow check on every state, on desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page, what: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal overflow on ${what}`).toBeLessThanOrEqual(innerWidth);
}
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page, `${what} [${theme} theme]`);
    await expectNoHorizontalScroll(page, `${what} [${theme} theme]`);
  }
  await page.evaluate((t) => void (document.documentElement.dataset.theme = t), initial);
}

test.describe.configure({ timeout: 120_000 });

const DOB = "2013-05-10";
const GUARDIAN_PHONE = "08011110001";
const panel = (page: Page) => page.getByRole("tabpanel").last();
/// The pupil's sessions in the history, one entry each (the answers inside an entry are a list of their own).
const sessions = (page: Page): Locator => page.getByRole("list", { name: "Practice sessions" }).locator(":scope > li");
const reports = (page: Page): Locator => page.getByRole("list", { name: "Your reports" }).locator(":scope > li");

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
});

const setting = (key: string, value: unknown) => db.settingValue.create({ data: { scope: "GLOBAL", key, value: value as never, status: "APPROVED" } });

/// A branch with a class and a pupil in it (Amina, 2026/0001, whose guardian has a phone). A session is two questions at most and a pool of five is enough, so a session is short.
async function school() {
  const home = await seedInstance();
  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });
  const pupil = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Musa",
      gender: Gender.FEMALE,
      dateOfBirth: new Date(DOB),
      admissionNo: "2026/0001",
      guardianPhone: "+2348011110001",
    },
  });
  await db.studentEnrollment.create({
    data: {
      studentId: pupil.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm.id,
      status: EnrollmentStatus.ACTIVE,
    },
  });
  const author = await createUser({ superAdmin: true });
  await setting("bank.practice.minPoolSize", 5);
  await setting("bank.practice.maxQuestions", 2);
  return { home, pupil, author };
}
type School = Awaited<ReturnType<typeof school>>;

/// Six approved practice questions on Biology, each with the same three options (Nucleus, Mitochondria right, Ribosome), so whichever two a session draws are answered the same way.
async function bank(s: School, count = 6) {
  const items = [];
  for (let i = 1; i <= count; i++) {
    items.push(
      await db.questionBankItem.create({
        data: {
          branchId: s.home.id,
          bank: "ASSESSMENT",
          type: "SINGLE",
          prompt: `What is cell part ${i}?`,
          explanation: `Explanation for question ${i}.`,
          points: 1,
          topic: "Cell Structure",
          subjectLabel: "Biology",
          subjectKey: "biology",
          options: [
            { id: "A", text: "Nucleus" },
            { id: "B", text: "Mitochondria" },
            { id: "C", text: "Ribosome" },
          ],
          correctAnswer: "B",
          visibility: "PRACTICE",
          status: "APPROVED",
          submittedById: s.author.id,
          approvedById: s.author.id,
          approvedAt: new Date(),
        },
      }),
    );
  }
  return items;
}
type Item = Awaited<ReturnType<typeof bank>>[number];

/// A session of the pupil's written straight to the database: one answer per entry of `right` (true: "B", the right option; false: "A"). Finished unless `open`.
async function sessionOf(s: School, items: Item[], right: boolean[], open = false) {
  const made = await db.practiceSession.create({
    data: {
      branchId: s.home.id,
      studentId: s.pupil.id,
      subjectLabel: "Biology",
      subjectKey: "biology",
      topic: "Cell Structure",
      size: 2,
      itemIds: items.map((i) => i.id),
      feedbackMode: "EACH",
      finishedAt: open ? null : new Date(),
    },
  });
  const attempts = [];
  for (const [at, isRight] of right.entries()) {
    attempts.push(
      await db.practiceAttempt.create({
        data: {
          sessionId: made.id,
          branchId: s.home.id,
          studentId: s.pupil.id,
          bankItemId: items[at]!.id,
          version: 1,
          answer: isRight ? "B" : "A",
          correct: isRight,
        },
      }),
    );
  }
  return { session: made, attempts };
}

async function portalSignIn(page: Page, secret = DOB) {
  await page.goto("/portal");
  await page.fill("#admissionNo", "2026/0001");
  await page.fill("#secret", secret);
  await page.click("button:has-text('Access Student Portal')");
  await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toBeVisible();
}
const practiceTab = (page: Page) =>
  page.getByRole("tablist", { name: "Student Portal Sections" }).getByRole("tab", { name: "Practice", exact: true });
async function openPractice(page: Page, section = "Practise now") {
  await practiceTab(page).click();
  await page.getByRole("tab", { name: section }).click();
}

/// Sets up and starts a session on Biology.
async function startSession(page: Page, feedback: "After each answer" | "At the end") {
  const setup = page.getByRole("region", { name: "Practice setup" });
  await setup.getByLabel("Subject").selectOption("Biology");
  await setup.getByRole("radio", { name: feedback }).check();
  await setup.getByRole("button", { name: "Start practice" }).click();
  const session = page.getByRole("region", { name: "Your practice" });
  await expect(session).toContainText("Question 1 of 2");
  return session;
}

test.describe("who has the tab", () => {
  test("a pupil has Practice with three sections; a guardian has the summary and no question", async ({ page, browser, baseURL }) => {
    const s = await school();
    const items = await bank(s);
    await sessionOf(s, items, [true, false]);
    await portalSignIn(page);
    await practiceTab(page).click();
    for (const name of ["Practise now", "History", "My reports"]) await expect(page.getByRole("tab", { name })).toBeVisible();
    await checkBothThemes(page, "the pupil's Practice tab");

    const guardian = await browser.newContext({ baseURL: baseURL! });
    const guardianPage = await guardian.newPage();
    await portalSignIn(guardianPage, GUARDIAN_PHONE);
    await practiceTab(guardianPage).click();
    const summary = guardianPage.getByRole("region", { name: "How practice is going" });
    await expect(summary).toContainText("Sessions: 1");
    await expect(summary).toContainText("Questions answered: 2");
    await expect(summary).toContainText("Right: 1 of 2 (50%)");
    await expect(summary).toContainText("Biology · Cell Structure");
    await expect(guardianPage.getByRole("tab", { name: "Practise now" })).toHaveCount(0);
    await expect(guardianPage.getByText("What is cell part")).toHaveCount(0);
    await expect(guardianPage.getByRole("button", { name: /Start practice|Report a problem|Archive|Download PDF/ })).toHaveCount(0);
    await checkBothThemes(guardianPage, "the guardian's practice summary");
    await guardian.close();
  });

  test("a pupil whose practice is switched off has no Practice tab, and at the summary level has the summary only", async ({ page }) => {
    const s = await school();
    const items = await bank(s);
    await sessionOf(s, items, [true, false]);
    const access = await db.settingValue.create({
      data: { scope: "BRANCH", branchId: s.home.id, key: "portal_access", value: { pupil: { practice: "NONE" } }, status: "APPROVED" },
    });
    await portalSignIn(page);
    await expect(practiceTab(page)).toHaveCount(0);

    await db.settingValue.update({ where: { id: access.id }, data: { value: { pupil: { practice: "SUMMARY" } } } });
    await page.reload();
    await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toBeVisible();
    await practiceTab(page).click();
    await expect(page.getByRole("region", { name: "How practice is going" })).toContainText("Questions answered: 2");
    await expect(page.getByRole("tab", { name: "Practise now" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start practice" })).toHaveCount(0);
  });

  test("a guardian given the full history sees it read only", async ({ browser, baseURL }) => {
    const s = await school();
    const items = await bank(s);
    await sessionOf(s, items, [true, false]);
    await setting("bank.parents.view", "FULL");
    await db.settingValue.create({
      data: { scope: "BRANCH", branchId: s.home.id, key: "portal_access", value: { guardian: { practice: "FULL" } }, status: "APPROVED" },
    });
    const guardian = await browser.newContext({ baseURL: baseURL! });
    const page = await guardian.newPage();
    await portalSignIn(page, GUARDIAN_PHONE);
    await practiceTab(page).click();
    await expect(page.getByRole("tab", { name: "Practise now" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "My reports" })).toHaveCount(0);
    const session = sessions(page).first();
    await session.getByText("Show answers").click();
    await expect(session).toContainText("Your answer: Mitochondria");
    await expect(page.getByRole("button", { name: /Start practice|Report a problem|Archive|Download PDF|Finish it/ })).toHaveCount(0);
    await checkBothThemes(page, "a guardian's read-only history");
    await guardian.close();
  });
});

test.describe("practising", () => {
  test("a session with the answer after each question: right and not quite, the key, the explanation, the result, a report and a PDF", async ({ page }) => {
    const s = await school();
    await bank(s);
    await portalSignIn(page);
    await openPractice(page);

    const setup = page.getByRole("region", { name: "Practice setup" });
    await expect(setup).toContainText("You can answer 100 more questions today.");
    await checkBothThemes(page, "the practice setup");
    const session = await startSession(page, "After each answer");
    await checkBothThemes(page, "a practice question");

    await session.getByRole("radio", { name: "Mitochondria" }).check();
    await session.getByRole("button", { name: "Check answer" }).click();
    const feedback = session.getByRole("status");
    await expect(feedback).toContainText("Correct");
    await expect(feedback).toContainText("Explanation for question");
    await expect(session.getByRole("button", { name: "Check answer" })).toHaveCount(0);
    await session.getByRole("button", { name: "Next question" }).click();

    await expect(session).toContainText("Question 2 of 2");
    await session.getByRole("radio", { name: "Nucleus" }).check();
    await session.getByRole("button", { name: "Check answer" }).click();
    await expect(feedback).toContainText("Not quite");
    await expect(feedback).toContainText("Correct answer: Mitochondria");
    await checkBothThemes(page, "the feedback after an answer");
    await session.getByRole("button", { name: "See my result" }).click();

    const result = page.getByRole("region", { name: "Your practice result" });
    await expect(result).toContainText("You got 1 of 2 right (50%).");
    const wrong = result.getByRole("listitem").filter({ hasText: "Your answer: Nucleus" });
    await expect(wrong).toContainText("Not quite");
    await expect(wrong).toContainText("Correct answer: Mitochondria");
    await expect(wrong).toContainText("Explanation for question");
    await expect(result.getByRole("listitem").filter({ hasText: "Your answer: Mitochondria" })).toContainText("Correct");
    await checkBothThemes(page, "the practice result");

    const stored = await db.practiceSession.findFirstOrThrow({ where: { studentId: s.pupil.id }, include: { attempts: true } });
    expect(stored.finishedAt).not.toBeNull();
    expect(stored.attempts.map((a) => a.correct).sort()).toEqual([false, true]);

    await wrong.getByRole("button", { name: "Report a problem" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What is wrong with it?").fill("The explanation does not match the question.");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(result).toContainText("Thank you. Your report was sent to the people who look after the questions.");
    expect(await db.questionReport.count({ where: { reporterStudentId: s.pupil.id, status: "OPEN" } })).toBe(1);

    const download = page.waitForEvent("download");
    await result.getByRole("button", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await (await import("node:fs/promises")).readFile((await file.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  test("a session with the answers at the end shows nothing until it is finished", async ({ page }) => {
    const s = await school();
    await bank(s);
    await portalSignIn(page);
    await openPractice(page);
    const session = await startSession(page, "At the end");

    await session.getByRole("radio", { name: "Nucleus" }).check();
    await session.getByRole("button", { name: "Save answer" }).click();
    await expect(session.getByRole("status")).toContainText("Answer saved.");
    await expect(session).not.toContainText("Correct answer");
    await expect(session).not.toContainText("Explanation for question");
    await session.getByRole("button", { name: "Next question" }).click();
    await session.getByRole("radio", { name: "Mitochondria" }).check();
    await session.getByRole("button", { name: "Save answer" }).click();
    await expect(session).not.toContainText("Explanation for question");
    await session.getByRole("button", { name: "See my result" }).click();

    const result = page.getByRole("region", { name: "Your practice result" });
    await expect(result).toContainText("You got 1 of 2 right (50%).");
    const wrong = result.getByRole("listitem").filter({ hasText: "Your answer: Nucleus" });
    await expect(wrong).toContainText("Correct answer: Mitochondria");
    await expect(wrong).toContainText("Explanation for question");
  });

  test("finishing now asks first, gives the unanswered questions back, and shows the result of what was answered", async ({ page }) => {
    const s = await school();
    await bank(s);
    await portalSignIn(page);
    await openPractice(page);
    const session = await startSession(page, "After each answer");
    await session.getByRole("radio", { name: "Mitochondria" }).check();
    await session.getByRole("button", { name: "Check answer" }).click();
    await expect(session.getByRole("status")).toContainText("Correct");

    await session.getByRole("button", { name: "Finish now" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("The questions you have not answered are given back to today's allowance.");
    await dialog.getByRole("button", { name: "Keep going" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(session).toContainText("Question 1 of 2");
    await session.getByRole("button", { name: "Finish now" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Finish now" }).click();

    const result = page.getByRole("region", { name: "Your practice result" });
    await expect(result).toContainText("You got 1 of 1 right (100%).");
    expect((await db.practiceSession.findFirstOrThrow({ where: { studentId: s.pupil.id } })).finishedAt).not.toBeNull();

    await result.getByRole("button", { name: "Practise again" }).click();
    await expect(page.getByRole("region", { name: "Practice setup" })).toContainText("You can answer 99 more questions today.");
  });

  test("with today's allowance spent the setup says so and nothing can be started", async ({ page }) => {
    const s = await school();
    const items = await bank(s);
    await setting("bank.practice.dailyCap", 1);
    await sessionOf(s, items, [true]);
    await portalSignIn(page);
    await openPractice(page);
    const setup = page.getByRole("region", { name: "Practice setup" });
    await expect(setup).toContainText("You have used today's practice allowance. Come back tomorrow.");
    await expect(setup.getByRole("button", { name: "Start practice" })).toBeDisabled();
    await checkBothThemes(page, "the setup with the allowance spent");
  });

  test("with practice closed the setup says so in the school's words, and the history still opens", async ({ page }) => {
    const s = await school();
    const items = await bank(s);
    await sessionOf(s, items, [true, false]);
    await setting("bank.access.pupils", false);
    await portalSignIn(page);
    await openPractice(page);
    await expect(panel(page)).toContainText("Practice is closed for this branch.");
    await expect(page.getByRole("button", { name: "Start practice" })).toHaveCount(0);
    await page.getByRole("tab", { name: "History" }).click();
    await expect(sessions(page).first()).toContainText("1 of 2 right");
  });

  test("with too few questions for the class the setup says none are ready", async ({ page }) => {
    const s = await school();
    await bank(s, 3);
    await portalSignIn(page);
    await openPractice(page);
    await expect(panel(page)).toContainText("No practice questions are ready for your class yet.");
    await expect(page.getByRole("button", { name: "Start practice" })).toHaveCount(0);
    await checkBothThemes(page, "the setup with no questions ready");
  });

  test("an answer the school refuses keeps the pupil on the question with the sentence and the answer still chosen", async ({ page }) => {
    const s = await school();
    await bank(s);
    await portalSignIn(page);
    await openPractice(page);
    const session = await startSession(page, "After each answer");
    await session.getByRole("radio", { name: "Mitochondria" }).check();
    await setting("bank.access.pupils", false);
    await session.getByRole("button", { name: "Check answer" }).click();
    await expect(session.getByRole("alert")).toContainText("Practice is currently closed.");
    await expect(session).toContainText("Question 1 of 2");
    await expect(session.getByRole("radio", { name: "Mitochondria" })).toBeChecked();
    await expect(page.getByRole("region", { name: "Your practice result" })).toHaveCount(0);
    expect(await db.practiceAttempt.count({ where: { studentId: s.pupil.id } })).toBe(0);
  });
});

test.describe("history", () => {
  test("sessions newest first, answers with the option's words, archive and restore, finishing one left open, and a PDF", async ({ page }) => {
    const s = await school();
    const items = await bank(s);
    await sessionOf(s, items.slice(0, 2), [true, false]);
    const left = await sessionOf(s, items.slice(2, 4), [true], true);
    await portalSignIn(page);
    await openPractice(page, "History");

    const done = sessions(page).filter({ hasText: "What is cell part 1?" });
    await expect(done).toContainText("Finished");
    await expect(done).toContainText("1 of 2 right");
    await expect(done).toContainText("Biology · Cell Structure");
    await done.getByText("Show answers").click();
    const wrong = done.getByRole("listitem").filter({ hasText: "Your answer: Nucleus" });
    await expect(wrong).toContainText("Not quite");
    await expect(wrong).toContainText("Correct answer: Mitochondria");
    await expect(done.getByRole("listitem").filter({ hasText: "Your answer: Mitochondria" })).toContainText("Correct");
    await checkBothThemes(page, "the history");

    await wrong.getByRole("button", { name: "Archive" }).click();
    await expect(done.getByRole("listitem").filter({ hasText: "Your answer: Nucleus" })).toHaveCount(0);
    expect((await db.practiceAttempt.findMany({ where: { archivedAt: { not: null } } })).length).toBe(1);
    await panel(page).getByLabel("Show archived answers").check();
    const archived = sessions(page).getByRole("listitem").filter({ hasText: "Your answer: Nucleus" });
    await archived.getByRole("button", { name: "Restore" }).click();
    await expect(sessions(page).getByRole("listitem").filter({ hasText: "Your answer: Nucleus" })).toHaveCount(0);
    expect(await db.practiceAttempt.count({ where: { archivedAt: { not: null } } })).toBe(0);
    await panel(page).getByLabel("Show archived answers").uncheck();

    const open = sessions(page).filter({ hasText: "Not finished" });
    await expect(open).toContainText("1 answered so far");
    await expect(open.getByText("Show answers")).toHaveCount(0);
    await open.getByRole("button", { name: "Finish it" }).click();
    await expect(sessions(page).filter({ hasText: "Not finished" })).toHaveCount(0);
    expect((await db.practiceSession.findUniqueOrThrow({ where: { id: left.session.id } })).finishedAt).not.toBeNull();

    const download = page.waitForEvent("download");
    await done.getByRole("button", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await (await import("node:fs/promises")).readFile((await file.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  test("with nothing practised yet the history says so", async ({ page }) => {
    const s = await school();
    await bank(s);
    await portalSignIn(page);
    await openPractice(page, "History");
    await expect(panel(page)).toContainText("You have not practised yet.");
  });
});

test.describe("reports", () => {
  test("a report needs a few words, is refused a second time with the school's sentence, is listed, and shows the reviewer's answer", async ({ page }) => {
    const s = await school();
    const items = await bank(s);
    await sessionOf(s, items.slice(0, 2), [true, false]);
    await portalSignIn(page);
    await openPractice(page, "History");
    const done = sessions(page).first();
    await done.getByText("Show answers").click();
    const wrong = done.getByRole("listitem").filter({ hasText: "Your answer: Nucleus" });

    await wrong.getByRole("button", { name: "Report a problem" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What is wrong with it?").fill("No");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog).toContainText("Say what is wrong in at least 5 characters.");
    expect(await db.questionReport.count()).toBe(0);
    await checkBothThemes(page, "the report dialog with a refusal");
    await dialog.getByLabel("What is wrong with it?").fill("Nucleus should be right here.");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel(page)).toContainText("Thank you. Your report was sent to the people who look after the questions.");
    expect(await db.questionReport.count({ where: { reporterStudentId: s.pupil.id, status: "OPEN" } })).toBe(1);

    await wrong.getByRole("button", { name: "Report a problem" }).click();
    await page.getByRole("dialog").getByLabel("What is wrong with it?").fill("Nucleus should be right here, really.");
    await page.getByRole("dialog").getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("dialog")).toContainText("You have already reported this question; your report is waiting for a reviewer.");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    expect(await db.questionReport.count()).toBe(1);

    await page.getByRole("tab", { name: "My reports" }).click();
    const mine = reports(page).filter({ hasText: "Nucleus should be right here." });
    await expect(mine).toContainText("What is cell part");
    await expect(mine).toContainText("Waiting for a reviewer");
    await checkBothThemes(page, "My reports");

    await db.questionReport.updateMany({
      where: { reporterStudentId: s.pupil.id },
      data: { status: "RESOLVED", outcome: "FIXED", outcomeReason: "The answer key was wrong. It has been corrected.", resolvedAt: new Date() },
    });
    await page.getByRole("tab", { name: "History" }).click();
    await page.getByRole("tab", { name: "My reports" }).click();
    await expect(mine).toContainText("Resolved");
    await expect(mine).toContainText("The question was fixed");
    await expect(mine).toContainText("Reason: The answer key was wrong. It has been corrected.");
  });

  test("with reporting switched off the school's sentence is shown and nothing is filed", async ({ page }) => {
    const s = await school();
    const items = await bank(s);
    await sessionOf(s, items.slice(0, 2), [true, false]);
    await setting("bank.reports.pupils", false);
    await portalSignIn(page);
    await openPractice(page, "History");
    const done = sessions(page).first();
    await done.getByText("Show answers").click();
    await done.getByRole("listitem").filter({ hasText: "Your answer: Nucleus" }).getByRole("button", { name: "Report a problem" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What is wrong with it?").fill("Nucleus should be right here.");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog).toContainText("Question reporting by pupils is currently disabled.");
    expect(await db.questionReport.count()).toBe(0);
  });

  test("with nothing reported the list says so", async ({ page }) => {
    const s = await school();
    await bank(s);
    await portalSignIn(page);
    await openPractice(page, "My reports");
    await expect(panel(page)).toContainText("You have not reported a question.");
  });
});
