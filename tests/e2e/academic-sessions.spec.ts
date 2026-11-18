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
  await expect(dialog(page).getByText("This branch already has a session with this name.")).toBeVisible(); // the form says so before asking the server (the API refuses it too: tests/api)
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
  await expect(page.getByRole("button", { name: /^(Close|Rename|Make|Edit)/ })).toHaveCount(0);
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
  // The form now has a row of dates per term, so it is taller than a phone: the dialog scrolls, and the button is one scroll away, never out of reach.
  const create = dialog(page).getByRole("button", { name: "Create session" });
  await create.scrollIntoViewIfNeeded();
  await expect(create).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expectAccessible(page, "the new session form on a phone");
});

// ---- Terms or semesters, and the dates of each (task 0097) ----

async function openNewSession(page: Page, label = "2026/2027") {
  await page.goto("/academics?section=sessions");
  await page.getByRole("button", { name: "New session" }).click();
  await dialog(page).getByLabel("Session name").fill(label);
  await dialog(page).getByLabel("First day", { exact: true }).fill("2026-09-01");
  await dialog(page).getByLabel("Last day", { exact: true }).fill("2027-07-31");
}

test("a session of semesters: two, named as semesters, with the dates the person chose", async ({ page }) => {
  await asAdmin(page);
  await openNewSession(page);
  const d = dialog(page);
  await expect(d.getByLabel("Number of terms")).toHaveValue("3"); // the usual for this branch
  await d.getByLabel("The year is divided into").selectOption("SEMESTER");
  await expect(d.getByLabel("Number of semesters")).toHaveValue("2");
  await expect(d.getByLabel("Number of semesters")).toBeDisabled(); // semesters are two
  await expect(d.getByLabel("1st Semester starts")).toHaveValue("2026-09-01");
  await expect(d.getByLabel("2nd Semester ends")).toHaveValue("2027-07-31");
  await expect(d.getByLabel("3rd Semester starts")).toHaveCount(0);
  await d.getByLabel("1st Semester ends").fill("2027-01-20");
  await d.getByLabel("2nd Semester starts").fill("2027-02-10");
  await expectAccessible(page, "the new session form with dates for each semester");
  await d.getByRole("button", { name: "Create session" }).click();

  await expect(page.getByText("2026/2027 created and made the active session.")).toBeVisible();
  const item = row(page, "2026/2027");
  await expect(item.getByRole("list", { name: "Semesters of 2026/2027" }).getByRole("listitem")).toHaveCount(2);
  await expect(item).toContainText("Current semester");
  const periods = await db.academicPeriod.findMany({ orderBy: { ordinal: "asc" } });
  expect(periods.map((p) => [p.label, p.kind, p.startDate.toISOString().slice(0, 10), p.endDate?.toISOString().slice(0, 10)])).toEqual([
    ["1st Semester", "SEMESTER", "2026-09-01", "2027-01-20"],
    ["2nd Semester", "SEMESTER", "2027-02-10", "2027-07-31"],
  ]);
});

test("dates that overlap are refused on the field and nothing is created; changing the number of terms shares the days again", async ({
  page,
}) => {
  await asAdmin(page);
  await openNewSession(page);
  const d = dialog(page);
  await d.getByLabel("2nd Term starts").fill("2026-11-01"); // before the 1st Term ends
  await d.getByRole("button", { name: "Create session" }).click();
  await expect(d.getByText("2nd Term must start after 1st Term ends.")).toBeVisible();
  expect(await db.academicSession.count()).toBe(0);

  await d.getByRole("button", { name: "Share the days equally" }).click();
  await expect(d.getByLabel("2nd Term starts")).toHaveValue("2026-12-21"); // 333 days in three shares of 111
  await d.getByLabel("2nd Term starts").fill("2026-12-25"); // a gap (a holiday) between two terms is fine
  await d.getByLabel("Number of terms").selectOption("2");
  await expect(d.getByLabel("3rd Term starts")).toHaveCount(0);
  await expect(d.getByLabel("2nd Term starts")).not.toHaveValue("2026-12-25"); // the days are shared equally again
});

test("the dates of a session and its terms can be edited afterwards; an overlap is refused in the dialog and nothing changes", async ({
  page,
}) => {
  const admin = await asAdmin(page);
  const made = await db.academicSession.create({
    data: {
      branchId: admin.branchId!,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      status: "ACTIVE",
      periods: {
        create: [
          {
            branchId: admin.branchId!,
            kind: "TERM",
            ordinal: 1,
            label: "1st Term",
            startDate: new Date("2026-09-01"),
            endDate: new Date("2026-12-15"),
            isCurrent: true,
          },
          {
            branchId: admin.branchId!,
            kind: "TERM",
            ordinal: 2,
            label: "2nd Term",
            startDate: new Date("2027-01-12"),
            endDate: new Date("2027-04-09"),
          },
          {
            branchId: admin.branchId!,
            kind: "TERM",
            ordinal: 3,
            label: "3rd Term",
            startDate: new Date("2027-04-26"),
            endDate: new Date("2027-07-31"),
          },
        ],
      },
    },
  });
  await page.goto("/academics?section=sessions");
  await page.getByRole("button", { name: "Edit the dates of 2026/2027" }).click();
  const d = dialog(page);
  await expect(d.getByRole("heading", { name: "Dates of 2026/2027" })).toBeVisible();
  await expect(d.getByLabel("1st Term ends")).toHaveValue("2026-12-15");
  await expectAccessible(page, "the edit dates dialog");

  await d.getByLabel("2nd Term starts").fill("2026-12-01");
  await d.getByRole("button", { name: "Save dates" }).click();
  await expect(d.getByText("2nd Term must start after 1st Term ends.")).toBeVisible();
  expect(await db.auditLog.count({ where: { action: "ACADEMIC_SESSION_SCHEDULE_UPDATED" } })).toBe(0);

  await d.getByLabel("2nd Term starts").fill("2027-01-13");
  await d.getByLabel("1st Term ends").fill("2026-12-18");
  await d.getByRole("button", { name: "Save dates" }).click();
  await expect(page.getByText("The dates of 2026/2027 are saved.")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  const periods = await db.academicPeriod.findMany({ where: { sessionId: made.id }, orderBy: { ordinal: "asc" } });
  expect(periods.map((p) => [p.label, p.isCurrent, p.startDate.toISOString().slice(0, 10), p.endDate?.toISOString().slice(0, 10)])).toEqual(
    [
      ["1st Term", true, "2026-09-01", "2026-12-18"],
      ["2nd Term", false, "2027-01-13", "2027-04-09"],
      ["3rd Term", false, "2027-04-26", "2027-07-31"],
    ],
  );
  expect(await db.auditLog.count({ where: { action: "ACADEMIC_SESSION_SCHEDULE_UPDATED", targetId: made.id } })).toBe(1);
});
