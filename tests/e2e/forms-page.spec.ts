import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Gender } from "@prisma/client";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { signInThroughUi } from "./helpers";

// Task 0041, slice F2a: a form's own page (/forms/[id]) in a real browser: the overview with edit, publish, close and print; the questions (the answer key only for whoever
// manages the form); the results of a practice set and the summary of a questionnaire (an anonymous one with too few answers shows no breakdown). Forms and answers are set
// up through the API and the database, as the other specs do; everything the teacher does on the page is clicked and typed. Axe in both themes and a horizontal-overflow check
// on every state, on desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
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

const dialog = (page: Page) => page.getByRole("dialog");
const panel = (page: Page) => page.getByRole("tabpanel");
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `P${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "Form" RESTART IDENTITY CASCADE`);
});

async function people() {
  const home = await seedInstance();
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: `${tag} Teacher` });
  const colleague = await createUser({ role: Role.TEACHING_STAFF, name: `${tag} Colleague` });
  const pupil = await createUser({ role: Role.STUDENT, name: `${tag} Pupil` });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: `${tag} JSS 2` } });
  return { home, teacher, colleague, pupil, group };
}
type Setup = Awaited<ReturnType<typeof people>>;

/// A practice set written through the API by the teacher: a single-choice question (2 points) and a short answer (3 points, marked by hand, which is the API's default for it).
async function practiceSet(s: Setup, title: string, publish = false) {
  const cookie = cookieHeader((await loginAs(s.teacher)).token!);
  const created = await api("/api/v1/forms", {
    method: "POST",
    cookie,
    body: {
      kind: "PRACTICE_SET",
      branchId: s.home.id,
      title,
      instructions: "Show your working.",
      maxDurationMinutes: 20,
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
          prompt: "Name the process plants use to make food.",
          questionType: "SHORT",
          correctAnswer: "photosynthesis",
          points: 3,
          sortOrder: 1,
        },
      ],
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const form = await db.form.findFirstOrThrow({ where: { title } });
  if (publish) {
    const done = await api(`/api/v1/forms/${form.id}`, { method: "PATCH", cookie, body: { branchId: s.home.id, status: "PUBLISHED" } });
    expect(done.status).toBe(200);
  }
  return form;
}

async function pupilRecord(s: Setup, firstName: string, admissionNo: string) {
  return db.studentRecord.create({
    data: { branchId: s.home.id, admissionNo, firstName, lastName: tag, gender: Gender.FEMALE, dateOfBirth: new Date("2013-04-04") },
  });
}

/// A questionnaire for teachers (single-choice, written), published through the API.
async function questionnaire(s: Setup, title: string, isAnonymous: boolean) {
  const cookie = cookieHeader((await loginAs(s.teacher)).token!);
  const created = await api("/api/v1/forms", {
    method: "POST",
    cookie,
    body: {
      kind: "QUESTIONNAIRE",
      branchId: s.home.id,
      title,
      instructions: "Be honest.",
      isAnonymous,
      audienceKind: "MEMBERS",
      roles: ["TEACHING_STAFF"],
      questions: [
        {
          prompt: "How heavy is your workload?",
          questionType: "SINGLE",
          options: [
            { id: "A", text: "Light" },
            { id: "B", text: "Heavy" },
          ],
        },
        { prompt: "Anything to add?", questionType: "TEXT" },
      ],
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const form = await db.form.findFirstOrThrow({ where: { title }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  const done = await api(`/api/v1/forms/${form.id}`, { method: "PATCH", cookie, body: { branchId: s.home.id, status: "PUBLISHED" } });
  expect(done.status).toBe(200);
  return form;
}

/// A stored answer sheet of a questionnaire, as the answering route would have left it.
async function answerSheet(s: Setup, form: Awaited<ReturnType<typeof questionnaire>>, choice: string, said: string, by: string | null) {
  const response = await db.formResponse.create({
    data: { branchId: s.home.id, formId: form.id, respondentId: by, status: "COMPLETED", submittedAt: new Date() },
  });
  await db.formAnswer.createMany({
    data: [
      { branchId: s.home.id, responseId: response.id, formQuestionId: form.questions[0]!.id, value: choice },
      { branchId: s.home.id, responseId: response.id, formQuestionId: form.questions[1]!.id, value: said },
    ],
  });
}

async function openFromList(page: Page, isMobile: boolean, tab: string, title: string) {
  if (isMobile) {
    await mainNav(page).getByRole("button", { name: "More" }).click();
    await dialog(page).getByRole("link", { name: "Forms" }).click();
  } else {
    await mainNav(page).getByRole("link", { name: "Forms" }).click();
  }
  await expect(page).toHaveURL(/\/forms$/);
  await page.getByRole("tab", { name: tab }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/forms\/[^/]+$/);
}

test.describe("opening a form and its overview", () => {
  test("the title in the list leads to the form's page: its details, its status, and a way back", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Number work`;
    await practiceSet(s, title);
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Practice sets", title);

    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Forms" })).toHaveAttribute("href", "/forms");
    for (const name of ["Overview", "Questions", "Results"]) await expect(page.getByRole("tab", { name })).toBeVisible();
    const overview = panel(page);
    await expect(overview).toContainText("Draft");
    await expect(overview).toContainText("Show your working.");
    await expect(overview).toContainText("20 minutes");
    await expect(overview).toContainText(s.group.name);
    await expect(overview).toContainText(`${tag} Teacher`);
    await checkBothThemes(page, "a practice set's overview");
  });

  test("a teacher edits the details, publishes the set, and closes it after a confirmation", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Number work`;
    const form = await practiceSet(s, title);
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Practice sets", title);

    await page.getByRole("button", { name: "Edit details" }).click();
    await dialog(page).getByLabel("Title").fill(`${title} (revised)`);
    await dialog(page).getByLabel("Time limit (minutes)").fill("35");
    await checkBothThemes(page, "the edit dialog");
    await dialog(page).getByRole("button", { name: "Save changes" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: `${title} (revised)` })).toBeVisible();
    await expect(panel(page)).toContainText("35 minutes");
    const saved = await db.form.findFirstOrThrow({ where: { id: form.id } });
    expect(saved.title).toBe(`${title} (revised)`);
    expect(saved.maxDurationMinutes).toBe(35);

    await page.getByRole("button", { name: "Publish" }).click();
    await expect(panel(page)).toContainText("Published");
    expect((await db.form.findFirstOrThrow({ where: { id: form.id } })).status).toBe("PUBLISHED");

    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog(page)).toContainText("Close this practice set?");
    await dialog(page).getByRole("button", { name: "Close it" }).click();
    await expect(panel(page)).toContainText("Closed");
    expect((await db.form.findFirstOrThrow({ where: { id: form.id } })).status).toBe("CLOSED");
  });

  test("a published public questionnaire shows its link with a copy button, and says what a public link cannot do", async ({
    page,
    isMobile,
  }) => {
    const s = await people();
    const title = `${tag} Open survey`;
    const cookie = cookieHeader((await loginAs(s.teacher)).token!);
    const created = await api("/api/v1/forms", {
      method: "POST",
      cookie,
      body: {
        kind: "QUESTIONNAIRE",
        branchId: s.home.id,
        title,
        isAnonymous: true,
        audienceKind: "PUBLIC",
        questions: [{ prompt: "How was lunch?", questionType: "RATING" }],
      },
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const form = await db.form.findFirstOrThrow({ where: { title } });
    await api(`/api/v1/forms/${form.id}`, { method: "PATCH", cookie, body: { branchId: s.home.id, status: "PUBLISHED" } });

    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Questionnaires", title);
    await expect(panel(page).getByText(`/q/${form.shareToken}`)).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(panel(page)).toContainText("cannot tell who is answering");
    await expect(panel(page)).toContainText("Anyone with the link");
  });

  test("Print offers the answer key to whoever manages the form, and downloads a PDF", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Number work`;
    await practiceSet(s, title, true);
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Practice sets", title);

    await page.getByRole("button", { name: "Print" }).click();
    await expect(dialog(page)).toContainText("Print this practice set");
    await dialog(page).getByLabel("Include the answer key").check();
    await dialog(page).getByLabel("Reason (optional)").fill("Class copy");
    await checkBothThemes(page, "the print dialog");
    const download = page.waitForEvent("download");
    await dialog(page).getByRole("button", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await (await import("node:fs/promises")).readFile((await file.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(await db.questionBankPrintLog.count()).toBeGreaterThan(0);
  });
});

test.describe("the questions", () => {
  test("whoever manages the form sees the answer key; a colleague sees the questions without it, and is told why", async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    const s = await people();
    const title = `${tag} Number work`;
    await practiceSet(s, title, true);
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Practice sets", title);
    await page.getByRole("tab", { name: "Questions" }).click();

    const first = panel(page).getByRole("listitem").filter({ hasText: "What is 3 + 4?" });
    await expect(first).toContainText("Question 1");
    await expect(first).toContainText("2 points");
    await expect(first.getByRole("listitem").filter({ hasText: "7" })).toContainText("Correct answer");
    await expect(first.getByRole("listitem").filter({ hasText: "6" })).not.toContainText("Correct answer");
    await expect(first).toContainText("Add the two numbers.");
    const second = panel(page).getByRole("listitem").filter({ hasText: "Name the process plants use" });
    await expect(second).toContainText("photosynthesis");
    await expect(second).toContainText("Marked by hand");
    await checkBothThemes(page, "the questions (with the key)");

    const other = await browser.newContext({ baseURL: baseURL! });
    const colleagueTab = await other.newPage();
    await signInThroughUi(colleagueTab, s.colleague);
    await colleagueTab.goto("/forms");
    await colleagueTab.getByRole("tab", { name: "Practice sets" }).click();
    await colleagueTab.getByRole("link", { name: title }).click();
    await colleagueTab.getByRole("tab", { name: "Questions" }).click();
    await expect(colleagueTab.getByRole("tabpanel")).toContainText("What is 3 + 4?");
    await expect(colleagueTab.getByRole("tabpanel")).not.toContainText("Correct answer");
    await expect(colleagueTab.getByRole("tabpanel")).not.toContainText("photosynthesis");
    await expect(colleagueTab.getByRole("tabpanel")).toContainText("The answer key is shown only to whoever manages this form.");
    await other.close();
  });
});

test.describe("the results", () => {
  test("a practice set lists who answered with the score as 'x of y'; someone still answering has a dash, never a zero", async ({
    page,
    isMobile,
  }) => {
    const s = await people();
    const title = `${tag} Number work`;
    const form = await practiceSet(s, title, true);
    const ada = await pupilRecord(s, "Ada", `${tag}-1`);
    const bola = await pupilRecord(s, "Bola", `${tag}-2`);
    const chi = await pupilRecord(s, "Chi", `${tag}-3`);
    const base = { branchId: s.home.id, formId: form.id };
    await db.formResponse.create({
      data: { ...base, studentId: ada.id, status: "COMPLETED", score: 5, maxScore: 5, submittedAt: new Date() },
    });
    await db.formResponse.create({
      data: { ...base, studentId: bola.id, status: "COMPLETED", score: 2, maxScore: 5, submittedAt: new Date() },
    });
    await db.formResponse.create({ data: { ...base, studentId: chi.id, status: "IN_PROGRESS" } }); // the score column defaults to 0 here

    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Practice sets", title);
    await page.getByRole("tab", { name: "Results" }).click();
    const table = panel(page).getByRole("table", { name: "Responses" });
    await expect(table.getByRole("row").filter({ hasText: "Ada" })).toContainText("5 of 5");
    await expect(table.getByRole("row").filter({ hasText: "Bola" })).toContainText("2 of 5");
    const still = table.getByRole("row").filter({ hasText: "Chi" });
    await expect(still).toContainText("In progress");
    await expect(still).not.toContainText("0 of");
    await expect(panel(page)).toContainText("2 finished");
    await expect(panel(page)).toContainText("1 in progress");
    await checkBothThemes(page, "a practice set's results");
  });

  test("a practice set nobody has answered says so", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Number work`;
    await practiceSet(s, title, true);
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Practice sets", title);
    await page.getByRole("tab", { name: "Results" }).click();
    await expect(panel(page)).toContainText("Nobody has answered yet.");
  });

  test("a questionnaire that names its respondents shows the counts and the written answers", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Workload`;
    const form = await questionnaire(s, title, false);
    await answerSheet(s, form, "B", "More planning time, please.", s.teacher.id);
    await answerSheet(s, form, "B", "Fewer meetings.", s.colleague.id);

    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Questionnaires", title);
    await page.getByRole("tab", { name: "Results" }).click();
    await expect(panel(page)).toContainText("2 answered");
    const choice = panel(page).getByRole("listitem").filter({ hasText: "How heavy is your workload?" });
    await expect(choice).toContainText("Heavy");
    await expect(choice).toContainText("2 (100%)");
    await expect(panel(page)).toContainText("More planning time, please.");
    await expect(panel(page)).toContainText("Fewer meetings.");
    await checkBothThemes(page, "a questionnaire's results");
  });

  test("an anonymous questionnaire with too few answers shows how many, and no breakdown that could point at someone", async ({
    page,
    isMobile,
  }) => {
    const s = await people();
    const title = `${tag} Staff pulse`;
    const form = await questionnaire(s, title, true);
    await answerSheet(s, form, "B", "Only I would write this.", null);
    await answerSheet(s, form, "A", "And another.", null);

    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Questionnaires", title);
    await page.getByRole("tab", { name: "Results" }).click();
    await expect(panel(page)).toContainText("2 answered");
    await expect(panel(page)).toContainText("5 people have answered");
    await expect(panel(page)).toContainText("anonymous");
    await expect(panel(page)).not.toContainText("Only I would write this.");
    await expect(panel(page)).not.toContainText("%");
    await checkBothThemes(page, "an anonymous questionnaire's results (held back)");
  });
});

test.describe("refusals are sentences", () => {
  test("an unknown form, a form of another branch, and a pupil each get a sentence", async ({ page, browser, baseURL }) => {
    const s = await people();
    const title = `${tag} Number work`;
    const form = await practiceSet(s, title, true);
    const elsewhere = await db.branch.create({ data: { name: `${tag} Other campus` } });
    const outsider = await createUser({ name: `${tag} Outsider` });
    await db.membership.create({ data: { userId: outsider.id, branchId: elsewhere.id, role: Role.TEACHING_STAFF } });

    await signInThroughUi(page, s.teacher);
    await page.goto("/forms/does-not-exist");
    await expect(page.getByRole("alert").filter({ hasText: "We could not find that form." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Forms" })).toBeVisible();

    const other = await browser.newContext({ baseURL: baseURL! });
    const outsiderTab = await other.newPage();
    await signInThroughUi(outsiderTab, outsider);
    await outsiderTab.goto(`/forms/${form.id}`);
    await expect(outsiderTab.getByRole("alert").filter({ hasText: "We could not find that form." })).toBeVisible();
    await expect(outsiderTab.getByText(title)).toHaveCount(0);
    await other.close();

    const pupilContext = await browser.newContext({ baseURL: baseURL! });
    const pupilTab = await pupilContext.newPage();
    await signInThroughUi(pupilTab, s.pupil);
    await pupilTab.goto(`/forms/${form.id}`);
    await expect(pupilTab.getByRole("alert").filter({ hasText: "Only staff can open this page." })).toBeVisible();
    await expect(pupilTab.getByText(title)).toHaveCount(0);
    await pupilContext.close();
  });
});
