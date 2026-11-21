import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0126 on screen: the order of a class's subjects (Subjects of a class: Up and Down, saved, kept), and the file and the export of staff with no branch yet (a superadmin's
// "Add many" and "Export" under "Not placed in a branch"). Desktop and phone, axe on each dialog.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}
test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

test("the subjects of a class are put in the order the report card prints them, and the order is kept", async ({ page }) => {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Order Admin" });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1", sortOrder: 1 } });
  const ids: Record<string, string> = {};
  for (const name of ["Arabic", "Biology", "Chemistry"]) {
    const s = await db.subject.create({ data: { branchId: branch.id, name } });
    ids[name] = s.id;
    await db.subjectOffering.create({ data: { branchId: branch.id, classGroupId: group.id, subjectId: s.id } });
  }
  await signInThroughUi(page, admin);
  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  await clickAction(page, "Subjects of JSS 1");
  const dialog = page.getByRole("dialog", { name: "Subjects of JSS 1" });
  const order = dialog.getByRole("list", { name: "Order on the report card" });
  await expect(order.getByRole("listitem")).toHaveText(["1. ArabicUpDown", "2. BiologyUpDown", "3. ChemistryUpDown"]);
  await expect(dialog.getByRole("button", { name: "Move Arabic up" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Move Chemistry down" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Move Chemistry up" }).click();
  await dialog.getByRole("button", { name: "Move Chemistry up" }).click();
  await expect(order.getByRole("listitem")).toHaveText(["1. ChemistryUpDown", "2. ArabicUpDown", "3. BiologyUpDown"]);
  await expectAccessible(page, "the class subjects dialog with the order");
  await dialog.getByRole("button", { name: "Save subjects" }).click();
  await expect(dialog).toBeHidden();
  const saved = await db.subjectOffering.findMany({ where: { classGroupId: group.id }, orderBy: { sortOrder: "asc" } });
  expect(saved.map((o) => o.subjectId)).toEqual([ids.Chemistry, ids.Arabic, ids.Biology]);

  // Opened again, the order is what was saved.
  await clickAction(page, "Subjects of JSS 1");
  await expect(
    page.getByRole("dialog", { name: "Subjects of JSS 1" }).getByRole("list", { name: "Order on the report card" }).getByRole("listitem"),
  ).toHaveText(["1. ChemistryUpDown", "2. ArabicUpDown", "3. BiologyUpDown"]);
});

test("a superadmin adds staff with no branch from a file and exports them", async ({ page }) => {
  await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Loose Boss" });
  await db.staffRecord.create({ data: { branchId: null, category: "TEACHING", firstName: "Zed", lastName: "Unplaced" } });
  await signInThroughUi(page, admin);
  await page.goto("/academics?tab=staff&branch=unplaced");
  await expect(page.getByTestId("current-branch")).toHaveText("Not placed in a branch");

  await page.getByRole("button", { name: "Add many" }).click();
  const add = page.getByRole("dialog", { name: "Add staff in bulk" });
  await expect(add).toContainText("With no branch yet");
  await expect(add.getByRole("combobox", { name: "Branch" })).toHaveCount(0);
  await add.getByLabel("CSV or Excel file").setInputFiles({
    name: "loose.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Category,First name,Last name\nTeaching,Una,File\nNon-teaching,Uche,File\n"),
  });
  await expect(add).toContainText("2 ready, 0 with problems");
  await expectAccessible(page, "the review of the unplaced staff file");
  await add.getByRole("button", { name: "Save all 2 rows" }).click();
  await expect(page.getByText("2 staff records added.")).toBeVisible();
  expect(await db.staffRecord.count({ where: { branchId: null } })).toBe(3);

  await page.getByRole("button", { name: "Export" }).click();
  const exp = page.getByRole("dialog", { name: "Export staff" });
  await expect(exp).toContainText("the staff not placed in a branch");
  const download = page.waitForEvent("download");
  await exp.getByRole("radio", { name: /Everything in/ }).check();
  await exp.getByRole("radio", { name: "CSV" }).check();
  await exp.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^staff-not-placed-in-a-branch-.*\.csv$/);
  expect(await db.auditLog.count({ where: { action: "EXPORT_CREATED", targetId: "unplaced" } })).toBe(1);
});

test("the branch a person chose is remembered for the person, not the browser: another browser of the same account opens on it (task 0127)", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "the same behaviour as on a desktop; the phone only moves the picker");
  await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Memory Boss" });
  await signInThroughUi(page, admin);
  await page.goto("/forms");
  const choice = page.getByLabel("Branch", { exact: true });
  const second = await choice.evaluate((el) => (el as HTMLSelectElement).options[1].text);
  await choice.selectOption({ label: second });
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).lastBranchId).not.toBeNull();

  // A different browser, the same account: it opens on that branch with nothing in the address.
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signInThroughUi(page2, admin);
  await page2.goto("/forms");
  await expect
    .poll(() => page2.getByLabel("Branch", { exact: true }).evaluate((el) => (el as HTMLSelectElement).selectedOptions[0].text))
    .toBe(second);
  await other.close();
});
