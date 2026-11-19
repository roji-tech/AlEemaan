import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0106: Finance's Overview in a real browser: it opens first, reads from the server's figures, switches between this branch and every branch, fits at 360, 850 and 1280 px, and passes axe in
// both themes. The numbers are the ones the API test works out by hand (tests/api/finance-stats.spec.ts); here they are read off the screen.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
});

const dayFromNow = (days: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + days));
};
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
let seq = 0;

/// One branch's school year with a small, known set of invoices: the current term holds 200000.50 invoiced, 120000.25 collected, 80000.25 owed and 60000.25 of it late.
async function seedMoney(branchId: string) {
  const session = await db.academicSession.create({
    data: { branchId, label: "2026/2027", startDate: dayFromNow(-100), endDate: dayFromNow(200), status: "ACTIVE" },
  });
  const term = await db.academicPeriod.create({
    data: { branchId, sessionId: session.id, kind: "TERM", ordinal: 1, label: "1st Term", startDate: dayFromNow(-90), isCurrent: true },
  });
  const make = async (
    name: string,
    className: string | null,
    total: string,
    paid: string,
    status: "PAID" | "PARTIALLY_PAID" | "UNPAID",
    due: number | null,
  ) => {
    const pupil = await db.studentRecord.create({
      data: { branchId, firstName: name, lastName: "Money", gender: "MALE", admissionNo: `MN/${Date.now()}/${seq++}` },
    });
    if (className) await db.studentEnrollment.create({ data: { studentId: pupil.id, branchId, sessionId: session.id, className } });
    const invoice = await db.invoice.create({
      data: {
        branchId,
        studentId: pupil.id,
        periodId: term.id,
        invoiceNo: `INV-E-${Date.now()}-${seq++}`,
        totalAmount: total,
        amountPaid: paid,
        status,
        dueDate: due === null ? null : dayFromNow(due),
      },
    });
    if (Number(paid) > 0) {
      await db.payment.create({
        data: {
          branchId,
          invoiceId: invoice.id,
          amount: paid,
          status: "SUCCESS",
          provider: "MANUAL",
          providerRef: `R-${Date.now()}-${seq++}`,
          channel: "cash",
          paidAt: new Date(),
        },
      });
    }
  };
  await make("Ada", "JSS 1", "100000.00", "100000.00", "PAID", -50);
  await make("Bola", "JSS 1", "50000.50", "20000.25", "PARTIALLY_PAID", -40);
  await make("Chi", "JSS 2", "30000.00", "0", "UNPAID", -5);
  await make("Dayo", null, "20000.00", "0", "UNPAID", null);
}

const card = (page: Page, title: string) =>
  page
    .locator("div.rounded-2xl")
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();

test("the Overview opens first and reads off the server's figures: invoiced, collected, outstanding, overdue and the rate, for the current term", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "sized by the desktop project");
  await page.setViewportSize({ width: 1280, height: 900 });
  const branch = await seedInstance();
  await seedMoney(branch.id);
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/finance");

  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/finance$/); // the default tab needs no address of its own
  await expect(card(page, "Invoiced")).toContainText("₦200,000.50");
  await expect(card(page, "Collected")).toContainText("₦120,000.25");
  await expect(card(page, "Collected")).toContainText("60% of what was invoiced");
  await expect(card(page, "Outstanding")).toContainText("₦80,000.25");
  await expect(card(page, "Overdue")).toContainText("₦60,000.25");
  await expect(page.getByText("60% collected")).toBeVisible();

  // The sections, each with its numbers in text.
  await expect(page.getByRole("heading", { name: "Month by month" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is owed, and how late" })).toBeVisible();
  await expect(page.getByText("1 to 30 days overdue")).toBeVisible();
  await expect(page.getByText("31 to 60 days overdue")).toBeVisible();
  await expect(page.getByRole("heading", { name: "By class" })).toBeVisible();
  const classes = page.locator("section", { has: page.getByRole("heading", { name: "By class" }) });
  await expect(classes).toContainText("JSS 1");
  await expect(classes).toContainText("No class");
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "How it was paid" }) })).toContainText("Cash");

  // A single-branch administrator has nothing to switch between.
  await expect(page.getByRole("group", { name: "What to show" })).toHaveCount(0);

  // Choosing another tab changes the address and the screen; the Overview comes back with its own tab.
  await page.getByRole("tab", { name: "Student Invoices & Payments" }).click();
  await expect(page).toHaveURL(/tab=invoices/);
  await expect(page.getByText("Total Invoiced")).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(card(page, "Invoiced")).toContainText("₦200,000.50");
  // A link to a tab opens that tab.
  await page.goto("/finance?tab=invoices");
  await expect(page.getByRole("tab", { name: "Student Invoices & Payments" })).toHaveAttribute("aria-selected", "true");
});

