import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The Academics page in a real browser (Slice P1): a branch administrator builds classes, arms and subjects and chooses what each class studies; a teacher only
// looks; a branch administrator sees no other branch's controls. Axe (WCAG 2.2 A/AA) runs on the page and each dialog in BOTH themes (the app is dark by default;
// the light theme is the `theme=light` cookie). Screenshots of the finished screens go to out/screenshots for the maintainer to look at.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
const SHOTS = path.resolve(__dirname, "../../out/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `E2E${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  const where = { name: { startsWith: tag } };
  await db.subjectOffering.deleteMany({ where: { OR: [{ classGroup: where }, { subject: where }] } });
  await db.classArm.deleteMany({ where: { OR: [where, { classGroup: where }] } });
  await db.classGroup.deleteMany({ where });
  await db.subject.deleteMany({ where });
});

const dialog = (page: Page) => page.getByRole("dialog");

async function openAcademics(page: Page, role: Role = Role.ADMIN, superAdmin = false) {
  const user = await createUser({ role, superAdmin });
  await signInThroughUi(page, user);
  await page.goto("/academics");
  await expect(page.getByRole("heading", { level: 1, name: "Academics" })).toBeVisible();
  return user;
}

for (const theme of ["dark", "light"] as const) {
  test(`a branch administrator builds a class with arms and subjects (${theme} theme)`, async ({ page, baseURL }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    await openAcademics(page);
    await expect(page.getByRole("heading", { level: 2, name: "Classes and arms" })).toBeVisible();
    await expect(page.getByText("No classes yet.")).toBeVisible();
    await expectAccessible(page, `academics page (${theme})`);

    await page.getByRole("button", { name: "New subject" }).click();
    await expectAccessible(page, `new subject dialog (${theme})`);
    await dialog(page).getByLabel("Subject name").fill(`${tag} Mathematics`);
    await dialog(page).getByRole("button", { name: "Create subject" }).click();
    await expect(page.getByText(`${tag} Mathematics`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "New subject" }).click();
    await dialog(page).getByLabel("Subject name").fill(`${tag} Mathematics`);
    await dialog(page).getByRole("button", { name: "Create subject" }).click();
    await expect(dialog(page).getByText("This branch already has a subject with that name or code.")).toBeVisible(); // the server's own words, at the field
    await dialog(page).getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "New class" }).click();
    await dialog(page).getByLabel("Class name").fill(`${tag} JSS 1`);
    await dialog(page).getByRole("button", { name: "Create class" }).click();
    const card = page
      .getByRole("listitem")
      .filter({ hasText: `${tag} JSS 1` })
      .first();
    await expect(card).toContainText("No subjects set");

    await card.getByRole("button", { name: `Add an arm to ${tag} JSS 1` }).click();
    await dialog(page).getByLabel("Arm name").fill("A");
    await dialog(page).getByRole("button", { name: "Add arm" }).click();
    await expect(card).toContainText("A · 0");

    await card.getByRole("button", { name: `Subjects of ${tag} JSS 1` }).click();
    await expectAccessible(page, `subjects of a class dialog (${theme})`);
    await dialog(page).getByLabel(`${tag} Mathematics`).check();
    await dialog(page).getByRole("button", { name: "Save subjects" }).click();
    await expect(card).toContainText(`${tag} Mathematics`);
    await page.screenshot({ path: `${SHOTS}/aleemaan-academics-${theme}.png`, fullPage: true });

    await card.getByRole("button", { name: `Archive ${tag} JSS 1` }).click();
    await expect(page.getByText(`${tag} JSS 1 archived.`)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: `${tag} JSS 1` })).toHaveCount(0);
    expect(await db.classGroup.count({ where: { name: `${tag} JSS 1`, archivedAt: { not: null } } })).toBe(1); // archived, not deleted
  });
}

test("a teacher sees the structure but none of the controls", async ({ page }) => {
  const branch = await seedInstance();
  await db.classGroup.create({ data: { branchId: branch.id, name: `${tag} Primary 4` } });
  const teacher = await createUser({ role: Role.TEACHING_STAFF });
  await signInThroughUi(page, teacher);
  await page.goto("/academics");
  await expect(page.getByRole("heading", { level: 1, name: "Academics" })).toBeVisible();
  await expect(page.getByText(`${tag} Primary 4`)).toBeVisible();
  await expect(page.getByRole("button", { name: /^(New|Add|Edit|Archive|Subjects)/ })).toHaveCount(0);
});

test("a branch administrator sees only their own branch, and can change it", async ({ page }) => {
  const user = await openAcademics(page, Role.ADMIN, false);
  expect(user.branchId).not.toBeNull();
  await expect(page.getByLabel("Branch")).toHaveCount(0); // one branch: nothing to choose
  await expect(page.getByRole("button", { name: "New class" })).toBeVisible();
});

test("a student or parent has no branch with staff access here", async ({ page }) => {
  const parent = await createUser({ role: Role.PARENT });
  await signInThroughUi(page, parent);
  await page.goto("/academics");
  await expect(page.getByText("You don't belong to a branch with staff access yet.")).toBeVisible();
});
