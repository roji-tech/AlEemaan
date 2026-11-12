import AxeBuilder from "@axe-core/playwright";
import { Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { signInThroughUi } from "./helpers";
import type { Page } from "@playwright/test";

// Task 0060: the Finance screens hard-coded Tailwind's red-500 and green-400 for their errors, their success message and the fee's Delete button, where the rest of the app uses the
// semantic tokens (danger, ok). red-500 on white is 3.8 to 1 (AA asks for 4.5 to 1 for text this size), and green-400 on a pale green is worse; the dark theme passes until a row is
// hovered. Found by the product walkthrough: its pointer rests on the fee row after "Create Item", the axe observer logged ONE color-contrast blocker at /finance, and no spec saw it
// because none hovers anything. This spec scans every state of Finance in BOTH themes, with the pointer where a person's is, and collects every violation before it asserts, so a
// failing run lists them all.

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

/// The colours TRANSITION (150 ms) on hover and when a dialog opens, and axe samples whatever is painted at that instant (tests/support/theme.ts says the same about a theme flip).
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function seeded() {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Finance Admin", superAdmin: false });
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: {
      branchId: branch.id,
      sessionId: session.id,
      ordinal: 1,
      label: "1st Term",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "Primary 1" } });
  await db.feeStructure.create({
    data: { branchId: branch.id, periodId: period.id, classGroupId: group.id, name: "Tuition", amount: 50000 },
  });
  const pupil = async (first: string, last: string, no: string) =>
    db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: first,
        lastName: last,
        admissionNo: no,
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2015-05-15"),
      },
    });
  const aisha = await pupil("Aisha", "Bello", "2026/0001");
  const zainab = await pupil("Zainab", "Musa", "2026/0002");
  const yusuf = await pupil("Yusuf", "Sani", "2026/0003");
  const invoice = (
    studentId: string,
    invoiceNo: string,
    totalAmount: number,
    amountPaid: number,
    status: "UNPAID" | "PARTIALLY_PAID" | "PAID",
  ) => db.invoice.create({ data: { branchId: branch.id, studentId, periodId: period.id, invoiceNo, totalAmount, amountPaid, status } });
  // one of each status, so every pill is on the screen; Aisha's has a payment and a discount, so her invoice shows a receipt row and a discount row
  const partial = await invoice(aisha.id, "INV-2026-0001", 45000, 20000, "PARTIALLY_PAID");
  await invoice(zainab.id, "INV-2026-0002", 50000, 0, "UNPAID");
  await invoice(yusuf.id, "INV-2026-0003", 50000, 50000, "PAID");
  await db.payment.create({
    data: {
      branchId: branch.id,
      invoiceId: partial.id,
      receiptNo: "REC-2026-0001",
      amount: 20000,
      provider: "MANUAL",
      providerRef: "MAN_TRF_1001",
      status: "SUCCESS",
      channel: "Point of Sale (POS)",
      paidAt: new Date(),
    },
  });
  await db.invoiceDiscount.create({
    data: {
      branchId: branch.id,
      invoiceId: partial.id,
      amount: 5000,
      reason: "Sibling concession",
      mode: "SIBLING_DISCOUNT",
      appliedByUserId: admin.id,
    },
  });
  return { branch, admin, period };
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} theme: every state of Finance has the contrast WCAG AA asks for`, async ({ page, context }) => {
    const { admin } = await seeded();
    const found: string[] = [];
    const scan = async (what: string) => {
      await settle(page);
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      for (const violation of results.violations) {
        for (const node of violation.nodes) {
          const data = node.any[0]?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined;
          const text = node.html
            .replace(/\s*class="[^"]*"/, "")
            .replace(/\s*type="[^"]*"/, "")
            .slice(0, 80);
          found.push(`${what}: ${text} ${data?.fgColor} on ${data?.bgColor} = ${data?.contrastRatio}:1`);
        }
      }
    };

    await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
    await signInThroughUi(page, admin);
    await page.goto("/finance");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByText("INV-2026-0001")).toBeVisible();

    // 1. the dashboard: every status pill, with the pointer on a row
    await page.getByRole("row").filter({ hasText: "Aisha Bello" }).hover();
    await scan("the invoices, a row hovered");

    // 2. an invoice with a receipt and a discount line
    await page.getByRole("row").filter({ hasText: "Aisha Bello" }).getByRole("button", { name: "View & Pay" }).click();
    const invoice = page.getByRole("dialog", { name: "Invoice INV-2026-0001" });
    await expect(invoice).toBeVisible();
    await scan("an invoice with a receipt and a discount");

    // 3. the payment dialog with its error
    await invoice.getByRole("button", { name: "Record Payment", exact: true }).click();
    const pay = page.getByRole("dialog", { name: /^Record Offline Payment/ });
    await pay.getByLabel("Payment Amount (₦)").fill("0");
    await pay.getByRole("button", { name: "Record Payment & Issue Receipt", exact: true }).click();
    await expect(pay.getByRole("alert")).toBeVisible();
    await scan("the payment dialog with an error");
    await pay.getByRole("button", { name: "Cancel", exact: true }).click();

    // 4. the waiver dialog with its error: an amount EQUAL to the invoice's total (45,000). Anything above it never reaches the form's message, because the input has `max` and the browser
    // stops the submit with its own bubble first; equal passes `max` and is refused by the form ("cannot exceed total invoice value")
    await invoice.getByRole("button", { name: "Waiver / Discount", exact: true }).click();
    const waiver = page.getByRole("dialog", { name: /^Apply Fee Waiver/ });
    await waiver.getByLabel("Discount Amount (₦)").fill("45000");
    await waiver.getByLabel("Approval Reason / Reference Note").fill("Too much");
    await waiver.getByRole("button", { name: "Apply Discount", exact: true }).click();
    await expect(waiver.getByRole("alert")).toBeVisible();
    await scan("the waiver dialog with an error");
    await waiver.getByRole("button", { name: "Cancel", exact: true }).click();
    await invoice.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(invoice).toBeHidden();

    // 5. the batch dialog with its result (every pupil already has an invoice, so all are skipped, and the result says so in green)
    await page.getByRole("button", { name: /Batch Generate Invoices/ }).click();
    const batch = page.getByRole("dialog", { name: "Batch Generate Student Invoices" });
    await batch.getByRole("button", { name: "Generate Invoices", exact: true }).click();
    await expect(batch.getByRole("status")).toBeVisible();
    await scan("the batch dialog with its result");
    await batch.getByRole("button", { name: "Cancel", exact: true }).click();

    // 6. the fee schedule: the pointer on the row, then on the Delete button
    await page.getByRole("tab", { name: "Fee Schedules & Structures" }).click();
    const fee = page.getByRole("row").filter({ hasText: "Tuition" });
    await expect(fee).toBeVisible();
    await fee.hover();
    await scan("the fee schedule, a row hovered");
    await fee.getByRole("button", { name: "Delete", exact: true }).hover();
    await scan("the fee schedule, the Delete button hovered");

    // 7. the fee dialog with its error (a name that is only spaces passes the browser's own check and is refused by the form)
    await page.getByRole("button", { name: "Add Fee Item" }).click();
    const feeDialog = page.getByRole("dialog", { name: "Create New Fee Structure Item" });
    await feeDialog.getByLabel("Fee Item Name").fill("   ");
    await feeDialog.getByLabel(/^Amount/).fill("1000");
    await feeDialog.getByRole("button", { name: "Create Item", exact: true }).click();
    await expect(feeDialog.getByRole("alert")).toBeVisible();
    await scan("the fee dialog with an error");
    await feeDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    // 8. the error card, when the screen cannot load (the request fails)
    await page.route("**/api/v1/finance/invoices?*", (route) => route.abort());
    await page.reload();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await scan("the card that says the screen could not load");

    expect(found, `colour contrast on Finance, ${theme} theme`).toEqual([]);
  });
}
