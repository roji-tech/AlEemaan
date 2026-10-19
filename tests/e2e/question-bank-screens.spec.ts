import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The question bank's two screens in a real browser (Task 0032 slice 1): choosing reviewers and the switches a superadmin sets and a branch may only narrow. Each flow is
// driven by clicking and typing, as a person would. Axe (WCAG 2.2 A/AA) and a horizontal-overflow check run on every state in BOTH themes, on desktop and on a phone.
// Screenshots go to out/screenshots.

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
/// Both themes, as the responsive spec does it: set the attribute, wait for the page to settle, scan.
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
const SHOTS = path.resolve(__dirname, "../../out/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const dialog = (page: Page) => page.getByRole("dialog");
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

// Each flow clicks through a screen and scans it with axe in both themes at several states; on a phone that passes 30 s, as the other long flows in this folder (they set 120 s).
test.describe.configure({ timeout: 120_000 });

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `Q${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE "QuestionBankAudit", "QuestionBankReviewer" RESTART IDENTITY CASCADE`);
  await db.settingValue.deleteMany({ where: { key: { startsWith: "bank." } } });
});

async function people() {
  const home = await seedInstance();
  const sup = await createUser({ superAdmin: true, name: `${tag} Super` });
  await db.membership.create({ data: { userId: sup.id, branchId: home.id, role: Role.ADMIN } });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: `${tag} Admin` });
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: `${tag} Teacher` });
  const pupil = await createUser({ role: Role.STUDENT, name: `${tag} Pupil` });
  return { home, sup, admin, teacher, pupil };
}
const optionFor = (p: { name: string; email: string }) => `${p.name} (${p.email})`;

test.describe("who sees the page", () => {
  test("an administrator finds Question bank in the navigation; a teacher does not, and is told so if they go there", async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    const { admin, teacher } = await people();
    await signInThroughUi(page, admin);
    if (isMobile) {
      await mainNav(page).getByRole("button", { name: "More" }).click();
      await dialog(page).getByRole("link", { name: "Question bank" }).click();
    } else {
      await mainNav(page).getByRole("link", { name: "Question bank" }).click();
    }
    await expect(page).toHaveURL(/\/question-bank$/);
    await expect(page.getByRole("heading", { level: 1, name: "Question bank" })).toBeVisible();

    const other = await browser.newContext({ baseURL: baseURL! });
    const teacherPage = await other.newPage();
    await signInThroughUi(teacherPage, teacher);
    await expect(teacherPage.getByRole("link", { name: "Question bank" })).toHaveCount(0);
    await teacherPage.goto("/question-bank");
    await expect(teacherPage.getByRole("main").getByRole("alert")).toContainText("Only administrators can open this page.");
    await expect(teacherPage.getByRole("tab")).toHaveCount(0);
    await other.close();
  });
});