test("the term can be changed to all terms; the figures follow, and an empty branch says so instead of showing nothing", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "sized by the desktop project");
  await page.setViewportSize({ width: 1280, height: 900 });
  const branch = await seedInstance();
  await seedMoney(branch.id);
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/finance");
  await expect(card(page, "Invoiced")).toContainText("₦200,000.50");
  await page.getByLabel("Term").selectOption({ label: "All terms" });
  await expect(card(page, "Invoiced")).toContainText("₦200,000.50"); // the school year has only one term with invoices
  await expect(page.getByRole("heading", { name: "Month by month" })).toBeVisible();
});

test("a branch with no invoices says so in each section and shows zeros", async ({ page, isMobile }) => {
  test.skip(isMobile, "sized by the desktop project");
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/finance");
  await expect(card(page, "Invoiced")).toContainText("₦0.00");
  await expect(page.getByText("Nothing is owed.")).toBeVisible();
  await expect(page.getByText("No invoices yet.")).toBeVisible();
  await expect(page.getByText("No payments yet.")).toBeVisible();
  await expect(page.getByText("Nothing invoiced or collected in the last six months.")).toBeVisible();
});

test("a superadmin switches between this branch and every branch side by side, with a total", async ({ page, isMobile }) => {
  test.skip(isMobile, "sized by the desktop project");
  await page.setViewportSize({ width: 1280, height: 900 });
  const branch = await seedInstance();
  await seedMoney(branch.id);
  const sup = await createUser({ role: Role.ADMIN, superAdmin: true });
  await signInThroughUi(page, sup);
  await page.goto("/finance");

  const group = page.getByRole("group", { name: "What to show" });
  await expect(group.getByRole("button", { name: "This branch" })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "All branches" }).click();
  await expect(group.getByRole("button", { name: "All branches" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: /^All \d+ branches together$/ })).toBeVisible();
  const list = page.getByRole("list", { name: "Branches" });
  await expect(list.locator(":scope > li")).toHaveCount(4);
  const mine = list.locator(":scope > li").filter({ hasText: branch.name });
  await expect(mine).toContainText("1st Term");
  await expect(mine).toContainText("₦200,000.50");
  await expect(mine).toContainText("60% collected");
  // A branch with no current term says so, with zeros.
  await expect(list.locator(":scope > li").filter({ hasText: "No current term" }).first()).toContainText("₦0.00");
  // The total is the sum: only one branch has money here.
  await expect(page.locator("section", { has: page.getByRole("heading", { name: /branches together/ }) })).toContainText("₦200,000.50");

  await page.getByLabel("Period").selectOption("all");
  await expect(mine).toContainText("₦200,000.50");
  await group.getByRole("button", { name: "This branch" }).click();
  await expect(card(page, "Invoiced")).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`fits 360, 850 and 1280 px and passes axe in the ${theme} theme: the Overview and every branch side by side`, async ({
    page,
    isMobile,
    baseURL,
  }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
    const branch = await seedInstance();
    await seedMoney(branch.id);
    const sup = await createUser({ role: Role.ADMIN, superAdmin: true });
    await signInThroughUi(page, sup);
    for (const size of [
      { width: 360, height: 760 },
      { width: 850, height: 900 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/finance");
      await expect(card(page, "Invoiced")).toContainText("₦200,000.50");
      expect(await sideways(page), `${size.width}px scrolls sideways (Overview)`).toBeLessThanOrEqual(0);
      let axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        axe.violations.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(" "))
              .slice(0, 3)
              .join(" | ")}`,
        ),
        `axe, Overview, ${size.width}px, ${theme}`,
      ).toEqual([]);

      await page.getByRole("button", { name: "All branches" }).click();
      await expect(page.getByRole("list", { name: "Branches" })).toBeVisible();
      expect(await sideways(page), `${size.width}px scrolls sideways (all branches)`).toBeLessThanOrEqual(0);
      axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        axe.violations.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(" "))
              .slice(0, 3)
              .join(" | ")}`,
        ),
        `axe, all branches, ${size.width}px, ${theme}`,
      ).toEqual([]);
    }
  });
}
