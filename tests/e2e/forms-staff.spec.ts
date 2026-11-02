import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { signInThroughUi } from "./helpers";

// Task 0041, slice F1: the staff's Forms page in a real browser. A teacher writes a practice set, a questionnaire and paper work, publishes and closes them; a member of
// staff answers a questionnaire addressed to them. Everything is clicked and typed as a person would; the set-up of the "For you" case uses the API, as the other specs do.
// Axe (WCAG 2.2 A/AA) and a horizontal-overflow check run on every state in BOTH themes, on desktop and on a phone.

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
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const item = (page: Page, text: string): Locator => page.getByRole("listitem").filter({ hasText: text });
const question = (page: Page, n: number): Locator => dialog(page).getByRole("group", { name: `Question ${n}` });

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `F${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "Form" RESTART IDENTITY CASCADE`);
});

async function people() {
  const home = await seedInstance();
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: `${tag} Teacher` });
  const clerk = await createUser({ role: Role.NON_TEACHING_STAFF, name: `${tag} Clerk` });
  const pupil = await createUser({ role: Role.STUDENT, name: `${tag} Pupil` });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: `${tag} JSS 1` } });
  return { home, teacher, clerk, pupil, group };
}

async function openForms(page: Page, isMobile: boolean) {
  if (isMobile) {
    await mainNav(page).getByRole("button", { name: "More" }).click();
    await dialog(page).getByRole("link", { name: "Forms" }).click();
  } else {
    await mainNav(page).getByRole("link", { name: "Forms" }).click();
  }
  await expect(page).toHaveURL(/\/forms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Forms" })).toBeVisible();
}

test.describe("who sees the page", () => {
  test("a teacher finds Forms in the navigation with its five sections; a pupil is told it is for staff", async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    const { teacher, pupil } = await people();
    await signInThroughUi(page, teacher);
    await openForms(page, isMobile);
    for (const name of ["Practice sets", "Questionnaires", "Paper work", "Marking", "For you"])
      await expect(page.getByRole("tab", { name })).toBeVisible();
    await checkBothThemes(page, "the Forms page (teacher)");

    const other = await browser.newContext({ baseURL: baseURL! });
    const pupilPage = await other.newPage();
    await signInThroughUi(pupilPage, pupil);
    await pupilPage.goto("/forms");
    await expect(pupilPage.getByRole("alert").filter({ hasText: "Only staff can open this page." })).toBeVisible();
    await expect(pupilPage.getByRole("tab")).toHaveCount(0);
    await other.close();
  });
});

