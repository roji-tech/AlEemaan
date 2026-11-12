import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { EnrollmentStatus, Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { signInThroughUi } from "./helpers";

// Task 0041, slice F2b: marking a pupil's attempt of a practice set (the queue across forms, the queue of one form, one attempt at a time) and the roll call of paper work. Forms,
// pupils and attempts are set up through the API and the database, as the other specs do; everything the teacher does on the pages is clicked and typed. Axe in both themes and a
// horizontal-overflow check on every state, on desktop and on a phone.

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
const row = (page: Page, text: string): Locator => panel(page).getByRole("listitem").filter({ hasText: text });

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `M${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "Form" RESTART IDENTITY CASCADE`);
});

async function people() {
  const home = await seedInstance();
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: `${tag} Teacher` });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: `${tag} JSS 3` } });
  return { home, teacher, group };
}
type Setup = Awaited<ReturnType<typeof people>>;

async function openForms(page: Page, isMobile: boolean) {
  if (isMobile) {
    await mainNav(page).getByRole("button", { name: "More" }).click();
    await dialog(page).getByRole("link", { name: "Forms" }).click();
  } else {
    await mainNav(page).getByRole("link", { name: "Forms" }).click();
  }
  await expect(page).toHaveURL(/\/forms$/);
}
async function openFromList(page: Page, isMobile: boolean, tab: string, title: string) {
  await openForms(page, isMobile);
  await page.getByRole("tab", { name: tab }).click();
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/forms\/[^/]+$/);
}

