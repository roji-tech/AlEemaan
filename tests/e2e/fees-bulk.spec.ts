import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Adding fee items in bulk, in a real browser (task 0084): a file is reviewed row by row with what it adds up to per period and class, the problem row is edited in the grid, and the
// whole list is saved. Desktop and phone (the two projects); axe (WCAG 2.2 A/AA) runs on the screens.

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

async function openBulk(page: Page) {
  const branch = await seedInstance();
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20") },
  });
  await db.academicPeriod.create({
    data: {
      branchId: branch.id,
      sessionId: session.id,
      ordinal: 1,
      label: "1st Term",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
    },
  });
  await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
  const admin = await createUser({ role: Role.ADMIN, name: "Finance Admin", superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/finance");
  await page.getByRole("tab", { name: "Fee Schedules & Structures" }).click();
  await page.getByRole("button", { name: "Add many" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Add fee items in bulk" })).toBeVisible();
}

test("a file is reviewed with what it adds up to; the problem row is fixed in the grid; the whole list is saved", async ({ page }) => {
  await openBulk(page);
  await dialog(page)
    .getByLabel("CSV or Excel file")
    .setInputFiles({
      name: "fees.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        'Period,Class,Fee item,Amount\n1st Term (2026/2027),JSS 1,Tuition,"150,000"\n1st Term (2026/2027),JSS 1,Books,1500.5\n1st Term (2026/2027),,Levy,abc\n',
      ),
    });
  await expect(summary(page)).toContainText("3 rows: 2 ready, 1 with problems");
  await expect(dialog(page).getByRole("region", { name: "What these rows add up to" })).toContainText(
    "1st Term (2026/2027) · JSS 1: ₦151,500.50 (2 lines)",
  );
  await expect(dialog(page).getByText("Use digits, like 150000, 150,000 or 150000.50.")).toBeVisible();
  await expectAccessible(page, "the fee review");

  await dialog(page).getByRole("button", { name: "Edit the 1 problem row" }).click();
  await dialog(page).getByLabel("Amount, row 4").fill("2000");
  await dialog(page).getByRole("button", { name: "Check the rows" }).click();
  await expect(summary(page)).toContainText("3 rows: 3 ready, 0 with problems");
  await expect(dialog(page).getByRole("region", { name: "What these rows add up to" })).toContainText("Every class");
  await dialog(page).getByRole("button", { name: "Save all 3 rows" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Tuition" })).toContainText("150,000");
  await expect(page.getByRole("row").filter({ hasText: "Levy" })).toContainText("2,000");
  expect(await db.feeStructure.count()).toBe(3);
});

test("a fee line that already exists is refused on its row, with the period and class named by their own words", async ({ page }) => {
  await openBulk(page);
  const branch = await seedInstance();
  const period = await db.academicPeriod.findFirstOrThrow({ where: { branchId: branch.id } });
  const jss = await db.classGroup.findFirstOrThrow({ where: { branchId: branch.id } });
  await db.feeStructure.create({
    data: { branchId: branch.id, periodId: period.id, classGroupId: jss.id, name: "Tuition", amount: "100" },
  });
  await dialog(page)
    .getByLabel("CSV or Excel file")
    .setInputFiles({
      name: "fees.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Period,Class,Fee item,Amount\n1st Term (2026/2027),JSS 1,tuition,5\n1st Term (2026/2027),JSS 9,Books,5\n"),
    });
  await expect(summary(page)).toContainText("2 rows: 0 ready, 2 with problems");
  await expect(dialog(page).getByText(/already exists for that period and class/)).toBeVisible();
  await expect(dialog(page).getByText(/There is no class called "JSS 9"/)).toBeVisible();
  expect(await db.feeStructure.count()).toBe(1);
});
