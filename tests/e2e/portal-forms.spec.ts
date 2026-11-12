import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { EnrollmentStatus, Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0041, slice F3: the pupil's Forms tab in the portal: practice sets (start, a countdown from the start of the attempt, answers of every kind, submit, the result with what the
// rules reveal, the result again later, a PDF), questionnaires answered once, and paper work with "Request marking". A guardian has no such tab. Forms are written and published
// through the API by a teacher; everything the pupil does is clicked and typed. Axe in both themes and a horizontal-overflow check on every state, on desktop and on a phone.

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
const dialog = (page: Page) => page.getByRole("dialog");
const panel = (page: Page) => page.getByRole("tabpanel");
const item = (page: Page, text: string): Locator => panel(page).getByRole("listitem").filter({ hasText: text });

let tag = "";
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  tag = `Q${Date.now().toString(36).toUpperCase()}`;
  await resetDatabase();
});

/// A branch with a class, a pupil in it (Amina, 2026/0001) whose guardian has a phone, and a teacher who writes the forms.
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
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: `${tag} Teacher` });
  const cookie = cookieHeader((await loginAs(teacher)).token!);
  return { home, group, pupil, teacher, cookie };
}
type School = Awaited<ReturnType<typeof school>>;

async function publish(s: School, id: string) {
  const done = await api(`/api/v1/forms/${id}`, { method: "PATCH", cookie: s.cookie, body: { branchId: s.home.id, status: "PUBLISHED" } });
  expect(done.status).toBe(200);
}

