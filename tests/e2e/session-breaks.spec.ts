import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The mid-term or mid-semester break on the Sessions tab (task 0098; the maintainer, 2026-11-18: "we also have something we call mid-term or mid-semester holiday, how do we apply it? and this is
// something worth annoucement too"): add a break to a term, the announcement offered right after (sent, or "Not now"), a break refused with the reason, change and remove. Desktop and phone.
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
const TERM = "Add a break to the 1st Term of 2026/2027";

async function withSession(page: Page) {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  const periods = [
    { ordinal: 1, label: "1st Term", startDate: "2026-09-01", endDate: "2026-12-15", isCurrent: true },
    { ordinal: 2, label: "2nd Term", startDate: "2027-01-12", endDate: "2027-04-09", isCurrent: false },
    { ordinal: 3, label: "3rd Term", startDate: "2027-04-26", endDate: "2027-07-31", isCurrent: false },
  ];
  const session = await db.academicSession.create({
    data: {
      branchId: admin.branchId!,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      status: "ACTIVE",
      periods: {
        create: periods.map((p) => ({
          branchId: admin.branchId!,
          kind: "TERM" as const,
          ordinal: p.ordinal,
          label: p.label,
          startDate: new Date(p.startDate),
          endDate: new Date(p.endDate),
          isCurrent: p.isCurrent,
        })),
      },
    },
    include: { periods: true },
  });
  await signInThroughUi(page, admin);
  await page.goto("/academics?section=sessions");
  return { admin, session };
}
async function addMid(page: Page, from = "2026-10-26", to = "2026-10-30") {
  await page.getByRole("button", { name: TERM }).click();
  await dialog(page).getByLabel("First day of the break").fill(from);
  await dialog(page).getByLabel("Last day of the break").fill(to);
  await dialog(page).getByRole("button", { name: "Add the break" }).click();
}

test("a break is added to a term, and the announcement is offered with the words written; sending it publishes it to the branch", async ({
  page,
}) => {
  const { admin, session } = await withSession(page);
  await page.getByRole("button", { name: TERM }).click();
  await expect(dialog(page).getByRole("heading", { name: "Add a break to the 1st Term" })).toBeVisible();
  await expect(dialog(page).getByLabel("Name of the break")).toHaveValue("Mid-term break");
  await expectAccessible(page, "the add a break form");
  await dialog(page).getByLabel("First day of the break").fill("2026-10-26");
  await dialog(page).getByLabel("Last day of the break").fill("2026-10-30");
  await dialog(page).getByRole("button", { name: "Add the break" }).click();

  await expect(page.getByText("Mid-term break added to the 1st Term.")).toBeVisible();
  const list = page.getByRole("list", { name: "Breaks in the 1st Term of 2026/2027" });
  await expect(list.getByRole("listitem")).toContainText("Mid-term break");
  await expect(list.getByRole("listitem")).toContainText("26 Oct 2026 to 30 Oct 2026");

  // The announcement is offered, with a draft to read and change.
  await expect(dialog(page).getByRole("heading", { name: "Tell everyone about the break?" })).toBeVisible();
  await expect(dialog(page).getByLabel("Title")).toHaveValue("Mid-term break: Monday 26 October 2026 to Friday 30 October 2026");
  await expect(dialog(page).getByLabel("Announcement")).toHaveValue(
    /no classes from Monday 26 October 2026 to Friday 30 October 2026 for the mid-term break in the 1st Term of 2026\/2027\. Classes resume on Monday 2 November 2026\./,
  );
  await expectAccessible(page, "the announcement offered after a break");
  await dialog(page)
    .getByLabel("Announcement")
    .fill("No classes from Monday 26 October to Friday 30 October. Classes resume on Monday 2 November.");
  await dialog(page).getByRole("button", { name: "Send the announcement" }).click();
  await expect(page.getByText(/Announcement sent to everyone in /)).toBeVisible();

  const sent = await db.announcement.findFirstOrThrow({ where: { branchId: admin.branchId! } });
  expect([sent.status, sent.targetRoles, sent.isPinned, sent.title]).toEqual([
    "PUBLISHED",
    [],
    false,
    "Mid-term break: Monday 26 October 2026 to Friday 30 October 2026",
  ]);
  expect(sent.body).toBe("No classes from Monday 26 October to Friday 30 October. Classes resume on Monday 2 November.");
  expect(sent.expiresAt?.toISOString()).toBe("2026-11-02T23:59:59.000Z");
  const saved = await db.academicBreak.findMany({ where: { branchId: admin.branchId! } });
  expect(saved.map((b) => [b.label, b.startDate.toISOString().slice(0, 10), b.endDate.toISOString().slice(0, 10), b.periodId])).toEqual([
    ["Mid-term break", "2026-10-26", "2026-10-30", session.periods.find((p) => p.ordinal === 1)!.id],
  ]);
  expect(await db.auditLog.count({ where: { action: "ACADEMIC_BREAK_CREATED" } })).toBe(1);
});

test("'Not now' sends nothing; a break outside its term or overlapping another is refused on the field and nothing is saved", async ({
  page,
}) => {
  const { admin } = await withSession(page);
  await addMid(page);
  await expect(dialog(page).getByRole("heading", { name: "Tell everyone about the break?" })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Not now" }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await db.announcement.count({ where: { branchId: admin.branchId! } })).toBe(0);

  await page.getByRole("button", { name: TERM }).click();
  await dialog(page).getByLabel("First day of the break").fill("2026-12-20");
  await dialog(page).getByLabel("Last day of the break").fill("2026-12-22");
  await dialog(page).getByRole("button", { name: "Add the break" }).click();
  await expect(dialog(page).getByText("The break must sit inside the 1st Term (2026-09-01 to 2026-12-15).")).toBeVisible();

  await dialog(page).getByLabel("First day of the break").fill("2026-10-30");
  await dialog(page).getByLabel("Last day of the break").fill("2026-11-02");
  await dialog(page).getByRole("button", { name: "Add the break" }).click();
  await expect(dialog(page).getByText("It overlaps Mid-term break (2026-10-26 to 2026-10-30).")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  expect(await db.academicBreak.count()).toBe(1);
});

test("a break can be changed and removed; a removed one is archived and its days are free again", async ({ page }) => {
  await withSession(page);
  await addMid(page);
  await dialog(page).getByRole("button", { name: "Not now" }).click();

  await page.getByRole("button", { name: "Change Mid-term break in the 1st Term of 2026/2027" }).click();
  await dialog(page).getByLabel("Last day of the break").fill("2026-10-29");
  await dialog(page).getByRole("button", { name: "Save the break" }).click();
  await expect(page.getByText("Mid-term break saved.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Breaks in the 1st Term of 2026/2027" })).toContainText("26 Oct 2026 to 29 Oct 2026");
  expect(await db.announcement.count()).toBe(0); // changing one offers nothing

  await page.getByRole("button", { name: "Remove Mid-term break from the 1st Term of 2026/2027" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Remove Mid-term break?" })).toBeVisible();
  await expect(dialog(page)).toContainText("An announcement already sent about Mid-term break is not withdrawn");
  await dialog(page).getByRole("button", { name: "Remove the break" }).click();
  await expect(page.getByText("Mid-term break removed.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Breaks in the 1st Term of 2026/2027" })).toHaveCount(0);
  const row = await db.academicBreak.findFirstOrThrow();
  expect(row.archivedAt).not.toBeNull();
  expect(await db.auditLog.count({ where: { action: { in: ["ACADEMIC_BREAK_UPDATED", "ACADEMIC_BREAK_REMOVED"] } } })).toBe(2);
});

test("a teacher sees the breaks and none of the buttons", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  const session = await db.academicSession.create({
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
        ],
      },
    },
    include: { periods: true },
  });
  await db.academicBreak.create({
    data: {
      branchId: admin.branchId!,
      periodId: session.periods[0].id,
      label: "Mid-term break",
      startDate: new Date("2026-10-26"),
      endDate: new Date("2026-10-30"),
    },
  });
  const teacher = await createUser({ role: Role.TEACHING_STAFF });
  await signInThroughUi(page, teacher);
  await page.goto("/academics?section=sessions");
  await expect(page.getByRole("list", { name: "Breaks in the 1st Term of 2026/2027" })).toContainText("Mid-term break");
  await expect(page.getByRole("button", { name: /^(Add a break|Change|Remove)/ })).toHaveCount(0);
});

test("on a phone the break form and the announcement fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await withSession(page);
  await page.getByRole("button", { name: TERM }).click();
  await dialog(page).getByLabel("First day of the break").fill("2026-10-26");
  await dialog(page).getByLabel("Last day of the break").fill("2026-10-30");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expectAccessible(page, "the break form on a phone");
  await dialog(page).getByRole("button", { name: "Add the break" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Tell everyone about the break?" })).toBeVisible();
  const send = dialog(page).getByRole("button", { name: "Send the announcement" });
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await expectAccessible(page, "the announcement on a phone");
});
