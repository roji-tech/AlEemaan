import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, finance as f, pupils } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";

// C11 Finance (task 0033, section 6.6): the branch administrator puts the term's fees on the schedule (a slip in a name and a wrong amount are corrected, one fee is added and deleted), makes
// every Primary 1 pupil's invoice in one batch (and learns that doing it again changes nothing), reads the dashboard, opens one invoice, records a part payment and then the rest, gives a
// waiver to another, and comes back to see it all kept. The superadministrator then chooses a branch and sees that branch's money.

const chapter = "C11 Finance";
const heading = "Finance & Fee Invoicing";

const tab = (page: Page, name: string) => page.getByRole("tab", { name });
/// A figure that sits under its label, in a card of the dashboard or of the fee schedule (the label is a paragraph, the figure the paragraph after it).
const figure = (page: Page, label: string): Locator => page.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");
/// The same inside an invoice's dialog: a label above its figure.
const inInvoice = (dialog: Locator, label: string): Locator =>
  dialog.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]");
const feeRow = (page: Page, name: string) => page.getByRole("row", { name: new RegExp(name) });
const pupilName = (p: { first: string; last: string }) => `${p.first} ${p.last}`;
const invoiceDialog = (page: Page) => page.getByRole("dialog", { name: /^Invoice / });
/// The "Close" button at the foot of an invoice's dialog. The dialog has TWO buttons named "Close" that do the same (the X in its header and this one; found by recon run 12 as a strict-mode
/// violation), and the foot's is the last of them.
const closeInvoice = (dialog: Locator): Locator => dialog.getByRole("button", { name: "Close", exact: true }).last();

async function openFeeSchedule(walk: Walk, page: Page): Promise<void> {
  await walk.click(tab(page, "Fee Schedules & Structures"));
  await expect(page.getByText("Total Scheduled Fees", { exact: true })).toBeVisible();
}

async function openInvoices(walk: Walk, page: Page): Promise<void> {
  await walk.click(tab(page, "Student Invoices & Payments"));
  await expect(page.getByText("Total Invoiced", { exact: true })).toBeVisible();
}

/// The class choice of a fee for every class. It is chosen on purpose, like a class is: the journey does not branch on whether a scope was given (the guard's rule), so every fee says its class.
const everyClass = "All Classes (Universal)";

async function addFee(walk: Walk, page: Page, name: string, amount: string, scope: string): Promise<void> {
  await walk.click(page.getByRole("button", { name: /Add Fee Item/ }));
  const dialog = page.getByRole("dialog", { name: "Create New Fee Structure Item" });
  await walk.type(dialog.getByLabel("Fee Item Name"), name);
  await walk.type(dialog.getByLabel("Amount (₦ Naira)"), amount);
  await walk.selectOption(dialog.getByLabel("Academic Term / Period"), f.term);
  await walk.selectOption(dialog.getByLabel("Class Group Scope"), scope);
  await walk.click(dialog.getByRole("button", { name: "Create Item", exact: true }));
  await expect(dialog).toBeHidden();
}

async function openInvoiceOf(walk: Walk, page: Page, pupil: { first: string; last: string }): Promise<Locator> {
  await walk.type(page.getByLabel("Search student or invoice number"), pupil.first);
  await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(1);
  await walk.click(page.getByRole("button", { name: "View & Pay" }));
  const dialog = invoiceDialog(page);
  await expect(dialog).toContainText(pupilName(pupil));
  return dialog;
}

