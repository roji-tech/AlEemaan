import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The administrator's Overview (task 0093): linked figures, what is not set up yet with the next step, quick actions, and the branches with their session. Desktop and phone; axe.
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

test("a new school is told what to set up first, each with a link to do it", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/dashboard");
  const todo = page.getByRole("region", { name: "To do" });
  await expect(todo.getByText("No active academic session")).toBeVisible();
  await expect(todo.getByText("No classes yet")).toBeVisible();
  await expect(todo.getByText("No subjects yet")).toBeVisible();
  await expect(todo.getByText("No pupils yet")).toBeVisible();
  // the session comes first: it is what stops pupils being placed in a class
  await expect(todo.getByRole("listitem").first()).toContainText("No active academic session");
  await expectAccessible(page, "the overview of a new school");

  await todo.getByRole("link", { name: "Create a session" }).click();
  await expect(page).toHaveURL(/\/academics\?section=sessions/);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "New academic session" })).toBeVisible();
});

test("the figures count real records and open the page they count", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  const branchId = admin.branchId!;
  await db.academicSession.create({
    data: { branchId, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), status: "ACTIVE" },
  });
  await db.classGroup.createMany({ data: [1, 2].map((n) => ({ branchId, name: `Class ${n}`, sortOrder: n })) });
  await db.subject.create({ data: { branchId, name: "Mathematics" } });
  await signInThroughUi(page, admin);
  await page.goto("/dashboard");
  const totals = page.getByRole("region", { name: "Totals" });
  await expect(totals).toContainText(/Classes\s*2/);
  await expect(totals).toContainText(/Subjects\s*1/);
  await expect(totals).toContainText(/Branches with an active session\s*1 of 1/);
  await expect(totals).toContainText(/Your role\s*Administrator/);
  await expect(page.getByText("No active academic session")).toHaveCount(0);

  await totals.getByRole("link", { name: /Classes/ }).click();
  await expect(page).toHaveURL(/\/academics$/);
  await page.goBack();
  await page.getByRole("link", { name: /^Branches with an active session/ }).click();
  await expect(page).toHaveURL(/\/academics\?section=sessions/);
  await expect(page.getByRole("tab", { name: "Sessions", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("the quick actions and the branches are links; on a phone nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/dashboard");
  for (const name of [/^New academic session/, /^New class/, /^New subject/, /^Add pupils/, /^Invite people/]) {
    await expect(page.getByRole("link", { name }).first()).toBeVisible();
  }
  await expect(page.getByRole("link", { name: new RegExp(`^${(await db.branch.findFirstOrThrow()).name}`) })).toHaveAttribute(
    "href",
    /\/branches\//,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expectAccessible(page, "the overview on a phone");
});

test("a branch administrator sees only their own branch", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await db.branch.create({ data: { name: "Somebody Else's Branch", code: "SEB" } });
  await signInThroughUi(page, admin);
  await page.goto("/dashboard");
  await expect(page.getByText("Somebody Else's Branch")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Totals" })).toContainText(/Branches\s*1/);
});
