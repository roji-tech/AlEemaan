import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0041, slice F5: the public questionnaire page `/q/[token]`, signed out. Anyone with the link reads the questionnaire, answers and sends; a link that cannot be answered says so in
// a sentence. A teacher writes and publishes the questionnaire through the API; everything the visitor does is clicked and typed in a browser with no session. Axe in both themes
// and a horizontal-overflow check on every state, on desktop and on a phone.

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

let tag = "";
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  tag = `Q${Date.now().toString(36).toUpperCase()}`;
  await resetDatabase();
});

/// A branch and a teacher who writes the questionnaires.
async function school() {
  const home = await seedInstance();
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: `${tag} Teacher` });
  const cookie = cookieHeader((await loginAs(teacher)).token!);
  return { home, teacher, cookie };
}
type School = Awaited<ReturnType<typeof school>>;

/// A questionnaire with a single choice, a rating and a long text, for everyone with the link or for members only, published unless told otherwise.
async function questionnaire(s: School, title: string, options: { audienceKind?: "PUBLIC" | "MEMBERS"; publish?: boolean } = {}) {
  const { audienceKind = "PUBLIC", publish = true } = options;
  const created = await api("/api/v1/forms", {
    method: "POST",
    cookie: s.cookie,
    body: {
      kind: "QUESTIONNAIRE",
      branchId: s.home.id,
      title,
      instructions: "Tell us how lunch was.",
      isAnonymous: true,
      audienceKind,
      ...(audienceKind === "MEMBERS" ? { roles: ["TEACHING_STAFF"] } : {}),
      questions: [
        {
          prompt: "Which meal do you like best?",
          questionType: "SINGLE",
          options: [
            { id: "A", text: "Rice" },
            { id: "B", text: "Beans" },
          ],
          sortOrder: 0,
        },
        { prompt: "How was lunch today?", questionType: "RATING", sortOrder: 1 },
        { prompt: "Anything to add?", questionType: "TEXT", sortOrder: 2 },
      ],
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const form = await db.form.findFirstOrThrow({ where: { title } });
  if (publish) {
    const done = await api(`/api/v1/forms/${form.id}`, {
      method: "PATCH",
      cookie: s.cookie,
      body: { branchId: s.home.id, status: "PUBLISHED" },
    });
    expect(done.status).toBe(200);
  }
  return db.form.findFirstOrThrow({ where: { id: form.id } });
}

const main = (page: Page) => page.getByRole("main");

test.describe("answering", () => {
  test("anyone with the link reads the questionnaire signed out, answers and sends; nothing says who they are or which school", async ({
    page,
  }) => {
    const s = await school();
    const title = `${tag} Lunch survey`;
    const form = await questionnaire(s, title);

    await page.goto(`/q/${form.shareToken}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(main(page)).toContainText("Tell us how lunch was.");
    await expect(main(page)).toContainText("Your answers are sent without your name.");
    await expect(page.locator("body")).not.toContainText(s.home.name);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await checkBothThemes(page, "the public questionnaire");

    await main(page).getByRole("radio", { name: "Beans" }).check();
    await main(page).getByRole("radio", { name: "4", exact: true }).check();
    await main(page).getByLabel("Anything to add?").fill("More rice, please.");
    await main(page).getByRole("button", { name: "Send my answers" }).click();

    await expect(main(page)).toContainText("Thank you. Your answers were sent.");
    await expect(main(page).getByRole("button", { name: "Send my answers" })).toHaveCount(0);
    await checkBothThemes(page, "the thank-you");

    const stored = await db.formResponse.findMany({
      where: { formId: form.id },
      include: { answers: { include: { formQuestion: true } } },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: "COMPLETED", studentId: null, respondentId: null });
    const byPrompt = Object.fromEntries(stored[0]!.answers.map((a) => [a.formQuestion.prompt, a.value]));
    expect(byPrompt).toEqual({ "Which meal do you like best?": "B", "How was lunch today?": 4, "Anything to add?": "More rice, please." });
  });

  test("sending nothing is refused on the screen and nothing is stored", async ({ page }) => {
    const s = await school();
    const form = await questionnaire(s, `${tag} Lunch survey`);
    await page.goto(`/q/${form.shareToken}`);
    await main(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(main(page)).toContainText("Answer at least one question.");
    expect(await db.formResponse.count({ where: { formId: form.id } })).toBe(0);
  });

  test("a questionnaire that closes while someone is answering says so and keeps their answers on the screen", async ({ page }) => {
    const s = await school();
    const form = await questionnaire(s, `${tag} Lunch survey`);
    await page.goto(`/q/${form.shareToken}`);
    await main(page).getByRole("radio", { name: "Rice" }).check();
    await main(page).getByLabel("Anything to add?").fill("Closing soon.");
    await db.form.update({ where: { id: form.id }, data: { status: "CLOSED" } });
    await main(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(main(page).getByRole("alert")).toContainText("This questionnaire is closed.");
    await expect(main(page).getByRole("radio", { name: "Rice" })).toBeChecked();
    await expect(main(page).getByLabel("Anything to add?")).toHaveValue("Closing soon.");
    expect(await db.formResponse.count({ where: { formId: form.id } })).toBe(0);
  });

  test("the page is kept out of search engines and does not pass its address on", async ({ page }) => {
    const s = await school();
    const form = await questionnaire(s, `${tag} Lunch survey`);
    await page.goto(`/q/${form.shareToken}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  });
});

test.describe("a link that cannot be answered", () => {
  const closed = "This questionnaire is closed.";
  const cases: { name: string; sentence: string; address: (s: School) => Promise<string> }[] = [
    {
      name: "a questionnaire that was closed",
      sentence: closed,
      address: async (s) => {
        const form = await questionnaire(s, `${tag} Closed`);
        await db.form.update({ where: { id: form.id }, data: { status: "CLOSED" } });
        return `/q/${form.shareToken}`;
      },
    },
    {
      name: "a questionnaire that is still a draft",
      sentence: closed,
      address: async (s) => `/q/${(await questionnaire(s, `${tag} Draft`, { publish: false })).shareToken}`,
    },
    {
      name: "a questionnaire that opens tomorrow",
      sentence: "This questionnaire has not opened yet.",
      address: async (s) => {
        const form = await questionnaire(s, `${tag} Tomorrow`);
        await db.form.update({ where: { id: form.id }, data: { opensAt: new Date(Date.now() + 864e5) } });
        return `/q/${form.shareToken}`;
      },
    },
    {
      name: "a link that matches no questionnaire",
      sentence: "This link doesn't match a questionnaire. Check that you copied all of it.",
      address: async () => "/q/not-a-real-token-0123456789",
    },
    {
      name: "an absurdly long link",
      sentence: "This link doesn't match a questionnaire. Check that you copied all of it.",
      address: async () => `/q/${"x".repeat(300)}`,
    },
    {
      name: "a questionnaire for members only",
      sentence: "This questionnaire is not open to the public.",
      address: async (s) => `/q/${(await questionnaire(s, `${tag} Members`, { audienceKind: "MEMBERS" })).shareToken}`,
    },
  ];

  for (const c of cases) {
    test(`${c.name}: a sentence, no form`, async ({ page }) => {
      const s = await school();
      await page.goto(await c.address(s));
      await expect(main(page)).toContainText(c.sentence);
      await expect(main(page).getByRole("button", { name: "Send my answers" })).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(s.home.name);
      await expect(page.locator("body")).not.toContainText(/\b(40[0-9]|50[0-9])\b/);
      if (c.name === "a questionnaire that was closed") await checkBothThemes(page, "a closed link");
    });
  }
});