export async function c11Finance(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 85,
      chapter,
      role: "Branch administrator",
      title: "Put a fee on the term's schedule",
      caption: "A fee has a name, an amount, a term and the class it is for. The schedule shows the total of the fees it holds.",
      covers: ["FIN-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Finance", heading);
      await openFeeSchedule(walk, page);
      await expect(page.getByText("No fee schedule items configured for this selection.")).toBeVisible();
      await addFee(walk, page, f.tuition.slip, f.tuition.amountTyped, a.classes.first);
      await expect(feeRow(page, f.tuition.slip)).toBeVisible();
      await expect(feeRow(page, f.tuition.slip)).toContainText(a.classes.first);
      await expect(figure(page, "Total Scheduled Fees")).toHaveText("₦50,000.00");
    },
  );

  await walk.step(
    {
      id: 86,
      chapter,
      role: "Branch administrator",
      title: "Correct the name and the amount of a fee",
      caption:
        "Edit opens the fee as it is: its name, amount and class. A fee stays in the term it was made for, so the term is fixed. The name and the amount are changed, and the total follows.",
      covers: ["FIN-01"],
    },
    async () => {
      await walk.click(feeRow(page, f.tuition.slip).getByRole("button", { name: "Edit", exact: true }));
      const dialog = page.getByRole("dialog", { name: "Edit Fee Structure Item" });
      // the dialog opens with the fee's own values (task 0058: it used to open blank, and retyping the name and the amount stored the fee for every class)
      await expect(dialog.getByLabel("Fee Item Name")).toHaveValue(f.tuition.slip);
      await expect(dialog.getByLabel("Amount (₦ Naira)")).toHaveValue(/^50000(\.0+)?$/);
      await expect(dialog.getByLabel("Class Group Scope").locator("option:checked")).toHaveText(a.classes.first);
      await expect(dialog.getByLabel("Academic Term / Period")).toBeDisabled();
      await expect(dialog.getByText("A fee stays in the term it was made for.")).toBeVisible();
      await walk.type(dialog.getByLabel("Fee Item Name"), f.tuition.name);
      await walk.type(dialog.getByLabel("Amount (₦ Naira)"), f.tuition.amountCorrected);
      await walk.click(dialog.getByRole("button", { name: "Update Item", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(feeRow(page, f.tuition.name)).toContainText(f.tuition.shown);
      await expect(feeRow(page, f.tuition.name)).toContainText(a.classes.first); // still the class's fee, not every class's
      await expect(page.getByText(f.tuition.slip)).toHaveCount(0);
      await expect(figure(page, "Total Scheduled Fees")).toHaveText(f.tuition.shown);
    },
  );

  await walk.step(
    {
      id: 87,
      chapter,
      role: "Branch administrator",
      title: "A fee for every class, and a fee that is deleted",
      caption: 'A fee for "All Classes" is charged to every pupil. A fee can be deleted; the browser asks first.',
      covers: ["FIN-01"],
    },
    async () => {
      await addFee(walk, page, f.levy.name, f.levy.amountTyped, everyClass);
      await expect(feeRow(page, f.levy.name)).toContainText("Universal / All Classes");
      await expect(figure(page, "Total Scheduled Fees")).toHaveText(f.invoiceTotal);
      await expect(page.getByText("2 fee items configured")).toBeVisible();
      await addFee(walk, page, f.scrap.name, f.scrap.amountTyped, everyClass);
      await expect(page.getByText("3 fee items configured")).toBeVisible();
      await walk.acceptNextConfirm("Are you sure you want to delete this fee item?");
      await walk.click(feeRow(page, f.scrap.name).getByRole("button", { name: "Delete", exact: true }));
      await expect(page.getByText(f.scrap.name)).toHaveCount(0);
      await expect(page.getByText("2 fee items configured")).toBeVisible();
      await expect(figure(page, "Total Scheduled Fees")).toHaveText(f.invoiceTotal);
    },
  );

  await walk.step(
    {
      id: 88,
      chapter,
      role: "Branch administrator",
      title: "Make the term's invoices in one batch, and again",
      caption:
        "One press invoices every pupil of the class for the term. Pressing it again changes nothing: the invoices that exist are skipped.",
      covers: ["FIN-02"],
    },
    async () => {
      await openInvoices(walk, page);
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: /Batch Generate Invoices/ }));
      const dialog = page.getByRole("dialog", { name: "Batch Generate Student Invoices" });
      await walk.selectOption(dialog.getByLabel("Academic Term / Period"), f.term);
      await walk.selectOption(dialog.getByLabel("Target Class Group"), a.classes.first);
      await walk.type(dialog.getByLabel("Invoice Due Date (Optional)"), f.dueTyped);
      await walk.click(dialog.getByRole("button", { name: "Generate Invoices", exact: true }));
      await expect(dialog.getByRole("status")).toContainText("4 new invoices created, 0 existing invoices skipped.");
      await walk.click(dialog.getByRole("button", { name: "Generate Invoices", exact: true }));
      await expect(dialog.getByRole("status")).toContainText("0 new invoices created, 4 existing invoices skipped.");
      await walk.click(dialog.getByRole("button", { name: "Cancel", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(4);
    },
  );

  await walk.step(
    {
      id: 89,
      chapter,
      role: "Branch administrator",
      title: "Read the dashboard: the totals, the statuses, the term and a search",
      caption:
        "The cards add the invoices up. The status buttons, the term and the search narrow the list; none of them changes a figure on a card.",
      covers: ["FIN-03"],
    },
    async () => {
      await expect(figure(page, "Total Invoiced")).toHaveText(f.allInvoiced);
      await expect(figure(page, "Total Collected")).toHaveText("₦0.00");
      await expect(figure(page, "Outstanding Balance")).toHaveText(f.allInvoiced);
      await walk.click(page.getByRole("button", { name: "PARTIALLY PAID", exact: true }));
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: "UNPAID", exact: true }));
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(4);
      await walk.click(page.getByRole("button", { name: "All Statuses", exact: true }));
      await walk.selectOption(page.getByLabel("Filter by academic term"), f.term);
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(4);
      await walk.type(page.getByLabel("Search student or invoice number"), pupils.zainab.first);
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(1);
      await expect(page.getByRole("row", { name: new RegExp(pupilName(pupils.zainab)) })).toContainText("UNPAID");
      await walk.type(page.getByLabel("Search student or invoice number"), "");
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(4);
      await expect(figure(page, "Total Invoiced")).toHaveText(f.allInvoiced);
    },
  );

  await walk.step(
    {
      id: 90,
      chapter,
      role: "Branch administrator",
      title: "Open an invoice and record a part payment",
      caption:
        "The invoice lists what it is made of and what has been paid. A payment at the office is recorded with its method and reference, and a receipt is issued.",
      covers: ["FIN-04", "FIN-05"],
    },
    async () => {
      const dialog = await openInvoiceOf(walk, page, pupils.aisha);
      await expect(dialog.getByRole("heading", { name: "Itemized Breakdown" })).toBeVisible();
      await expect(dialog).toContainText(f.tuition.name);
      await expect(dialog).toContainText(f.levy.name);
      await expect(inInvoice(dialog, "Total Billed")).toHaveText(f.invoiceTotal);
      await expect(dialog.getByText("No payments have been recorded for this invoice yet.")).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Record Payment", exact: true }));
      const pay = page.getByRole("dialog", { name: /^Record Offline Payment/ });
      await walk.type(pay.getByLabel("Payment Amount (₦)"), f.payment.part);
      await walk.selectOption(pay.getByLabel("Payment Method"), "Point of Sale (POS)");
      await walk.type(pay.getByLabel("Receipt / Teller Ref (Optional)"), f.payment.ref);
      await walk.type(pay.getByLabel("Notes / Depositor Name (Optional)"), f.payment.note);
      await walk.click(pay.getByRole("button", { name: "Record Payment & Issue Receipt", exact: true }));
      await expect(pay).toBeHidden();
      await expect(inInvoice(dialog, "Amount Paid")).toHaveText(f.payment.partShown);
      await expect(inInvoice(dialog, "Balance Due")).toHaveText(f.payment.balanceAfterPart);
      await expect(dialog.getByText("PARTIALLY PAID", { exact: true })).toBeVisible();
      await expect(dialog.getByText("No payments have been recorded for this invoice yet.")).toHaveCount(0);
      await expect(dialog).toContainText(f.payment.partShown);
    },
  );

  await walk.step(
    {
      id: 91,
      chapter,
      role: "Branch administrator",
      title: "Pay the rest, and read the dashboard again",
      caption: '"Pay the full balance" fills in what is left. The invoice becomes paid, and the cards on the dashboard move with it.',
      covers: ["FIN-05"],
    },
    async () => {
      const dialog = invoiceDialog(page);
      await walk.click(dialog.getByRole("button", { name: "Record Payment", exact: true }));
      const pay = page.getByRole("dialog", { name: /^Record Offline Payment/ });
      await walk.click(pay.getByRole("button", { name: "Pay the full balance", exact: true }));
      await expect(pay.getByLabel("Payment Amount (₦)")).toHaveValue("35000");
      await walk.click(pay.getByRole("button", { name: "Record Payment & Issue Receipt", exact: true }));
      await expect(pay).toBeHidden();
      await expect(dialog.getByText("✓ PAID IN FULL")).toBeVisible();
      await expect(inInvoice(dialog, "Balance Due")).toHaveText("₦0.00");
      await expect(dialog.getByRole("button", { name: "Record Payment", exact: true })).toHaveCount(0);
      await walk.click(closeInvoice(dialog));
      await expect(dialog).toBeHidden();
      await walk.type(page.getByLabel("Search student or invoice number"), "");
      await expect(figure(page, "Total Collected")).toHaveText(f.invoiceTotal);
      await expect(figure(page, "Outstanding Balance")).toHaveText("₦165,000.00");
      await walk.click(page.getByRole("button", { name: "PAID", exact: true }));
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(1);
      await walk.click(page.getByRole("button", { name: "All Statuses", exact: true }));
    },
  );

  await walk.step(
    {
      id: 92,
      chapter,
      role: "Branch administrator",
      title: "Give a waiver: the whole invoice is refused, a part is given with its reason",
      caption: "A waiver needs a category, an amount and a reason for the record. It can be most of an invoice but never all of it.",
      covers: ["FIN-06"],
    },
    async () => {
      await walk.type(page.getByLabel("Search student or invoice number"), pupils.yusuf.first);
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(1);
      await walk.click(page.getByRole("button", { name: "View & Pay" }));
      const dialog = invoiceDialog(page);
      await expect(dialog).toContainText(pupilName(pupils.yusuf));
      await walk.click(dialog.getByRole("button", { name: "Waiver / Discount", exact: true }));
      const waiver = page.getByRole("dialog", { name: /^Apply Fee Waiver \/ Discount/ });
      await walk.type(waiver.getByLabel("Discount Amount (₦)"), "55000");
      await walk.type(waiver.getByLabel("Approval Reason / Reference Note"), f.waiver.reason);
      await walk.click(waiver.getByRole("button", { name: "Apply Discount", exact: true }));
      await expect(waiver.getByRole("alert")).toContainText(`Discount cannot exceed total invoice value of ${f.invoiceTotal}`);
      await walk.type(waiver.getByLabel("Discount Amount (₦)"), f.waiver.amount);
      await walk.selectOption(waiver.getByLabel("Category"), "Sibling Concession");
      await walk.click(waiver.getByRole("button", { name: "Apply Discount", exact: true }));
      await expect(waiver).toBeHidden();
      await expect(inInvoice(dialog, "Balance Due")).toHaveText(f.waiver.balanceAfter);
      await walk.click(closeInvoice(dialog));
      await expect(dialog).toBeHidden();
    },
  );

  await walk.step(
    {
      id: 93,
      chapter,
      role: "Branch administrator",
      title: "Leave and come back: the fees, the payments and the waiver are still there",
      caption:
        "Persistence is shown by leaving the page and returning to it. A branch administrator is not offered a choice of branch: it is theirs.",
      covers: ["FIN-10"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await openPage(walk, page, "Finance", heading);
      await expect(page.getByLabel("Branch:")).toHaveCount(0);
      await expect(figure(page, "Total Invoiced")).toHaveText("₦215,000.00");
      await expect(figure(page, "Total Collected")).toHaveText(f.invoiceTotal);
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(4);
      await openFeeSchedule(walk, page);
      await expect(feeRow(page, f.tuition.name)).toContainText(f.tuition.shown);
      await expect(page.getByText(f.scrap.name)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 94,
      chapter,
      role: "Superadmin",
      title: "The superadministrator chooses a branch and sees that branch's money",
      caption: "Only the superadministrator can choose the branch. The invoices and the fee schedule are the chosen branch's own.",
      covers: ["FIN-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Finance", heading);
      const branch = page.getByLabel("Branch:");
      await walk.selectOption(branch, "Primary (English)");
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(4);
      await openFeeSchedule(walk, page);
      await expect(page.getByText("2 fee items configured")).toBeVisible();
      await walk.selectOption(branch, "Primary (Arabic)");
      await expect(page.getByText("No fee schedule items configured for this selection.")).toBeVisible();
      await openInvoices(walk, page);
      await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(0);
      await expect(figure(page, "Total Invoiced")).toHaveText("₦0.00");
    },
  );
}