test.describe("practice sets", () => {
  test("a teacher writes a practice set with a single-choice and a true/false question, saves it as a draft, publishes it, then closes it", async ({
    page,
    isMobile,
  }) => {
    const { teacher, group } = await people();
    await signInThroughUi(page, teacher);
    await openForms(page, isMobile);

    const title = `${tag} Fractions drill`;
    await page.getByRole("button", { name: "New practice set" }).click();
    await expect(dialog(page).getByRole("heading", { name: "New practice set" })).toBeVisible();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Instructions").fill("Answer every question.");
    await dialog(page).getByLabel(group.name).check();
    await dialog(page).getByLabel("Time limit (minutes)").fill("15");

    // Question 1: single choice with two options, B is right
    const q1 = question(page, 1);
    await q1.getByLabel("Question", { exact: true }).fill("What is 1/2 + 1/4?");
    await q1.getByLabel("Option A", { exact: true }).fill("1/4");
    await q1.getByLabel("Option B", { exact: true }).fill("3/4");
    await q1.getByRole("radio", { name: "Option B is correct" }).check();
    await q1.getByLabel("Points").fill("2");

    // Question 2: true or false
    await dialog(page).getByRole("button", { name: "Add a question" }).click();
    const q2 = question(page, 2);
    await q2.getByLabel("Question type").selectOption("TRUE_FALSE");
    await q2.getByLabel("Question", { exact: true }).fill("2/4 is the same as 1/2.");
    await q2.getByRole("radio", { name: "True" }).check();

    await checkBothThemes(page, "the practice-set builder");
    await dialog(page).getByRole("button", { name: "Save as draft" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "saved as a draft" })).toBeVisible();

    const row = item(page, title);
    await expect(row).toContainText("Draft");
    await expect(row).toContainText("2 questions");

    // what was stored: the key is the option id, the points and the time limit are as typed
    const form = await db.form.findFirstOrThrow({
      where: { title },
      include: { questions: { orderBy: { sortOrder: "asc" } }, audiences: true },
    });
    expect(form.kind).toBe("PRACTICE_SET");
    expect(form.status).toBe("DRAFT");
    expect(form.maxDurationMinutes).toBe(15);
    expect(form.audiences[0]!.classGroupIds).toEqual([group.id]);
    expect(form.questions.map((q) => [q.questionType, q.correctAnswer, q.points])).toEqual([
      ["SINGLE", "B", 2],
      ["TRUE_FALSE", "true", 1],
    ]);

    await row.getByRole("button", { name: "Publish" }).click();
    await expect(row).toContainText("Published");
    // away and back by clicking: it is still published
    await page.getByRole("tab", { name: "Questionnaires" }).click();
    await page.getByRole("tab", { name: "Practice sets" }).click();
    await expect(item(page, title)).toContainText("Published");

    await item(page, title).getByRole("button", { name: "Close" }).click();
    await expect(dialog(page).getByRole("heading", { name: "Close this practice set?" })).toBeVisible();
    await dialog(page).getByRole("button", { name: "Close it" }).click();
    await expect(item(page, title)).toContainText("Closed");
    expect((await db.form.findFirstOrThrow({ where: { title } })).status).toBe("CLOSED");
  });

  test("a practice set without a question is refused with a sentence, and nothing is saved", async ({ page, isMobile }) => {
    const { teacher } = await people();
    await signInThroughUi(page, teacher);
    await openForms(page, isMobile);
    await page.getByRole("button", { name: "New practice set" }).click();
    await dialog(page).getByLabel("Title").fill(`${tag} Empty`);
    await dialog(page).getByRole("button", { name: "Save as draft" }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("Write the question");
    expect(await db.form.count({ where: { title: `${tag} Empty` } })).toBe(0);
  });
});