test.describe("reviewers", () => {
  test("a branch administrator adds a subject reviewer, sees them listed, and removes them after a confirmation", async ({
    page,
  }, info) => {
    const { admin, teacher, pupil } = await people();
    await signInThroughUi(page, admin);
    await page.goto("/question-bank");
    await expect(page.getByRole("tab", { name: "Reviewers" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("No reviewers yet.")).toBeVisible();

    // a pupil is never offered; the teacher is
    const person = page.getByLabel("Person");
    await expect(person.locator("option", { hasText: pupil.name })).toHaveCount(0);
    await expect(person.locator("option", { hasText: teacher.name })).toHaveCount(1);

    // nothing chosen: told what is missing, and nothing is added
    await page.getByRole("button", { name: "Add reviewer" }).click();
    await expect(page.getByText("Choose a person.")).toBeVisible();
    await person.selectOption({ label: optionFor(teacher) });
    await page.getByLabel("One subject").check();
    await page.getByRole("button", { name: "Add reviewer" }).click();
    await expect(page.getByText("Type the subject they review.")).toBeVisible();
    await expect(page.getByText("No reviewers yet.")).toBeVisible();

    await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
    await page.getByLabel(/Exam approver/).check();
    await page.getByRole("button", { name: "Add reviewer" }).click();
    await expect(page.getByText(`${teacher.name} can now review Mathematics.`)).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: teacher.name });
    await expect(row).toContainText("Reviews Mathematics · Exam approver · This branch");
    await expect(page.getByText("No reviewers yet.")).toHaveCount(0);
    await checkBothThemes(page, "reviewers (one reviewer)");
    await page.screenshot({ path: path.join(SHOTS, `question-bank-reviewers-${info.project.name}.png`) });

    // the same person and subject again: the server says so
    await person.selectOption({ label: optionFor(teacher) });
    await page.getByLabel("One subject").check();
    await page.getByLabel("Subject", { exact: true }).fill("mathematics");
    await page.getByRole("button", { name: "Add reviewer" }).click();
    await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "already a reviewer" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: teacher.name })).toHaveCount(1);

    // remove: cancel keeps them, confirm removes them
    await page.getByRole("button", { name: `Remove ${teacher.name}` }).click();
    await expect(dialog(page)).toContainText(`Remove ${teacher.name} as a reviewer?`);
    await checkBothThemes(page, "reviewers (remove dialog)");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(row).toBeVisible();
    await page.getByRole("button", { name: `Remove ${teacher.name}` }).click();
    await dialog(page).getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText(`${teacher.name} is no longer a reviewer here.`)).toBeVisible();
    await expect(page.getByText("No reviewers yet.")).toBeVisible();
    expect(await db.questionBankAudit.count({ where: { entity: "REVIEWER" } })).toBe(2); // assigned, removed
  });

  test("a superadmin sees every reviewer, can assign one for every branch, and a branch administrator sees it but cannot remove it", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { sup, admin, teacher } = await people();
    await signInThroughUi(page, sup);
    await page.goto("/question-bank");
    await page.getByLabel("Reviewers for").selectOption({ label: "Every branch (all reviewers)" });
    await page.getByLabel("Person").selectOption({ label: optionFor(teacher) });
    await page.getByRole("button", { name: "Add reviewer" }).click();
    await expect(page.getByText(`${teacher.name} can now review every subject.`)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: teacher.name })).toContainText("Reviews every subject · Every branch");
    await checkBothThemes(page, "reviewers (superadmin, every branch)");

    const adminPage = await (await browser.newContext({ baseURL: baseURL! })).newPage();
    await signInThroughUi(adminPage, admin);
    await adminPage.goto("/question-bank");
    const row = adminPage.getByRole("listitem").filter({ hasText: teacher.name });
    await expect(row).toContainText("Every branch");
    await expect(row).toContainText("Set for every branch");
    await expect(adminPage.getByRole("button", { name: `Remove ${teacher.name}` })).toHaveCount(0);
  });
});

test.describe("reviewers: a large staff list", () => {
  test("with more than 100 teachers the list says it is cut off, a search finds the one wanted, and the choice stays when the search changes", async ({
    page,
  }) => {
    const { home, admin } = await people();
    const mine = tag.toLowerCase();
    const count = 105;
    await db.user.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        email: `${mine}-s${i + 1}@example.test`,
        name: `${tag} Staff ${String(i + 1).padStart(3, "0")}`,
        passwordHash: null,
      })),
    });
    const created = await db.user.findMany({ where: { email: { startsWith: `${mine}-s` } }, select: { id: true } });
    await db.membership.createMany({ data: created.map((u) => ({ userId: u.id, branchId: home.id, role: Role.TEACHING_STAFF })) });

    try {
      await signInThroughUi(page, admin);
      await page.goto("/question-bank");
      await expect(page.getByText("Showing the first 100 of each kind of staff.")).toBeVisible();
      const person = page.getByLabel("Person");
      await expect(person.locator("option", { hasText: `${tag} Staff 105` })).toHaveCount(0); // beyond the first 100

      await page.getByLabel("Search staff").fill(`Staff 105`);
      await expect(person.locator("option", { hasText: `${tag} Staff 105` })).toHaveCount(1);
      await expect(page.getByText("Showing the first 100 of each kind of staff.")).toHaveCount(0);
      await person.selectOption({ label: `${tag} Staff 105 (${mine}-s105@example.test)` });

      // a later search that no longer matches them does not lose the choice
      await page.getByLabel("Search staff").fill("nobody-has-this-name");
      await expect(person.locator("option", { hasText: "Choose a person" })).toHaveCount(1);
      await expect(person.locator("option", { hasText: `${tag} Staff 105` })).toHaveCount(1);
      await expect(person).toHaveValue(/.+/);
      await checkBothThemes(page, "reviewers (search with a chosen person)");

      await page.getByRole("button", { name: "Add reviewer" }).click();
      await expect(page.getByText(`${tag} Staff 105 can now review every subject.`)).toBeVisible();
      await page.getByLabel("Search staff").fill("");
      await expect(page.getByText("Showing the first 100 of each kind of staff.")).toBeVisible();
    } finally {
      // the 105 extra people would otherwise crowd the lists of every later test in this file
      const ids = created.map((u) => u.id);
      await db.membership.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  test("a search that matches nobody says so", async ({ page }) => {
    const { admin } = await people();
    await signInThroughUi(page, admin);
    await page.goto("/question-bank");
    await page.getByLabel("Search staff").fill("zzz-no-such-person");
    await expect(page.getByLabel("Person").locator("option")).toHaveText(["Nobody matches"]);
  });
});

