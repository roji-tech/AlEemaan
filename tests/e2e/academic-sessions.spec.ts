import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The Sessions tab of Academics (task 0093, the maintainer 2026-11-18: "where is the page to create academic session?"): create a session (with its terms), make another active (the old one
// is closed), close, rename, choose the current term, the warning when none is active, what a teacher sees, the deep links from the Overview. Desktop and phone; axe on the screens.
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
const list = (page: Page) => page.getByRole("list", { name: "Academic sessions" });
const row = (page: Page, label: string) => list(page).getByRole("listitem").filter({ hasText: label }).first();

async function asAdmin(page: Page) {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  return admin;
}
async function createFirst(page: Page, label?: string) {
  await page.getByRole("button", { name: "New session" }).click();
  if (label) await dialog(page).getByLabel("Session name").fill(label);
  await dialog(page).getByRole("button", { name: "Create session" }).click();
}

test("with no session the page says so; the first one is created with its terms and made active", async ({ page }) => {
  const admin = await asAdmin(page);
  await page.goto("/academics/sessions"); // the address a person would try: it opens the tab
  await expect(page.getByRole("tab", { name: "Sessions", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("has no active session, so pupils can't be placed in a class yet.")).toBeVisible();
  await expectAccessible(page, "the sessions tab with no session");

  await page.getByRole("button", { name: "New session" }).click();
  await expect(dialog(page).getByLabel("Session name")).toHaveValue(/^\d{4}\/\d{4}$/); // a suggestion
  await expect(dialog(page).getByLabel("Make this the active session now")).toBeChecked(); // nothing is active yet
  await expectAccessible(page, "the new session form");
  await dialog(page).getByLabel("Session name").fill("2026/2027");
  await dialog(page).getByLabel("First day").fill("2026-09-01");
  await dialog(page).getByLabel("Last day").fill("2027-07-31");
  await dialog(page).getByRole("button", { name: "Create session" }).click();

  await expect(page.getByText("2026/2027 created and made the active session.")).toBeVisible();
  await expect(page.getByText("has no active session")).toHaveCount(0);
  const item = row(page, "2026/2027");
  await expect(item).toContainText("Active");
  await expect(item.getByRole("list", { name: "Terms of 2026/2027" }).getByRole("listitem")).toHaveCount(3);
  await expectAccessible(page, "the sessions tab with an active session");

  const saved = await db.academicSession.findFirstOrThrow({ where: { branchId: admin.branchId! }, include: { periods: true } });
  expect([saved.label, saved.status, saved.periods.length]).toEqual(["2026/2027", "ACTIVE", 3]);
  expect(saved.periods.filter((p) => p.isCurrent).map((p) => p.label)).toEqual(["1st Term"]);
  expect(await db.auditLog.count({ where: { action: "ACADEMIC_SESSION_CREATED" } })).toBe(1);
});

test("a second session is planned; making it active closes the first, after a warning", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/academics?section=sessions");
  await createFirst(page, "2026/2027");
  await expect(page.getByText("2026/2027 created and made the active session.")).toBeVisible();

  await page.getByRole("button", { name: "New session" }).click();
  await expect(dialog(page).getByLabel("Make this the active session now")).not.toBeChecked(); // one is active: an explicit choice
  await dialog(page).getByLabel("Session name").fill("2027/2028");
  await dialog(page).getByLabel("Number of terms").selectOption("2");
  await dialog(page).getByRole("button", { name: "Create session" }).click();
  await expect(page.getByText("2027/2028 created.")).toBeVisible();
  await expect(row(page, "2027/2028")).toContainText("Planned");
  await expect(row(page, "2027/2028").getByRole("list", { name: "Terms of 2027/2028" }).getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Make 2027/2028 the active session" }).click();
  await expect(dialog(page)).toContainText("2026/2027 is the active session now and will be closed.");
  await dialog(page).getByRole("button", { name: "Make active" }).click();
  await expect(page.getByText("2027/2028 is now the active session of")).toBeVisible();
  await expect(row(page, "2027/2028")).toContainText("Active");
  await expect(row(page, "2026/2027")).toContainText("Closed");
  const statuses = await db.academicSession.findMany({ orderBy: { label: "asc" } });
  expect(statuses.map((s) => [s.label, s.status])).toEqual([
    ["2026/2027", "CLOSED"],
    ["2027/2028", "ACTIVE"],
  ]);
});

test("closing the active session brings the warning back; a session can be renamed; a duplicate name is refused on the name", async ({
  page,
}) => {
  await asAdmin(page);
  await page.goto("/academics?section=sessions");
  await createFirst(page, "2026/2027");
  await expect(row(page, "2026/2027")).toContainText("Active");

  await page.getByRole("button", { name: "Rename 2026/2027" }).click();
  await dialog(page).getByLabel("Session name").fill("2026-2027");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("2026-2027 saved.")).toBeVisible();

  await page.getByRole("button", { name: "New session" }).click();
  await dialog(page).getByLabel("Session name").fill("2026-2027");
  await dialog(page).getByRole("button", { name: "Create session" }).click();
  await expect(dialog(page).getByText(/already exists/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Close 2026-2027" }).click();
  await expect(dialog(page)).toContainText("will have no active session");
  await dialog(page).getByRole("button", { name: "Close session" }).click();
  await expect(page.getByText("2026-2027 is closed.")).toBeVisible();
  await expect(page.getByText("has no active session, so pupils can't be placed in a class yet.")).toBeVisible();
});

test("a term of the active session can be made current", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/academics?section=sessions");
  await createFirst(page, "2026/2027");
  await page.getByRole("button", { name: "Make 2nd Term the current term of 2026/2027" }).click();
  await expect(page.getByText("2nd Term is now the current term of 2026/2027.")).toBeVisible();
  const terms = row(page, "2026/2027").getByRole("list", { name: "Terms of 2026/2027" });
  await expect(terms.getByRole("listitem").filter({ hasText: "2nd Term" })).toContainText("Current");
  await expect(terms.getByRole("listitem").filter({ hasText: "1st Term" })).not.toContainText("Current");
});

test("a teacher sees the sessions and none of the buttons", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await db.academicSession.create({
    data: {
      branchId: admin.branchId!,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      status: "ACTIVE",
    },
  });
  const teacher = await createUser({ role: Role.TEACHING_STAFF });
  await signInThroughUi(page, teacher);
  await page.goto("/academics?section=sessions");
  await expect(row(page, "2026/2027")).toContainText("Active");
  await expect(page.getByRole("button", { name: "New session" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Close|Rename|Make)/ })).toHaveCount(0);
});

test("the Overview's shortcuts open the new-session and new-class forms", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/academics?section=sessions&new=1");
  await expect(dialog(page).getByRole("heading", { name: "New academic session" })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await page.goto("/academics?section=classes&new=1");
  await expect(dialog(page).getByRole("heading", { name: "New class" })).toBeVisible();
});

test("on a phone the sessions page and the form fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await asAdmin(page);
  await page.goto("/academics?section=sessions");
  await createFirst(page, "2026/2027");
  await expect(row(page, "2026/2027")).toContainText("Active");
  await expect(page.getByRole("tab", { name: "Sessions", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "New session" }).click();
  await expect(dialog(page).getByRole("button", { name: "Create session" })).toBeInViewport();
  await expectAccessible(page, "the new session form on a phone");
});
