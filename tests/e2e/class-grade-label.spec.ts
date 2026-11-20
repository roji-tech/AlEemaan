import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0123 on screen: a class gets a grade label ("Grade 7" for JSS 1) when it is made or edited, and the Classes list shows it beside the class name. The report card side is in
// report-card-traits.spec.ts. Desktop and phone, axe on the dialog.

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

test("a class is made with a grade label, edited, and cleared; the list shows the label beside the name", async ({ page }) => {
  await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Grade Admin" });
  await signInThroughUi(page, admin);
  await page.goto("/academics");
  await page.getByRole("tab", { name: "Classes", exact: true }).click();

  await page.getByRole("button", { name: "New class" }).click();
  const dialog = page.getByRole("dialog", { name: "New class" });
  await dialog.getByLabel("Class name").fill("JSS 1");
  await dialog.getByLabel("Grade label (optional)").fill("Grade 7");
  await expectAccessible(page, "the new class dialog with a grade label");
  await dialog.getByRole("button", { name: "Create class" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "JSS 1" }).first();
  await expect(card).toContainText("JSS 1 (Grade 7)");
  expect((await db.classGroup.findFirstOrThrow({ where: { name: "JSS 1" } })).gradeLabel).toBe("Grade 7");

  await clickAction(card, "Rename JSS 1");
  const edit = page.getByRole("dialog", { name: "Edit JSS 1" });
  await expect(edit.getByLabel("Grade label (optional)")).toHaveValue("Grade 7");
  await edit.getByLabel("Grade label (optional)").fill("Year 7");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "JSS 1" }).first()).toContainText("JSS 1 (Year 7)");

  await clickAction(page.getByRole("listitem").filter({ hasText: "JSS 1" }).first(), "Rename JSS 1");
  const again = page.getByRole("dialog", { name: "Edit JSS 1" });
  await again.getByLabel("Grade label (optional)").fill("");
  await again.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "JSS 1" }).first()).not.toContainText("(");
  expect((await db.classGroup.findFirstOrThrow({ where: { name: "JSS 1" } })).gradeLabel).toBeNull();
});
