import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The Branches list and the single-branch page: rows are links, a branch is renamed and deleted from either, and a branch holding people or records says what it holds and is never
// deleted. Desktop and phone (e2e-mobile), axe WCAG 2.2 on the page and on the dialogs.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
const dialog = (page: Page) => page.getByRole("dialog");
let n = 0;
const unique = (label: string) => `${label} ${Date.now().toString(36)}${++n}`;

test.beforeAll(async () => {
  await seedInstance();
});

async function openList(page: Page) {
  const admin = await createUser({ role: Role.ADMIN });
  await signInThroughUi(page, admin);
  await page.goto("/branches");
  await expect(page.getByRole("heading", { level: 1, name: "Branches" })).toBeVisible();
}

test("a branch row opens the branch's own page, and the page leads back", async ({ page }) => {
  const branch = await db.branch.create({ data: { name: unique("Opened") } });
  await openList(page);
  await page.getByRole("link", { name: `${branch.name}, open` }).click();
  await expect(page).toHaveURL(new RegExp(`/branches/${branch.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: branch.name })).toBeVisible();
  await expect(page.getByText(`Code ${branch.code}`)).toBeVisible();
  await expect(page.getByText("holds no people or records")).toBeVisible();
  await expectAccessible(page, "the single-branch page");
  await page.getByRole("link", { name: "All branches" }).click();
  await expect(page).toHaveURL(/\/branches$/);
});

test("rename from the list: a taken name is refused inside the dialog, a new one is saved and shown", async ({ page }) => {
  const branch = await db.branch.create({ data: { name: unique("Before") } });
  const other = await db.branch.create({ data: { name: unique("Taken") } });
  await openList(page);
  await page.getByRole("button", { name: `Rename ${branch.name}` }).click();
  await expect(dialog(page).getByText(`Code ${branch.code}`)).toBeVisible();
  await dialog(page).getByLabel("Branch name").fill(other.name);
  await dialog(page).getByRole("button", { name: "Save name" }).click();
  await expect(dialog(page).getByText("A branch with this name already exists.")).toBeVisible();
  const name = unique("After");
  await dialog(page).getByLabel("Branch name").fill(name);
  await expectAccessible(page, "the rename dialog");
  await dialog(page).getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText(`The branch is now called “${name}”.`)).toBeVisible();
  await expect(page.getByRole("link", { name: `${name}, open` })).toBeVisible();
  expect((await db.branch.findUniqueOrThrow({ where: { id: branch.id } })).code).toBe(branch.code);
});

test("delete from the list: the button waits for the exact name; the branch and its row go", async ({ page }) => {
  const branch = await db.branch.create({ data: { name: unique("Doomed") } });
  await db.classGroup.create({ data: { branchId: branch.id, name: "Set-up class" } });
  await openList(page);
  await page.getByRole("button", { name: `Delete ${branch.name}` }).click();
  await expect(dialog(page).getByText("also removes its set-up: 1 classes")).toBeVisible();
  const confirm = dialog(page).getByRole("button", { name: "Delete branch" });
  await expect(confirm).toBeDisabled();
  await dialog(page).getByLabel(`Type ${branch.name} to confirm`).fill(branch.name.slice(0, -1));
  await expect(confirm).toBeDisabled();
  await dialog(page).getByLabel(`Type ${branch.name} to confirm`).fill(branch.name);
  await expectAccessible(page, "the delete dialog");
  await confirm.click();
  await expect(page.getByText(`“${branch.name}” was deleted.`)).toBeVisible();
  await expect(page.getByRole("link", { name: `${branch.name}, open` })).toHaveCount(0);
  expect(await db.branch.count({ where: { id: branch.id } })).toBe(0);
});

test("a branch holding a pupil says so and offers no way to delete it", async ({ page }) => {
  const branch = await db.branch.create({ data: { name: unique("Busy") } });
  await db.studentRecord.create({
    data: {
      branchId: branch.id,
      firstName: "Amina",
      lastName: "Yusuf",
      gender: "FEMALE",
      dateOfBirth: new Date("2014-03-21"),
      admissionNo: unique("ADM"),
    },
  });
  await openList(page);
  await page.getByRole("button", { name: `Delete ${branch.name}` }).click();
  await expect(dialog(page).getByText(/still holds 1 pupils/)).toBeVisible();
  await expect(dialog(page).getByLabel(/Type .* to confirm/)).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: "Delete branch" })).toHaveCount(0);
  await expectAccessible(page, "the refused delete dialog");
  await dialog(page).getByRole("button", { name: "Close", exact: true }).first().click();
  expect(await db.branch.count({ where: { id: branch.id } })).toBe(1);
});

test("the single-branch page lists what the branch holds, renames it, and deleting it returns to the list with a notice", async ({
  page,
}) => {
  const branch = await db.branch.create({ data: { name: unique("Detail") } });
  await db.studentRecord.create({
    data: {
      branchId: branch.id,
      firstName: "Musa",
      lastName: "Bello",
      gender: "MALE",
      dateOfBirth: new Date("2013-12-01"),
      admissionNo: unique("ADM"),
    },
  });
  await db.classGroup.createMany({
    data: [
      { branchId: branch.id, name: "One" },
      { branchId: branch.id, name: "Two" },
    ],
  });
  await openList(page);
  await page.goto(`/branches/${branch.id}`);
  await expect(page.getByText("A branch with people or records in it cannot be deleted")).toBeVisible();
  const card = page.getByRole("heading", { name: "What this branch holds" }).locator("..");
  await expect(card.getByText("1 pupils")).toBeVisible();
  await expect(card.getByText("2 classes")).toBeVisible();
  const name = unique("Renamed");
  await page.getByRole("button", { name: "Rename" }).click();
  await dialog(page).getByLabel("Branch name").fill(name);
  await dialog(page).getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await db.studentRecord.deleteMany({ where: { branchId: branch.id } });
  await page.reload();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog(page).getByLabel(`Type ${name} to confirm`).fill(name);
  await dialog(page).getByRole("button", { name: "Delete branch" }).click();
  await expect(page).toHaveURL(/\/branches\?deleted=/);
  await expect(page.getByText(`“${name}” was deleted.`)).toBeVisible();
  expect(await db.branch.count({ where: { id: branch.id } })).toBe(0);
});

test("the page is a superadmin's: a branch administrator is told so, and an unknown branch gets a sentence", async ({ page }) => {
  const branch = await db.branch.create({ data: { name: unique("Private") } });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto(`/branches/${branch.id}`);
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  await expect(page.getByText(branch.name)).toHaveCount(0);
  const boss = await createUser({ role: Role.ADMIN });
  await page.context().clearCookies();
  await signInThroughUi(page, boss);
  // The same words for an id that does not exist and one that cannot be an id.
  for (const id of ["does-not-exist", "a%20b%2Fc"]) {
    await page.goto(`/branches/${id}`);
    await expect(page.getByRole("alert").filter({ hasText: "We could not find that branch." })).toBeVisible();
    await expect(page.getByRole("link", { name: "All branches" })).toBeVisible();
  }
});

test("on a phone width the rows and the page do not scroll sideways", async ({ page }) => {
  const branch = await db.branch.create({
    data: { name: unique("An extremely long name that has to wrap or be cut short and never push the page wider than the screen") },
  });
  await openList(page);
  for (const url of ["/branches", `/branches/${branch.id}`]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll, url).toBeLessThanOrEqual(client);
  }
  await db.branch.delete({ where: { id: branch.id } }); // not left behind for the other specs' lists
});

test("the branch page lists the people in that branch, searchable and by role, with their status; people of other branches are not on it", async ({
  page,
}) => {
  const branch = await db.branch.create({ data: { name: unique("Staffed") } });
  const other = await db.branch.create({ data: { name: unique("Elsewhere") } });
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hauwa Bello" });
  const parent = await createUser({ role: Role.PARENT, name: "Musa Garba" });
  const gone = await createUser({ role: Role.TEACHING_STAFF, name: "Old Teacher" });
  const stranger = await createUser({ role: Role.TEACHING_STAFF, name: "Other Branch Person" });
  await db.membership.updateMany({ where: { userId: { in: [teacher.id, parent.id, gone.id] } }, data: { branchId: branch.id } });
  await db.membership.updateMany({ where: { userId: stranger.id }, data: { branchId: other.id } });
  await db.membership.updateMany({ where: { userId: gone.id }, data: { deactivatedAt: new Date() } });

  await openList(page);
  await page.getByRole("link", { name: `${branch.name}, open` }).click();
  const card = page.getByRole("heading", { level: 2, name: "People in this branch" }).locator("xpath=../..");
  await expect(card.getByText("3 people")).toBeVisible();
  await expect(card.getByText("Hauwa Bello")).toBeVisible();
  await expect(card.getByText("Other Branch Person")).toHaveCount(0);
  await expect(card.getByRole("listitem").filter({ hasText: "Old Teacher" })).toContainText("Deactivated");
  await expect(card.getByRole("listitem").filter({ hasText: "Hauwa Bello" })).toContainText("Active");

  await card.getByLabel("Search").fill("musa");
  await expect(card.getByRole("listitem")).toHaveCount(1);
  await card.getByLabel("Search").fill("zzz-no-one");
  await expect(card.getByText("No one matches these filters.")).toBeVisible();
  await card.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(card.getByRole("listitem")).toHaveCount(3);
  await expectAccessible(page, "the single-branch page with its people");
});

test("a branch with nobody says so and points to the Users page", async ({ page }) => {
  const branch = await db.branch.create({ data: { name: unique("Quiet") } });
  await openList(page);
  await page.getByRole("link", { name: `${branch.name}, open` }).click();
  await expect(page.getByText("Nobody belongs to this branch yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage people on the Users page" })).toBeVisible();
});