/// A practice set with a single-choice question (2 points, marked by the machine) and two short-answer questions (3 and 2 points, marked by hand: the API's default).
async function practiceSet(s: Setup, title: string) {
  const cookie = cookieHeader((await loginAs(s.teacher)).token!);
  const created = await api("/api/v1/forms", {
    method: "POST",
    cookie,
    body: {
      kind: "PRACTICE_SET",
      branchId: s.home.id,
      title,
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
          sortOrder: 0,
        },
        {
          prompt: "Name the process plants use to make food.",
          questionType: "SHORT",
          correctAnswer: "photosynthesis",
          points: 3,
          sortOrder: 1,
        },
        { prompt: "Why do leaves look green?", questionType: "SHORT", correctAnswer: "chlorophyll", points: 2, sortOrder: 2 },
      ],
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const form = await db.form.findFirstOrThrow({ where: { title }, include: { questions: { orderBy: { sortOrder: "asc" } } } });
  const done = await api(`/api/v1/forms/${form.id}`, { method: "PATCH", cookie, body: { branchId: s.home.id, status: "PUBLISHED" } });
  expect(done.status).toBe(200);
  return form;
}

async function pupilRecord(s: Setup, firstName: string, admissionNo: string) {
  return db.studentRecord.create({
    data: { branchId: s.home.id, admissionNo, firstName, lastName: tag, gender: Gender.FEMALE, dateOfBirth: new Date("2013-04-04") },
  });
}

/// A finished attempt, as submitting leaves it: the single-choice answer already marked, the two short answers waiting for a teacher.
async function attempt(s: Setup, form: Awaited<ReturnType<typeof practiceSet>>, pupil: { id: string }, said: [string, string]) {
  const response = await db.formResponse.create({
    data: {
      branchId: s.home.id,
      formId: form.id,
      studentId: pupil.id,
      status: "COMPLETED",
      score: 2,
      maxScore: 7,
      markingStatus: "PENDING",
      submittedAt: new Date(),
    },
  });
  const [single, short1, short2] = form.questions;
  await db.formAnswer.createMany({
    data: [
      {
        branchId: s.home.id,
        responseId: response.id,
        formQuestionId: single!.id,
        value: "B",
        isCorrect: true,
        score: 2,
        markingStatus: "NOT_REQUIRED",
      },
      { branchId: s.home.id, responseId: response.id, formQuestionId: short1!.id, value: said[0], score: 0, markingStatus: "PENDING" },
      { branchId: s.home.id, responseId: response.id, formQuestionId: short2!.id, value: said[1], score: 0, markingStatus: "PENDING" },
    ],
  });
  return response;
}

test.describe("marking", () => {
  test("a teacher marks an attempt in two sittings: the queue follows, nothing is lost, and the history says who marked what", async ({
    page,
    isMobile,
  }) => {
    const s = await people();
    const title = `${tag} Plants`;
    const form = await practiceSet(s, title);
    const ada = await pupilRecord(s, "Ada", `${tag}-1`);
    const response = await attempt(s, form, ada, ["photosynthesis", "because of chlorophyll"]);

    await signInThroughUi(page, s.teacher);
    await openForms(page, isMobile);
    await page.getByRole("tab", { name: "Marking" }).click();
    const waiting = row(page, "Ada");
    await expect(waiting).toContainText(title);
    await expect(waiting).toContainText("Waiting");
    await expect(waiting).toContainText("2 still to mark");
    await checkBothThemes(page, "the marking queue");

    await waiting.getByRole("button", { name: "Mark" }).click();
    const answers = dialog(page).getByRole("list", { name: "Answers" });
    await expect(answers.getByRole("listitem").filter({ hasText: "What is 3 + 4?" })).toContainText("Marked automatically: 2 of 2");
    await expect(answers.getByRole("listitem").filter({ hasText: "Name the process" })).toContainText("Model answer: photosynthesis");
    await expect(dialog(page)).toContainText("Score so far: 2 of 7");
    await checkBothThemes(page, "the marking dialog");

    await dialog(page).getByLabel("Score for question 2").fill("3");
    await dialog(page).getByLabel("Feedback for question 2").fill("Spot on.");
    await dialog(page).getByRole("button", { name: "Save marks" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(row(page, "Ada")).toContainText("Partly marked");
    await expect(row(page, "Ada")).toContainText("1 still to mark");
    // the answers are found by their question: they were all written in one statement, so their creation order says nothing
    let stored = await db.formResponse.findFirstOrThrow({ where: { id: response.id }, include: { answers: true } });
    const answerTo = (n: number) => stored.answers.find((a) => a.formQuestionId === form.questions[n]!.id)!;
    expect(stored.markingStatus).toBe("PARTIALLY_MARKED");
    expect(stored.score).toBe(5);
    expect(answerTo(1)).toMatchObject({ score: 3, markingStatus: "MARKED", feedback: "Spot on." });
    expect(answerTo(2)).toMatchObject({ score: 0, markingStatus: "PENDING" });

    // the second sitting: what was given is there, the other answer is marked, and the attempt leaves the default queue
    await row(page, "Ada").getByRole("button", { name: "Mark" }).click();
    await expect(dialog(page).getByLabel("Score for question 2")).toHaveValue("3");
    await expect(dialog(page).getByLabel("Feedback for question 2")).toHaveValue("Spot on.");
    await dialog(page).getByLabel("Score for question 3").fill("2");
    await dialog(page).getByRole("button", { name: "Save marks" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(panel(page)).toContainText("Nothing is waiting for marking.");
    stored = await db.formResponse.findFirstOrThrow({ where: { id: response.id }, include: { answers: true } });
    expect(stored.markingStatus).toBe("MARKED");
    expect(stored.score).toBe(7);
    // only what was changed is sent: the first answer was not marked a second time
    expect(await db.formMarkingAudit.count({ where: { responseId: response.id, action: "ANSWER_MARKED" } })).toBe(2);

    await panel(page).getByLabel("Show").selectOption("MARKED");
    const done = row(page, "Ada");
    await expect(done).toContainText("Marked");
    await expect(done).toContainText("Score: 7 of 7");
    await done.getByRole("button", { name: "Review" }).click();
    await dialog(page).getByText("Marking history").click();
    await expect(dialog(page)).toContainText(`${tag} Teacher`);
    await expect(dialog(page)).toContainText("gave 3 of 3");
  });

  test("a score above the question's points is refused with a sentence, and nothing is sent", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Plants`;
    const form = await practiceSet(s, title);
    const ada = await pupilRecord(s, "Ada", `${tag}-1`);
    const response = await attempt(s, form, ada, ["photosynthesis", "chlorophyll"]);

    await signInThroughUi(page, s.teacher);
    await openForms(page, isMobile);
    await page.getByRole("tab", { name: "Marking" }).click();
    await row(page, "Ada").getByRole("button", { name: "Mark" }).click();
    await dialog(page).getByLabel("Score for question 2").fill("5");
    await dialog(page).getByRole("button", { name: "Save marks" }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("The score for question 2 is from 0 to 3.");
    await dialog(page).getByLabel("Score for question 2").fill("");
    await dialog(page).getByRole("button", { name: "Save marks" }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("Give at least one answer a score.");
    const stored = await db.formResponse.findFirstOrThrow({ where: { id: response.id } });
    expect(stored.markingStatus).toBe("PENDING");
    expect(await db.formMarkingAudit.count({ where: { responseId: response.id } })).toBe(0);
  });

  test("a practice set's own page has a Marking tab that lists only its attempts; with none waiting it says so", async ({
    page,
    isMobile,
  }) => {
    const s = await people();
    const first = await practiceSet(s, `${tag} Plants`);
    const second = await practiceSet(s, `${tag} Animals`);
    const ada = await pupilRecord(s, "Ada", `${tag}-1`);
    const bola = await pupilRecord(s, "Bola", `${tag}-2`);
    await attempt(s, first, ada, ["photosynthesis", "chlorophyll"]);
    await attempt(s, second, bola, ["a", "b"]);

    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Practice sets", `${tag} Plants`);
    await page.getByRole("tab", { name: "Marking" }).click();
    await expect(row(page, "Ada")).toBeVisible();
    await expect(panel(page)).not.toContainText("Bola");
    await checkBothThemes(page, "a form's marking tab");

    await page.getByRole("link", { name: "Back to Forms" }).click();
    await page.getByRole("tab", { name: "Marking" }).click();
    await expect(row(page, "Ada")).toBeVisible();
    await expect(row(page, "Bola")).toBeVisible();
  });

  test("an attempt still in progress is not in the queue, and an empty queue says so", async ({ page, isMobile }) => {
    const s = await people();
    const form = await practiceSet(s, `${tag} Plants`);
    const chi = await pupilRecord(s, "Chi", `${tag}-3`);
    await db.formResponse.create({ data: { branchId: s.home.id, formId: form.id, studentId: chi.id, status: "IN_PROGRESS" } });
    await signInThroughUi(page, s.teacher);
    await openForms(page, isMobile);
    await page.getByRole("tab", { name: "Marking" }).click();
    await expect(panel(page)).toContainText("Nothing is waiting for marking.");
    await expect(panel(page)).not.toContainText("Chi");
  });
});

test.describe("the builder", () => {
  test("a short question of a practice set is marked by hand unless the teacher unticks it", async ({ page, isMobile }) => {
    const s = await people();
    await signInThroughUi(page, s.teacher);
    await openForms(page, isMobile);
    await page.getByRole("button", { name: "New practice set" }).click();
    const q1 = dialog(page).getByRole("group", { name: "Question 1" });
    await dialog(page).getByLabel("Title").fill(`${tag} Spelling`);
    await q1.getByLabel("Question type").selectOption("SHORT");
    await q1.getByLabel("Question", { exact: true }).fill("Spell 'necessary'.");
    await q1.getByLabel("Correct answer").fill("necessary");
    await expect(q1.getByLabel("Marked by hand")).toBeChecked();
    await dialog(page).getByRole("button", { name: "Add a question" }).click();
    const q2 = dialog(page).getByRole("group", { name: "Question 2" });
    await q2.getByLabel("Question type").selectOption("SHORT");
    await q2.getByLabel("Question", { exact: true }).fill("Spell 'separate'.");
    await q2.getByLabel("Correct answer").fill("separate");
    await q2.getByLabel("Marked by hand").uncheck();
    await dialog(page).getByRole("button", { name: "Save as draft" }).click();
    await expect(dialog(page)).toHaveCount(0);

    const form = await db.form.findFirstOrThrow({
      where: { title: `${tag} Spelling` },
      include: { questions: { orderBy: { sortOrder: "asc" } } },
    });
    expect(form.questions.map((q) => q.markingMethod)).toEqual(["MANUAL", "AUTO"]);
  });
});

/// Paper work for a class with three enrolled pupils, made through the API (which provisions the roll call from the enrolments). One of them has asked for marking.
async function paperWork(s: Setup, title: string) {
  const session = await db.academicSession.create({
    data: { branchId: s.home.id, label: `${tag}/27`, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const arm = await db.classArm.create({ data: { branchId: s.home.id, classGroupId: s.group.id, name: "Gold" } });
  const enrol = async (firstName: string, admissionNo: string) => {
    const pupil = await pupilRecord(s, firstName, admissionNo);
    await db.studentEnrollment.create({
      data: {
        studentId: pupil.id,
        branchId: s.home.id,
        sessionId: session.id,
        className: s.group.name,
        arm: "Gold",
        classArmId: arm.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    return pupil;
  };
  const ada = await enrol("Ada", `${tag}-1`);
  const bola = await enrol("Bola", `${tag}-2`);
  const chi = await enrol("Chi", `${tag}-3`);
  const cookie = cookieHeader((await loginAs(s.teacher)).token!);
  const created = await api("/api/v1/forms", {
    method: "POST",
    cookie,
    body: {
      kind: "PAPER_WORK",
      branchId: s.home.id,
      title,
      classGroupIds: [s.group.id],
      closesAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const form = await db.form.findFirstOrThrow({ where: { title } });
  await db.formTurnIn.updateMany({ where: { formId: form.id, studentId: chi.id }, data: { requestedAt: new Date() } });
  return { form, session, arm, ada, bola, chi, enrol };
}

test.describe("the roll call of paper work", () => {
  test("the roll call lists the class with a summary, flags who asked for marking, and starts with nothing to save", async ({
    page,
    isMobile,
  }) => {
    const s = await people();
    const title = `${tag} Holiday project`;
    await paperWork(s, title);
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Paper work", title);
    await expect(page.getByRole("tab", { name: "Roll call" })).toBeVisible();
    await page.getByRole("tab", { name: "Roll call" }).click();

    await expect(panel(page)).toContainText("0 of 3 handed in");
    await expect(panel(page)).toContainText("3 still to hand in");
    await expect(panel(page)).toContainText("1 asked for marking");
    const list = panel(page).getByRole("list", { name: "Roll call" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByRole("listitem").filter({ hasText: "Chi" })).toContainText("Asked for marking");
    await expect(list.getByRole("listitem").filter({ hasText: "Ada" })).not.toContainText("Asked for marking");
    await expect(panel(page).getByRole("button", { name: /Save changes/ })).toBeDisabled();
    await checkBothThemes(page, "the roll call");
  });

  test("a teacher records who handed in and who was late, with notes, and saves them together", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Holiday project`;
    const { form, ada, bola } = await paperWork(s, title);
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Paper work", title);
    await page.getByRole("tab", { name: "Roll call" }).click();

    await panel(page).getByLabel(`Status of Ada ${tag}`).selectOption("HANDED_IN");
    await panel(page).getByLabel(`Note for Ada ${tag}`).fill("Neat work.");
    await panel(page).getByLabel(`Status of Bola ${tag}`).selectOption("LATE");
    await panel(page).getByRole("button", { name: "Save changes (2)" }).click();
    await expect(panel(page)).toContainText("2 changes saved.");
    await expect(panel(page)).toContainText("2 of 3 handed in");
    await expect(panel(page)).toContainText("1 late");
    await expect(panel(page).getByRole("button", { name: /Save changes/ })).toBeDisabled();

    const stored = await db.formTurnIn.findMany({ where: { formId: form.id }, orderBy: { createdAt: "asc" } });
    const of = (id: string) => stored.find((t) => t.studentId === id)!;
    expect(of(ada.id)).toMatchObject({ status: "HANDED_IN", note: "Neat work." });
    expect(of(bola.id).status).toBe("LATE");
    expect(await db.formTurnInAudit.count({ where: { formId: form.id, action: "BATCH_STATUS_UPDATED" } })).toBe(2);

    // it is still there after a reload
    await page.reload();
    await page.getByRole("tab", { name: "Roll call" }).click();
    await expect(panel(page).getByLabel(`Status of Ada ${tag}`)).toHaveValue("HANDED_IN");
    await expect(panel(page).getByLabel(`Note for Ada ${tag}`)).toHaveValue("Neat work.");
  });

  test("a paper handed in after the closing time is recorded as late, and the page says so", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Holiday project`;
    const { form, ada } = await paperWork(s, title);
    await db.form.update({ where: { id: form.id }, data: { closesAt: new Date(Date.now() - 86_400_000) } });
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Paper work", title);
    await page.getByRole("tab", { name: "Roll call" }).click();
    await expect(panel(page)).toContainText("handed in after the closing time is recorded as late");

    await panel(page).getByLabel(`Status of Ada ${tag}`).selectOption("HANDED_IN");
    await panel(page).getByRole("button", { name: "Save changes (1)" }).click();
    await expect(panel(page)).toContainText("1 change saved.");
    await expect(panel(page).getByLabel(`Status of Ada ${tag}`)).toHaveValue("LATE");
    expect((await db.formTurnIn.findFirstOrThrow({ where: { formId: form.id, studentId: ada.id } })).status).toBe("LATE");
  });

  test("pupils who joined the class later are added to the roll call; with none to add it says so", async ({ page, isMobile }) => {
    const s = await people();
    const title = `${tag} Holiday project`;
    const { enrol } = await paperWork(s, title);
    await signInThroughUi(page, s.teacher);
    await openFromList(page, isMobile, "Paper work", title);
    await page.getByRole("tab", { name: "Roll call" }).click();
    await panel(page).getByRole("button", { name: "Add pupils who joined the class" }).click();
    await expect(panel(page)).toContainText("Nobody new to add.");

    await enrol("Dayo", `${tag}-4`);
    await panel(page).getByRole("button", { name: "Add pupils who joined the class" }).click();
    await expect(panel(page)).toContainText("1 pupil added to the roll call.");
    await expect(panel(page).getByRole("list", { name: "Roll call" }).getByRole("listitem")).toHaveCount(4);
    await expect(panel(page).getByRole("list", { name: "Roll call" })).toContainText("Dayo");
  });
});