test.describe("settings", () => {
  test("a superadmin changes two school-wide values together, and they are still there after a reload", async ({ page }, info) => {
    const { sup } = await people();
    await signInThroughUi(page, sup);
    await page.goto("/question-bank");
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByLabel("Settings for")).toHaveValue("__school__");
    await expect(page.getByLabel("Largest practice set (questions)")).toHaveValue("100");
    await checkBothThemes(page, "settings (school-wide, defaults)");

    // a number the others cannot agree with: refused, in words, nothing saved
    await page.getByLabel("Largest practice set (questions)").fill("30");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(
      page
        .getByRole("main")
        .getByRole("alert")
        .filter({ hasText: /preset/i }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByLabel("Largest practice set (questions)")).toHaveValue("100");

    // together, they agree
    await page.getByLabel("Largest practice set (questions)").fill("60");
    await page.getByLabel("Practice set sizes offered").fill("10, 20, 50");
    await page.getByLabel("Reason (optional)").fill("Smaller sets for term one");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Saved. 2 settings changed for every branch.")).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByLabel("Largest practice set (questions)")).toHaveValue("60");
    await expect(page.getByLabel("Practice set sizes offered")).toHaveValue("10, 20, 50");
    await checkBothThemes(page, "settings (school-wide, changed)");
    await page.screenshot({ path: path.join(SHOTS, `question-bank-settings-${info.project.name}.png`) });

    // saving with nothing changed says so instead of doing nothing
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Nothing to save: no setting was changed.")).toBeVisible();
    const audit = await db.questionBankAudit.findMany({ where: { entity: "SETTING" }, orderBy: { ref: "asc" } });
    expect(audit.map((a) => [a.ref, a.newValue, a.reason])).toEqual([
      ["bank.practice.maxQuestions", 60, "Smaller sets for term one"],
      ["bank.practice.presets", [10, 20, 50], "Smaller sets for term one"],
    ]);
  });

  test("entries that are not whole numbers are caught before anything is sent", async ({ page }) => {
    const { sup } = await people();
    await signInThroughUi(page, sup);
    await page.goto("/question-bank");
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByLabel("Largest practice set (questions)").fill("lots");
    await page.getByLabel("Practice set sizes offered").fill("ten, twenty");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Type a whole number.")).toBeVisible();
    await expect(page.getByText("Type whole numbers separated by commas")).toBeVisible();
    await expect(page.getByText("Some entries need fixing before this can be saved.")).toBeVisible();
    expect(await db.settingValue.count({ where: { key: { startsWith: "bank." } } })).toBe(0);
    await checkBothThemes(page, "settings (entries need fixing)");
  });

  test("a branch administrator may only narrow: a switch the school turned off cannot be turned on; stricter is saved; the school's setting can be restored", async ({
    page,
  }, info) => {
    const { home, admin } = await people();
    await db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.access.staff", value: false } });
    await signInThroughUi(page, admin);
    await page.goto("/question-bank");
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByLabel("Settings for")).toHaveCount(0); // one branch, not a superadmin: nothing to choose
    await expect(page.getByText(/A branch can only make a switch stricter/)).toBeVisible();
    const staff = page.getByLabel("Teachers and other staff can use the question bank");
    await expect(staff).not.toBeChecked(); // the school's value

    // loosening: refused, and the reason is shown by the switch
    await staff.check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "can only narrow" })).toBeVisible();
    await expect(page.getByText(/can only make this stricter than the school/)).toBeVisible();
    expect(await db.settingValue.count({ where: { branchId: home.id } })).toBe(0);
    await staff.uncheck();

    // tightening: saved for this branch only
    await page.getByLabel("Pupils can use the question bank").uncheck();
    await page.getByLabel("Largest practice set (questions)").fill("40");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(`Saved. 2 settings changed for Secondary (English).`)).toBeVisible();
    await expect(page.getByText("School: 100 questions. Applies here: 40 questions.")).toBeVisible();
    await checkBothThemes(page, "settings (branch, narrowed)");
    await page.screenshot({ path: path.join(SHOTS, `question-bank-settings-branch-${info.project.name}.png`) });
    expect(await db.settingValue.count({ where: { branchId: home.id } })).toBe(2);

    // back to the school's setting
    await page.getByRole("button", { name: "Use the school's setting for Largest practice set" }).click();
    await expect(page.getByText("This branch will use the school's setting once you save.")).toBeVisible();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Saved. One setting changed for Secondary (English).")).toBeVisible();
    await expect(page.getByLabel("Largest practice set (questions)")).toHaveValue("100");
    expect(await db.settingValue.count({ where: { branchId: home.id } })).toBe(1);
  });
});
