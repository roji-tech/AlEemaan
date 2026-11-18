import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Adding many classes and many subjects, in a real browser (task 0084, requested 2026-11-17): a file is reviewed row by row, a problem row is fixed in the grid, and the whole list is saved.
// Desktop and phone; axe (WCAG 2.2 A/AA) runs on the screens.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});
const dialog = (page: Page) => page.getByRole("dialog").first();
const summary = (page: Page) =>
  dialog(page)
    .getByRole("status")
    .filter({ hasText: /rows?:/ });

async function open(page: Page, tab: "Classes" | "Subjects") {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/academics");
  await page.getByRole("tab", { name: tab, exact: true }).click();
  await page.getByRole("button", { name: "Add many" }).click();
  await expect(
    dialog(page).getByRole("heading", { name: tab === "Classes" ? "Add classes in bulk" : "Add subjects in bulk" }),
  ).toBeVisible();
  return admin;
}
const file = (page: Page, text: string) =>
  dialog(page)
    .getByLabel("CSV or Excel file")
    .setInputFiles({ name: "rows.csv", mimeType: "text/csv", buffer: Buffer.from(text) });

test("subjects: a file is reviewed; a repeated name is refused on its row, fixed in the grid, and the whole list is saved", async ({
  page,
}) => {
  await open(page, "Subjects");
  await file(page, "Subject,Code\nMathematics,mth\nEnglish,\nmathematics,x\n");
  await expect(summary(page)).toContainText("3 rows: 2 ready, 1 with problems");
  await expect(dialog(page).getByText("Repeats row 2.")).toBeVisible();
  await expectAccessible(page, "the subjects review");
  await dialog(page).getByRole("button", { name: "Edit the 1 problem row" }).click();
  await dialog(page).getByLabel("Subject, row 4").fill("Biology");
  await dialog(page).getByRole("button", { name: "Check the rows" }).click();
  await expect(summary(page)).toContainText("3 rows: 3 ready, 0 with problems");
  await dialog(page).getByRole("button", { name: "Save all 3 rows" }).click();
  await expect(page.getByText("3 subjects added.")).toBeVisible();
  const saved = await db.subject.findMany({ orderBy: { name: "asc" } });
  expect(saved.map((s) => [s.name, s.code])).toEqual([
    ["Biology", "X"],
    ["English", null],
    ["Mathematics", "MTH"],
  ]);
});

test("classes: an unknown subject is named on its row; once the subject exists the classes are saved with their arms and subjects", async ({
  page,
}) => {
  const admin = await open(page, "Classes");
  await db.subject.create({ data: { branchId: admin.branchId!, name: "Mathematics" } });
  await file(page, 'Class,Arms,Subjects\nJSS 1,"A, B",Mathematics\nJSS 2,C,Physics\nJSS 3,,\n');
  await expect(summary(page)).toContainText("3 rows: 2 ready, 1 with problems");
  await expect(
    dialog(page).getByText('There is no subject called "Physics" in this branch. Add it on the Subjects tab first.'),
  ).toBeVisible();
  await expectAccessible(page, "the classes review");
  await dialog(page).getByRole("button", { name: "Edit the 1 problem row" }).click();
  await dialog(page).getByLabel("Subjects, row 3").fill("Mathematics");
  await dialog(page).getByRole("button", { name: "Check the rows" }).click();
  await expect(summary(page)).toContainText("3 rows: 3 ready, 0 with problems");
  await dialog(page).getByRole("button", { name: "Save all 3 rows" }).click();
  await expect(page.getByText("3 classes added.")).toBeVisible();
  const card = page.getByRole("list", { name: "Classes" }).getByRole("listitem").filter({ hasText: "JSS 1" }).first();
  // the facts are numbers with their labels ("2 arms", "1 subject"), read by a screen reader as term and value
  await expect(card.getByRole("term").filter({ hasText: /^arms$/ })).toBeVisible();
  await expect(card.getByRole("definition").first()).toHaveText("2");
  await expect(card).toContainText("Mathematics");
  expect(await db.classArm.count()).toBe(3);
  expect(await db.subjectOffering.count()).toBe(2);
});

test("a teacher does not get the buttons", async ({ page }) => {
  const teacher = await createUser({ role: Role.TEACHING_STAFF });
  await signInThroughUi(page, teacher);
  await page.goto("/academics");
  await expect(page.getByRole("button", { name: "Add many" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Subjects", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add many" })).toHaveCount(0);
});
