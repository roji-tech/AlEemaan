import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The shared list toolbar (a search box with a Filters button beside it that opens and closes a panel) and the pager, on the Academics tabs (Classes, Subjects) and the Users page.
// Desktop and phone; axe WCAG 2.2 with the panel open.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(() => {
  tag = `L${Date.now().toString(36).toUpperCase()}`;
});

const filtersButton = (page: Page) => page.getByRole("button", { name: /^Filters/ });
const panel = (page: Page) => page.getByRole("group", { name: "Filters" });

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

async function openAcademics(page: Page) {
  const user = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, user);
  await page.goto("/academics");
  await expect(page.getByRole("heading", { level: 1, name: "Academics" })).toBeVisible();
  return user;
}

test("Classes: a long list is paged, search narrows it, and the Filters button opens and closes a panel that keeps what was set", async ({
  page,
}) => {
  const user = await openAcademics(page);
  const classes = Array.from({ length: 10 }, (_, i) => ({
    branchId: user.branchId!,
    name: `${tag} Class ${String(i + 1).padStart(2, "0")}`,
    sortOrder: 100 + i,
  }));
  await db.classGroup.createMany({ data: classes });
  const withSubject = await db.classGroup.findFirstOrThrow({ where: { name: `${tag} Class 01` } });
  const subject = await db.subject.create({ data: { branchId: user.branchId!, name: `${tag} Algebra` } });
  await db.subjectOffering.create({ data: { branchId: user.branchId!, classGroupId: withSubject.id, subjectId: subject.id } });
  await page.reload();

  await expect(page.getByRole("tab", { name: "Classes", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Search").fill(tag); // only this run's classes
  await expect(page.getByText("10 classes match")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages of classes" })).toContainText("Page 1 of 2");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("navigation", { name: "Pages of classes" })).toContainText("Page 2 of 2");
  await expect(
    page
      .getByRole("list", { name: "Classes" })
      .getByRole("listitem")
      .filter({ hasText: `${tag} Class 10` }),
  ).toHaveCount(1);

  // The panel: closed at first, opens, filters, closes, and what was set stays set (and counted).
  await expect(filtersButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(panel(page)).toHaveCount(0);
  await filtersButton(page).click();
  await expect(filtersButton(page)).toHaveAttribute("aria-expanded", "true");
  await expectAccessible(page, "the classes list with the filters open");
  await panel(page).getByLabel("Set-up").selectOption("noSubjects");
  await expect(page.getByText("9 classes match")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages of classes" })).toContainText("Page 1 of 2"); // a filter returns to the first page
  await filtersButton(page).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(filtersButton(page)).toContainText("1");
  await expect(page.getByText("9 classes match")).toBeVisible();
  await filtersButton(page).click();
  await panel(page).getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByLabel("Search")).toHaveValue("");
  await expect(filtersButton(page)).not.toContainText("1");
});

test("Subjects is its own tab, with search, a filter for subjects no class studies, and its own paging", async ({ page }) => {
  const user = await openAcademics(page);
  await db.subject.createMany({
    data: Array.from({ length: 13 }, (_, i) => ({ branchId: user.branchId!, name: `${tag} Subject ${String(i + 1).padStart(2, "0")}` })),
  });
  await page.getByRole("tab", { name: "Subjects", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Subjects" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Classes and arms" })).toHaveCount(0);
  await page.getByLabel("Search").fill(tag);
  await expect(page.getByText("13 subjects match")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages of subjects" })).toContainText("Page 1 of 2");
  await page.getByLabel("Search").fill(`${tag} Subject 07`);
  await expect(page.getByText("1 subject match")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages of subjects" })).toHaveCount(0); // one page: no pager
  await page.getByLabel("Search").fill(`${tag} nothing like this`);
  await expect(page.getByText("No subject matches.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await filtersButton(page).click();
  await panel(page).getByLabel("Used by").selectOption("unused");
  await expect(page.getByText(/subjects? match/)).toBeVisible();
});

test("Users: the four filters are behind one button beside the search box, and the search box still narrows the list", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN });
  const person = await createUser({ role: Role.PARENT, name: `${tag} Findable` });
  await signInThroughUi(page, admin);
  await page.goto("/users");
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
  await expect(page.getByLabel("Role", { exact: true })).toHaveCount(0); // not stacked on the page any more
  await page.getByLabel("Search").fill(person.name);
  await expect(page.getByText(/1 person match/)).toBeVisible();
  await filtersButton(page).click();
  for (const label of ["Role", "Branch", "Access", "Status"]) await expect(panel(page).getByLabel(label, { exact: true })).toBeVisible();
  await panel(page).getByLabel("Role", { exact: true }).selectOption("TEACHING_STAFF");
  await expect(page.getByText("No one matches these filters.")).toBeVisible();
  await expect(filtersButton(page)).toContainText("1");
  await expectAccessible(page, "the users list with the filters open");
});