test.describe("questionnaires", () => {
  test("a teacher makes an anonymous questionnaire open to anyone with the link, publishes it, and is given the link and told what a public form cannot promise", async ({
    page,
    isMobile,
  }) => {
    const { teacher } = await people();
    await signInThroughUi(page, teacher);
    await openForms(page, isMobile);
    await page.getByRole("tab", { name: "Questionnaires" }).click();

    const title = `${tag} Lunch survey`;
    await page.getByRole("button", { name: "New questionnaire" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Anyone with the link").check();
    await dialog(page).getByLabel("Anonymous").check();
    const q1 = question(page, 1);
    await q1.getByLabel("Question type").selectOption("RATING");
    await q1.getByLabel("Question", { exact: true }).fill("How was lunch?");
    await dialog(page).getByRole("button", { name: "Save as draft" }).click();
    await expect(dialog(page)).toHaveCount(0);

    const row = item(page, title);
    await expect(row).toContainText("Draft");
    await expect(row).toContainText("Anyone with the link");
    await expect(row).toContainText("Anonymous");
    await row.getByRole("button", { name: "Publish" }).click();
    await expect(row).toContainText("Published");

    const form = await db.form.findFirstOrThrow({ where: { title }, include: { audiences: true } });
    expect(form.isAnonymous).toBe(true);
    expect(form.audiences[0]!.kind).toBe("PUBLIC");
    expect(form.shareToken).toBeTruthy();
    // the link is shown and can be copied; the page says in words what a public link cannot do
    await expect(row.getByText(`/q/${form.shareToken}`)).toBeVisible();
    await expect(row.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(row).toContainText("cannot tell who is answering");
    await checkBothThemes(page, "the questionnaires list");
  });

  test("a questionnaire for members is limited to the roles ticked", async ({ page, isMobile }) => {
    const { teacher } = await people();
    await signInThroughUi(page, teacher);
    await openForms(page, isMobile);
    await page.getByRole("tab", { name: "Questionnaires" }).click();
    const title = `${tag} Staff pulse`;
    await page.getByRole("button", { name: "New questionnaire" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Teachers", { exact: true }).check();
    await dialog(page).getByLabel("Non-teaching staff").check();
    const q1 = question(page, 1);
    await q1.getByLabel("Question type").selectOption("TEXT");
    await q1.getByLabel("Question", { exact: true }).fill("What would help you most?");
    await dialog(page).getByRole("button", { name: "Save as draft" }).click();
    await expect(item(page, title)).toContainText("Members");
    const form = await db.form.findFirstOrThrow({ where: { title }, include: { audiences: true } });
    expect(form.audiences[0]!.kind).toBe("MEMBERS");
    expect(form.audiences[0]!.roles).toEqual(["TEACHING_STAFF", "NON_TEACHING_STAFF"]);
    // The API gives every questionnaire a token, and the public routes refuse one whose audience is not PUBLIC. What the screen owes is never to offer a link for it.
    await item(page, title).getByRole("button", { name: "Publish" }).click();
    await expect(item(page, title)).toContainText("Published");
    await expect(item(page, title).getByRole("button", { name: "Copy link" })).toHaveCount(0);
    await expect(item(page, title)).not.toContainText("/q/");
  });
});

test.describe("paper work", () => {
  test("a teacher sets paper work for a class and closes it", async ({ page, isMobile }) => {
    const { teacher, group } = await people();
    await signInThroughUi(page, teacher);
    await openForms(page, isMobile);
    await page.getByRole("tab", { name: "Paper work" }).click();

    const title = `${tag} Holiday project`;
    await page.getByRole("button", { name: "New paper work" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByRole("button", { name: "Create paper work" }).click();
    // a class is required: a sentence, nothing saved
    await expect(dialog(page).getByRole("alert")).toContainText("Choose at least one class");
    await dialog(page).getByLabel(group.name).check();
    await dialog(page).getByRole("button", { name: "Create paper work" }).click();
    await expect(dialog(page)).toHaveCount(0);

    const row = item(page, title);
    await expect(row).toContainText("Published");
    await expect(row).toContainText(group.name);
    await row.getByRole("button", { name: "Close" }).click();
    await dialog(page).getByRole("button", { name: "Close it" }).click();
    await expect(row).toContainText("Closed");
    expect((await db.form.findFirstOrThrow({ where: { title } })).status).toBe("CLOSED");
  });
});

test.describe("for you", () => {
  test("a member of staff answers a questionnaire addressed to them, once", async ({ page, isMobile }) => {
    const { home, teacher } = await people();
    // the set-up goes through the API, as the other specs do: an administrator-less branch, the teacher writes and publishes it for teachers
    const login = await loginAs(teacher);
    const cookie = cookieHeader(login.token!);
    const title = `${tag} Workload`;
    const created = await api("/api/v1/forms", {
      method: "POST",
      cookie,
      body: {
        kind: "QUESTIONNAIRE",
        branchId: home.id,
        title,
        instructions: "Be honest.",
        isAnonymous: true,
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
    expect(created.status).toBe(201);
    const publish = await api(`/api/v1/forms/${created.json.data.formId}`, {
      method: "PATCH",
      cookie,
      body: { branchId: home.id, status: "PUBLISHED" },
    });
    expect(publish.status).toBe(200);

    await signInThroughUi(page, teacher);
    await openForms(page, isMobile);
    await page.getByRole("tab", { name: "For you" }).click();
    const row = item(page, title);
    await expect(row).toContainText("Be honest.");
    await row.getByRole("button", { name: "Answer" }).click();
    await expect(dialog(page).getByRole("heading", { name: title })).toBeVisible();
    await expect(dialog(page)).toContainText("anonymous");
    await dialog(page).getByRole("radio", { name: "Heavy" }).check();
    await dialog(page).getByLabel("Anything to add?").fill("More planning time, please.");
    await checkBothThemes(page, "answering a questionnaire");
    await dialog(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(row).toContainText("Answered");
    await expect(row.getByRole("button", { name: "Answer" })).toHaveCount(0);

    // anonymous: the response is stored with no link to the person
    const stored = await db.formResponse.findFirstOrThrow({ where: { formId: created.json.data.formId }, include: { answers: true } });
    expect(stored.respondentId ?? null).toBeNull();
    expect(stored.answers).toHaveLength(2);
  });

  test("with nothing addressed to them a member of staff is told so", async ({ page, isMobile }) => {
    const { teacher } = await people();
    await signInThroughUi(page, teacher);
    await openForms(page, isMobile);
    await page.getByRole("tab", { name: "For you" }).click();
    await expect(page.getByText("Nothing is waiting for you.")).toBeVisible();
  });
});
