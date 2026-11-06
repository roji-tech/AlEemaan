import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { seedProgram, day } from "../support/programs-seed";
import { expectAccessible, expectFits, openProgramTab, programTab } from "./program-helpers";
import { signInThroughUi } from "./helpers";

// Programs, slice P4 (task 0043, section 11): fees as a person sees and uses them, on a desktop and a phone, in both themes. What the API allows is tested in
// tests/api/program-fees.spec.ts; here is what the screens offer, say and do, and that nobody is shown a button they cannot use.

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.afterAll(async () => {
  await resetDatabase();
});

/// A program in both branches with fees switched on, Amina and Binta in the first branch and Cara in the second, and a teacher.
async function world() {
  const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
  const seed = await seedProgram(sa.id, { both: true });
  await db.program.update({ where: { id: seed.program.id }, data: { feesEnabled: true } });
  const amina = await seed.join(seed.amina, seed.first.id, seed.group1.id);
  const binta = await seed.join(seed.binta, seed.first.id, seed.group1.id);
  const cara = await seed.join(seed.cara, seed.second.id, seed.group1.id);
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
  await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
  return { sa, seed, amina, binta, cara, teacher };
}

/// A monthly fee of ₦5,000 for everyone and this month's invoices, made straight in the database (the screens that make them are tested on their own).
async function billed(w: Awaited<ReturnType<typeof world>>) {
  const item = await db.programFeeItem.create({
    data: { programId: w.seed.program.id, name: "Monthly fee", amount: 5000, frequency: "MONTHLY", createdByUserId: w.sa.id },
  });
  const period = day(0).slice(0, 7);
  const ids: Record<string, string> = {};
  let n = 0;
  for (const [key, place, branchId, name] of [
    ["amina", w.amina, w.seed.first.id, "Amina's parent"],
    ["binta", w.binta, w.seed.first.id, "Binta's parent"],
    ["cara", w.cara, w.seed.second.id, "Cara's parent"],
  ] as const) {
    n += 1;
    const row = await db.programInvoice.create({
      data: {
        programId: w.seed.program.id,
        branchId,
        participantId: place.id,
        periodKey: period,
        invoiceNo: `PINV-2026-000${n}`,
        totalAmount: 5000,
        lineItems: [{ itemId: item.id, name: "Monthly fee", amount: 5000, discountPercent: null, net: 5000 }],
        billingName: name,
        billingPhone: "08030000000",
        createdByUserId: w.sa.id,
      },
    });
    ids[key] = row.id;
  }
  return { ids, item, period };
}

const inner = (page: Page, name: string) => page.getByRole("tablist", { name: "Fee views" }).getByRole("tab", { name, exact: true });
const invoiceRow = (page: Page, name: string) =>
  page.getByRole("list", { name: "Invoices" }).getByRole("listitem").filter({ hasText: name });
