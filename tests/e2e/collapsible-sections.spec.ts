import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0129 on screen (Academics > Assessment and grading): each of the three sections (Assessment schemes, Grade scales, Scheme levels) folds away and opens again, by mouse and by keyboard;
// the folded body is out of sight and out of the tab order, a section's own "New ..." button goes with it, the sections fold independently, the choice is remembered in the browser across a reload,
// and a dialog still opens from an open section. Desktop and phone, axe in both states.

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

const toggle = (page: Page, title: string) => page.getByRole("button", { name: title, exact: true });

test("each section folds and unfolds, by mouse and keyboard, independently, and the choice is remembered", async ({ page }) => {
  const branch = await seedInstance();
  const sup = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Fold Boss" });
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=grading&branch=${branch.id}`);

  // all three start open, each heading is still a heading named by its title
  for (const title of ["Assessment schemes", "Grade scales", "Scheme levels"]) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    await expect(toggle(page, title)).toHaveAttribute("aria-expanded", "true");
  }
  await expect(page.getByRole("button", { name: "New scheme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New grade scale" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New school-wide scheme" })).toBeVisible();

  // a dialog still opens from an open section
  await page.getByRole("button", { name: "New scheme" }).click();
  await expect(page.getByRole("dialog").getByLabel("Scheme name")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // mouse: fold Assessment schemes; its button and its text go, the others stay
  await toggle(page, "Assessment schemes").click();
  await expect(toggle(page, "Assessment schemes")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("How a mark is built")).toBeHidden();
  await expect(page.getByRole("button", { name: "New scheme" })).toBeHidden();
  await expect(page.getByRole("button", { name: "New grade scale" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New school-wide scheme" })).toBeVisible();
  const controlled = await toggle(page, "Assessment schemes").getAttribute("aria-controls");
  await expect(page.locator(`[id="${controlled}"]`)).toBeHidden();
  await expectAccessible(page, "the grading tab with one section folded");

  // keyboard: Enter folds Grade scales, Space opens it again
  await toggle(page, "Grade scales").focus();
  await page.keyboard.press("Enter");
  await expect(toggle(page, "Grade scales")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "New grade scale" })).toBeHidden();
  await page.keyboard.press("Space");
  await expect(toggle(page, "Grade scales")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "New grade scale" })).toBeVisible();

  // fold Scheme levels too, reload: the two folds are remembered, Grade scales is open
  await toggle(page, "Scheme levels").click();
  await expect(page.getByRole("button", { name: "New school-wide scheme" })).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Grade scales" })).toBeVisible();
  await expect(toggle(page, "Assessment schemes")).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(page, "Scheme levels")).toHaveAttribute("aria-expanded", "false");
  await expect(toggle(page, "Grade scales")).toHaveAttribute("aria-expanded", "true");
  await expectAccessible(page, "the grading tab with two sections folded");

  // open them again: the buttons come back
  await toggle(page, "Assessment schemes").click();
  await toggle(page, "Scheme levels").click();
  await expect(page.getByRole("button", { name: "New scheme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New school-wide scheme" })).toBeVisible();
  await expectAccessible(page, "the grading tab with every section open");
});