/// A practice set: single choice (2 points), true/false (1 point), and a short answer (3 points, marked by the teacher: the API's default). 20 minutes.
async function practiceSet(s: School, title: string, maxDurationMinutes: number | null = 20) {
  const created = await api("/api/v1/forms", {
    method: "POST",
    cookie: s.cookie,
    body: {
      kind: "PRACTICE_SET",
      branchId: s.home.id,
      title,
      instructions: "Show what you know.",
      maxDurationMinutes,
      classGroupIds: [s.group.id],
      questions: [
        {
          prompt: "What is 3 + 4?",
          questionType: "SINGLE",
          options: [
            { id: "A", text: "6" },
            { id: "B", text: "7" },
          ],
          correctAnswer: "B",
          points: 2,
          explanation: "Add the two numbers.",
          sortOrder: 0,
        },
        {
          prompt: "The sun is a star.",
          questionType: "TRUE_FALSE",
          correctAnswer: "true",
          points: 1,
          explanation: "It is a star.",
          sortOrder: 1,
        },
        {
          prompt: "Name the process plants use to make food.",
          questionType: "SHORT",
          correctAnswer: "photosynthesis",
          points: 3,
          sortOrder: 2,
        },
      ],
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const form = await db.form.findFirstOrThrow({ where: { title }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  await publish(s, form.id);
  return form;
}

async function portalSignIn(page: Page, secret = DOB) {
  await page.goto("/portal");
  await page.fill("#admissionNo", "2026/0001");
  await page.fill("#secret", secret);
  await page.click("button:has-text('Access Student Portal')");
  await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toBeVisible();
}
async function openForms(page: Page, section = "Practice sets") {
  await page.getByRole("tablist", { name: "Student Portal Sections" }).getByRole("tab", { name: "Forms" }).click();
  await page.getByRole("tab", { name: section }).click();
}

async function answerEverything(page: Page) {
  const attempt = page.getByRole("region", { name: "Your attempt" });
  await attempt.getByRole("radio", { name: "7" }).check();
  await attempt.getByRole("radio", { name: "False" }).check();
  await attempt.getByLabel("Name the process plants use to make food.").fill("photosynthesis");
}

test.describe("who has the tab", () => {
  test("a pupil has Forms with its three sections; a guardian does not", async ({ page, browser, baseURL }) => {
    await school();
    await portalSignIn(page);
    await page.getByRole("tablist", { name: "Student Portal Sections" }).getByRole("tab", { name: "Forms" }).click();
    for (const name of ["Practice sets", "Questionnaires", "Paper work"]) await expect(page.getByRole("tab", { name })).toBeVisible();
    await checkBothThemes(page, "the pupil's Forms tab");

    const guardian = await browser.newContext({ baseURL: baseURL! });
    const guardianPage = await guardian.newPage();
    await portalSignIn(guardianPage, GUARDIAN_PHONE);
    await expect(guardianPage.getByRole("tablist", { name: "Student Portal Sections" }).getByRole("tab", { name: "Forms" })).toHaveCount(0);
    await guardian.close();
  });
});

test.describe("practice sets", () => {
  test("a pupil starts a set, sees the countdown, answers every kind of question, and is told what is marked and what is waiting", async ({
    page,
  }) => {
    const s = await school();
    const title = `${tag} Plants`;
    const form = await practiceSet(s, title);
    await portalSignIn(page);
    await openForms(page);

    const row = item(page, title);
    await expect(row).toContainText("Show what you know.");
    await expect(row).toContainText("3 questions");
    await expect(row).toContainText("20 minutes");
    await expect(row).toContainText("Not started");
    await row.getByRole("button", { name: "Start" }).click();

    const attempt = page.getByRole("region", { name: "Your attempt" });
    await expect(attempt.getByRole("heading", { name: title })).toBeVisible();
    await expect(attempt.getByRole("timer")).toContainText(/Time left: (19|20):\d\d/);
    await expect(attempt).toContainText("What is 3 + 4?");
    await checkBothThemes(page, "an attempt in progress");
    await answerEverything(page);
    await attempt.getByRole("button", { name: "Submit" }).click();

    const result = page.getByRole("region", { name: "Your result" });
    await expect(result).toContainText("Score so far: 2 of 6");
    await expect(result).toContainText("still has to mark 1 answer");
    const single = result.getByRole("listitem").filter({ hasText: "What is 3 + 4?" });
    await expect(single).toContainText("Your answer: 7");
    await expect(single).toContainText("Correct");
    await expect(single).toContainText("Score: 2 of 2");
    await expect(single).toContainText("Add the two numbers.");
    const truth = result.getByRole("listitem").filter({ hasText: "The sun is a star." });
    await expect(truth).toContainText("Your answer: False");
    await expect(truth).toContainText("Not quite");
    await expect(truth).toContainText("Correct answer: True");
    await expect(truth).toContainText("It is a star.");
    const short = result.getByRole("listitem").filter({ hasText: "Name the process" });
    await expect(short).toContainText("Your answer: photosynthesis");
    await expect(short).toContainText("Waiting for your teacher to mark this answer.");
    await expect(short).not.toContainText("Correct answer:");
    await expect(short).not.toContainText("Score:");
    await checkBothThemes(page, "the result");

    const stored = await db.formResponse.findFirstOrThrow({ where: { formId: form.id }, include: { answers: true } });
    expect(stored).toMatchObject({ status: "COMPLETED", score: 2, maxScore: 6, markingStatus: "PENDING" });
    expect(stored.answers).toHaveLength(3);
  });

  test("a finished set is opened again from the list with its result, and the result downloads as a PDF", async ({ page }) => {
    const s = await school();
    const title = `${tag} Plants`;
    await practiceSet(s, title);
    await portalSignIn(page);
    await openForms(page);
    await item(page, title).getByRole("button", { name: "Start" }).click();
    await answerEverything(page);
    await page.getByRole("region", { name: "Your attempt" }).getByRole("button", { name: "Submit" }).click();
    await expect(page.getByRole("region", { name: "Your result" })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await (await import("node:fs/promises")).readFile((await file.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");

    await page.getByRole("button", { name: "Back to practice sets" }).click();
    const row = item(page, title);
    await expect(row).toContainText("Finished");
    await expect(row.getByRole("button", { name: "Start" })).toHaveCount(0);
    await row.getByRole("button", { name: "See result" }).click();
    const result = page.getByRole("region", { name: "Your result" });
    await expect(result).toContainText("Score so far: 2 of 6");
    await expect(result.getByRole("listitem").filter({ hasText: "Name the process" })).toContainText(
      "Waiting for your teacher to mark this answer.",
    );
    await checkBothThemes(page, "a result opened again");
  });

  test("an attempt in progress is continued, and its countdown runs from when it started", async ({ page }) => {
    const s = await school();
    const title = `${tag} Plants`;
    const form = await practiceSet(s, title);
    await db.formResponse.create({
      data: {
        branchId: s.home.id,
        formId: form.id,
        studentId: s.pupil.id,
        respondentId: s.pupil.id,
        status: "IN_PROGRESS",
        startedAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    await portalSignIn(page);
    await openForms(page);
    const row = item(page, title);
    await expect(row).toContainText("In progress");
    await row.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("region", { name: "Your attempt" }).getByRole("timer")).toContainText(/Time left: (09|10):\d\d/);
    expect(await db.formResponse.count({ where: { formId: form.id } })).toBe(1);
  });

  test("a refused submission keeps the answers on the screen and says why", async ({ page }) => {
    const s = await school();
    const title = `${tag} Plants`;
    await practiceSet(s, title);
    await portalSignIn(page);
    await openForms(page);
    await item(page, title).getByRole("button", { name: "Start" }).click();
    await answerEverything(page);
    await page.route("**/forms/practice-sets/*/submit", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ data: null, meta: {}, error: { code: "TIME_UP", message: "The time for this practice set is up." } }),
      }),
    );
    const attempt = page.getByRole("region", { name: "Your attempt" });
    await attempt.getByRole("button", { name: "Submit" }).click();
    await expect(attempt.getByRole("alert")).toContainText("The time for this practice set is up.");
    await expect(attempt.getByRole("radio", { name: "7" })).toBeChecked();
    await expect(attempt.getByRole("radio", { name: "False" })).toBeChecked();
    await expect(attempt.getByLabel("Name the process plants use to make food.")).toHaveValue("photosynthesis");
    await expect(page.getByRole("region", { name: "Your result" })).toHaveCount(0);
  });

  test("with nothing open for the class the list says so", async ({ page }) => {
    await school();
    await portalSignIn(page);
    await openForms(page);
    await expect(panel(page)).toContainText("No practice sets are open for you right now.");
  });
});

test.describe("questionnaires", () => {
  test("a pupil answers a questionnaire once, and is told it is anonymous before answering", async ({ page }) => {
    const s = await school();
    const title = `${tag} Lunch survey`;
    const created = await api("/api/v1/forms", {
      method: "POST",
      cookie: s.cookie,
      body: {
        kind: "QUESTIONNAIRE",
        branchId: s.home.id,
        title,
        instructions: "Tell us.",
        isAnonymous: true,
        audienceKind: "MEMBERS",
        roles: ["STUDENT"],
        classGroupIds: [s.group.id],
        questions: [
          { prompt: "How was lunch?", questionType: "RATING" },
          { prompt: "Anything to add?", questionType: "TEXT" },
        ],
      },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const form = await db.form.findFirstOrThrow({ where: { title } });
    await publish(s, form.id);

    await portalSignIn(page);
    await openForms(page, "Questionnaires");
    const row = item(page, title);
    await expect(row).toContainText("2 questions");
    await row.getByRole("button", { name: "Answer" }).click();
    await expect(dialog(page)).toContainText("anonymous");
    await dialog(page).getByRole("radio", { name: "4" }).check();
    await dialog(page).getByLabel("Anything to add?").fill("More chips.");
    await checkBothThemes(page, "answering a questionnaire");
    await dialog(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(row).toContainText("Answered");
    await expect(row.getByRole("button", { name: "Answer" })).toHaveCount(0);

    const stored = await db.formResponse.findFirstOrThrow({ where: { formId: form.id }, include: { answers: true } });
    expect(stored.studentId ?? null).toBeNull();
    expect(stored.respondentId ?? null).toBeNull();
    expect(stored.answers).toHaveLength(2);
  });

  test("with nothing addressed to the pupil the list says so", async ({ page }) => {
    await school();
    await portalSignIn(page);
    await openForms(page, "Questionnaires");
    await expect(panel(page)).toContainText("No questionnaires are waiting for you.");
  });
});

test.describe("paper work", () => {
  test("a pupil sees their own state of a paper work and asks for it to be marked, once", async ({ page }) => {
    const s = await school();
    const title = `${tag} Holiday project`;
    const created = await api("/api/v1/forms", {
      method: "POST",
      cookie: s.cookie,
      body: {
        kind: "PAPER_WORK",
        branchId: s.home.id,
        title,
        instructions: "Bring it in.",
        classGroupIds: [s.group.id],
        closesAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const form = await db.form.findFirstOrThrow({ where: { title } });

    await portalSignIn(page);
    await openForms(page, "Paper work");
    const row = item(page, title);
    await expect(row).toContainText("Bring it in.");
    await expect(row).toContainText("Not handed in yet");
    await checkBothThemes(page, "the paper work list");
    await row.getByRole("button", { name: "Request marking" }).click();
    await expect(row).toContainText("You asked your teacher to mark it.");
    await expect(row.getByRole("button", { name: "Request marking" })).toHaveCount(0);
    const asked = await db.formTurnIn.findFirstOrThrow({ where: { formId: form.id, studentId: s.pupil.id } });
    expect(asked.requestedAt).not.toBeNull();

    // once the teacher has recorded the hand-in, the page says so
    await db.formTurnIn.update({ where: { id: asked.id }, data: { status: "HANDED_IN" } });
    await page.reload();
    await openForms(page, "Paper work");
    await expect(item(page, title)).toContainText("Handed in");
    await expect(item(page, title).getByRole("button", { name: "Request marking" })).toHaveCount(0);
  });

  test("with no paper work for the class the list says so", async ({ page }) => {
    await school();
    await portalSignIn(page);
    await openForms(page, "Paper work");
    await expect(panel(page)).toContainText("No paper work has been set for you.");
  });
});