const openInvoice = async (page: Page, name: string) => {
  await invoiceRow(page, name)
    .getByRole("button", { name: /^Open invoice/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Invoice" })).toBeVisible();
};

test.describe("a super admin", () => {
  test("makes a monthly fee, sees who would get an invoice, makes the invoices, and makes them again for nothing new", async ({ page }) => {
    const w = await world();
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Fees");
    await expect(page.getByText("There are no invoices yet.")).toBeVisible();

    await inner(page, "Fees").click();
    await expect(page.getByText("No fee has been made yet.")).toBeVisible();
    await page.getByRole("button", { name: "New fee" }).click();
    const dialog = page.getByRole("dialog", { name: "New fee" });
    await dialog.getByLabel("Name").fill("Monthly fee");
    await dialog.getByLabel("Amount (₦)").fill("5000");
    await dialog.getByLabel("How often").selectOption({ label: "Every month" });
    await dialog.getByLabel("Due on day").fill("10");
    await dialog.getByRole("button", { name: "Make fee" }).click();
    await expect(page.getByText("The fee was made.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Fees" }).getByRole("listitem")).toContainText("Monthly fee · ₦5,000.00");
    await expect(page.getByRole("list", { name: "Fees" })).toContainText("Every month, due on day 10");

    await inner(page, "Make invoices").click();
    await page.getByRole("button", { name: "See who would get an invoice" }).click();
    await expect(page.getByText(/3 invoices would be made, ₦15,000.00 in all, from 1 fee/)).toBeVisible();
    await page.getByRole("button", { name: "Make 3 invoices" }).click();
    await expect(page.getByText("3 invoices were made, ₦15,000.00 in all.")).toBeVisible();
    await page.getByRole("button", { name: "See who would get an invoice" }).click();
    await expect(page.getByText(/0 invoices would be made/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Make 0/ })).toBeDisabled();
    await expect(page.getByRole("list", { name: "Skipped" })).toContainText("Already has an invoice for this period.");

    await inner(page, "Invoices").click();
    await expect(page.getByRole("list", { name: "Invoices" }).getByRole("listitem")).toHaveCount(3);
    expect(await db.programInvoice.count()).toBe(3);
  });

  test("records a part payment and then the rest; the status and the balance follow; nothing above the balance can be typed", async ({
    page,
  }) => {
    const w = await world();
    await billed(w);
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Fees");
    await expect(invoiceRow(page, "Amina Musa")).toContainText("owes ₦5,000.00");
    await openInvoice(page, "Amina Musa");
    const dialog = page.getByRole("dialog", { name: "Invoice" });
    await expect(dialog).toContainText("Unpaid");
    await dialog.getByLabel("Amount", { exact: true }).fill("6000");
    await expect(dialog.getByText("That is more than is owed.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Record payment" })).toBeDisabled();
    await dialog.getByLabel("Amount", { exact: true }).fill("2000");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByText("The payment was recorded.")).toBeVisible();
    await expect(dialog).toContainText("Part paid");
    await expect(dialog).toContainText("paid ₦2,000.00 · owes ₦3,000.00");
    await expect(dialog.getByRole("list", { name: "Payments" })).toContainText("receipt RCP-");
    await dialog.getByRole("button", { name: "Pay the full balance" }).click();
    await expect(dialog.getByLabel("Amount", { exact: true })).toHaveValue("3000");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog).toContainText("Paid");
    await expect(dialog.getByRole("button", { name: "Record payment" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(invoiceRow(page, "Amina Musa")).toContainText("owes ₦0.00");
  });

  test("gives a discount with a reason, marks an invoice pay in full only, and the school's rule is shown", async ({ page }) => {
    const w = await world();
    await billed(w);
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Fees");
    await openInvoice(page, "Binta Musa");
    const dialog = page.getByRole("dialog", { name: "Invoice" });
    await dialog.getByLabel("Discount amount").fill("1000");
    await expect(dialog.getByRole("button", { name: "Apply discount" })).toBeDisabled();
    await dialog.getByLabel("Reason for the discount").fill("Sibling discount");
    await dialog.getByRole("button", { name: "Apply discount" }).click();
    await expect(dialog.getByText("The discount was applied.")).toBeVisible();
    await expect(dialog).toContainText("Discount: Sibling discount (Super Admin)");
    await expect(dialog).toContainText("Total ₦4,000.00");
    await dialog.getByRole("button", { name: "Pay in full only" }).click();
    await expect(dialog.getByText("This invoice has to be paid in full.", { exact: true })).toBeVisible();
    await expect(dialog).toContainText("Marked pay in full only.");
    await dialog.getByLabel("Amount", { exact: true }).fill("100");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByText(/has to be paid in full/).last()).toBeVisible();
    await dialog.getByRole("button", { name: "Allow part payments" }).click();
    await expect(dialog.getByText("Part payments are allowed again.")).toBeVisible();
  });

  test("reads the report: what was billed, collected and owed, by branch and by group, and who owes", async ({ page }) => {
    const w = await world();
    const { ids } = await billed(w);
    await db.programPayment.create({
      data: {
        programId: w.seed.program.id,
        branchId: w.seed.first.id,
        invoiceId: ids.amina!,
        amount: 5000,
        status: "SUCCESS",
        providerRef: "R1",
      },
    });
    await db.programInvoice.update({ where: { id: ids.amina }, data: { amountPaid: 5000, status: "PAID" } });
    await signInThroughUi(page, w.sa);
    await openProgramTab(page, w.seed.program.id, "Fees");
    await inner(page, "Report").click();
    await expect(page.getByTestId("fees-total")).toHaveText("Billed ₦15,000.00 · collected ₦5,000.00 · owed ₦10,000.00 · 33.3% collected");
    await expect(page.getByRole("region", { name: "By branch" })).toContainText(w.seed.first.name);
    await expect(page.getByRole("region", { name: "Who owes" })).toContainText("Binta Musa");
    await expect(page.getByRole("region", { name: "Who owes" })).not.toContainText("Amina Musa");
  });

  test("turns fees on for the program in Settings and the tab appears", async ({ page }) => {
    const w = await world();
    await db.program.update({ where: { id: w.seed.program.id }, data: { feesEnabled: false } });
    await signInThroughUi(page, w.sa);
    await page.goto(`/programs/${w.seed.program.id}`);
    await expect(programTab(page, "Fees")).toHaveCount(0);
    await programTab(page, "Settings").click();
    await expect(page.getByTestId("fees-state")).toContainText("switched off for this program");
    await page.getByLabel("Charge fees in this program").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("The settings were saved.")).toBeVisible();
    await expect(programTab(page, "Fees")).toBeVisible();
  });
});

