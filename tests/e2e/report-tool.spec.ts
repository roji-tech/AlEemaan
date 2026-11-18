import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The Report tab of Quick Tools (task 0099): a signed-in person tells the developer about a problem; it is recorded with the page they were on. Desktop and phone; axe on the tab.
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

const drawer = (page: Page) => page.getByRole("dialog", { name: "Quick Tools" });
async function openReport(page: Page) {
  await page.getByRole("button", { name: /Open Quick Tools/ }).click();
  await drawer(page).getByRole("button", { name: "Report", exact: true }).click();
}

test("a teacher reports a problem from the page they are on: it is recorded with the page and who they are", async ({ page }) => {
  const teacher = await createUser({ role: Role.TEACHING_STAFF });
  await signInThroughUi(page, teacher);
  await page.goto("/dashboard");
  await openReport(page);
  await expect(drawer(page).getByRole("form", { name: "Report a problem" })).toBeVisible();
  await expectAccessible(page, "the report tab");

  // too short is refused on the field, nothing is sent
  await drawer(page).getByLabel("What happened?").fill("short");
  await drawer(page).getByRole("button", { name: "Send the report" }).click();
  await expect(drawer(page).getByText("Tell us a little more: at least 10 characters.")).toBeVisible();
  expect(await db.problemReport.count()).toBe(0);

  await drawer(page).getByLabel("What is it about?").selectOption("IDEA");
  await drawer(page).getByLabel("What happened?").fill("It would help to see today's attendance on the front page.");
  await drawer(page).getByRole("button", { name: "Send the report" }).click();
  await expect(drawer(page).getByRole("status")).toContainText("Thank you. Your report is recorded.");
  await expect(drawer(page).getByRole("status")).toContainText(/Reference: [A-Z0-9]{8}/);

  const row = await db.problemReport.findFirstOrThrow();
  expect([row.category, row.pagePath, row.userId, row.reporterEmail, row.message]).toEqual([
    "IDEA",
    "/dashboard",
    teacher.id,
    teacher.email,
    "It would help to see today's attendance on the front page.",
  ]);
  expect(row.viewport).toMatch(/^\d+x\d+$/);

  // another report can follow
  await drawer(page).getByRole("button", { name: "Send another" }).click();
  await expect(drawer(page).getByLabel("What happened?")).toHaveValue("");
});

test("on a phone the tab fits the screen and the button is reachable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const staff = await createUser({ role: Role.NON_TEACHING_STAFF });
  await signInThroughUi(page, staff);
  await page.goto("/dashboard");
  await openReport(page);
  await drawer(page).getByLabel("What happened?").fill("The page is hard to read in the sunshine outside.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expectAccessible(page, "the report tab on a phone");
  const send = drawer(page).getByRole("button", { name: "Send the report" });
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeInViewport();
  await send.click();
  await expect(drawer(page).getByRole("status")).toContainText("Your report is recorded");
  expect(await db.problemReport.count()).toBe(1);
});