test.describe("who is shown what", () => {
  test("a branch administrator sees only the invoices of their own branch, can take a payment there, and cannot make fees or invoices", async ({
    page,
  }) => {
    const w = await world();
    await billed(w);
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" }));
    await openProgramTab(page, w.seed.program.id, "Fees");
    await expect(page.getByRole("list", { name: "Invoices" }).getByRole("listitem")).toHaveCount(2);
    await expect(invoiceRow(page, "Cara Musa")).toHaveCount(0);
    await expect(inner(page, "Fees")).toHaveCount(0);
    await expect(inner(page, "Make invoices")).toHaveCount(0);
    await openInvoice(page, "Amina Musa");
    const dialog = page.getByRole("dialog", { name: "Invoice" });
    await dialog.getByLabel("Amount", { exact: true }).fill("1000");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByText("The payment was recorded.")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await inner(page, "Report").click();
    await expect(page.getByTestId("fees-total")).toContainText("Billed ₦10,000.00 · collected ₦1,000.00");
    await expect(programTab(page, "Settings")).toHaveCount(0);
  });

  test("a teacher has no Fees tab", async ({ page }) => {
    const w = await world();
    await billed(w);
    await signInThroughUi(page, w.teacher);
    await page.goto(`/programs/${w.seed.program.id}`);
    await expect(programTab(page, "Overview")).toBeVisible();
    await expect(programTab(page, "Fees")).toHaveCount(0);
  });
});

test.describe("accessible and fits the width, in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} theme: the invoices, an invoice, the fees, a new fee, making invoices and the report`, async ({ page, context }) => {
      const w = await world();
      const { ids } = await billed(w);
      await db.programPayment.create({
        data: {
          programId: w.seed.program.id,
          branchId: w.seed.first.id,
          invoiceId: ids.amina!,
          amount: 1000,
          status: "SUCCESS",
          providerRef: "R2",
          receiptNo: "RCP-TEST-2026-0001",
        },
      });
      await db.programInvoice.update({ where: { id: ids.amina }, data: { amountPaid: 1000, status: "PARTIALLY_PAID" } });
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await signInThroughUi(page, w.sa);
      await openProgramTab(page, w.seed.program.id, "Fees");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectAccessible(page, `${theme} invoices`);
      await expectFits(page, `${theme} invoices`);
      await openInvoice(page, "Amina Musa");
      await page.getByRole("dialog").getByLabel("Amount", { exact: true }).fill("99999");
      await expectAccessible(page, `${theme} an invoice with an error`);
      await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();
      await inner(page, "Fees").click();
      await expectAccessible(page, `${theme} fees`);
      await expectFits(page, `${theme} fees`);
      await page.getByRole("button", { name: "New fee" }).click();
      await expect(page.getByRole("dialog", { name: "New fee" })).toBeVisible();
      await expectAccessible(page, `${theme} new fee`);
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await inner(page, "Make invoices").click();
      await page.getByRole("button", { name: "See who would get an invoice" }).click();
      await expect(page.getByText(/invoices would be made/)).toBeVisible();
      await expectAccessible(page, `${theme} make invoices`);
      await expectFits(page, `${theme} make invoices`);
      await inner(page, "Report").click();
      await expect(page.getByTestId("fees-total")).toBeVisible();
      await expectAccessible(page, `${theme} report`);
      await expectFits(page, `${theme} report`);
    });
  }
});
