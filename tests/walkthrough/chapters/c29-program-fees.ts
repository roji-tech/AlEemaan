import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, programFees as f, programs as p, pupils, school } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C29 Program fees (task 0033, section 6.29): what a program charges. The superadministrator turns fees on for the program, makes a monthly fee, sees who would get an invoice, makes the invoices (making them again
// makes nothing new), records a part payment and then the rest (nothing above the balance can be typed), gives a discount with a reason, marks an invoice pay-in-full-only and allows part payments again, and reads the
// report of what was billed, collected and owed. A branch administrator sees only the invoices of their own branch, takes a payment there and makes no fees or invoices; a teacher has no Fees tab; the school's and a
// branch's switch for fees sit in Settings beside the others.

const chapter = "C29 Program fees";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const inner = (page: Page, name: string): Locator =>
  page.getByRole("tablist", { name: "Fee views" }).getByRole("tab", { name, exact: true });
const invoiceRow = (page: Page, name: string): Locator =>
  page.getByRole("list", { name: "Invoices" }).getByRole("listitem").filter({ hasText: name });
const full = (person: { first: string; last: string }) => `${person.first} ${person.last}`;
const arabic = school.branches.arabicPrimary;
const aisha = full(pupils.aisha);
const yusuf = full(pupils.yusuf);

async function openFees(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Programs");
  await walk.click(page.getByRole("link", { name: p.hifz.name }));
  await walk.click(tab(page, "Fees"));
}

async function openInvoice(walk: Walk, page: Page, name: string): Promise<void> {
  await walk.click(invoiceRow(page, name).getByRole("button", { name: /^Open invoice/ }));
  await expect(dialog(page, "Invoice")).toBeVisible();
}

export async function c29ProgramFees(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 289,
      chapter,
      role: "Superadmin",
      title: "Fees are turned on for the program in its Settings, and the Fees tab appears",
      caption: "A program charges fees only when it is switched on. Until then it has no Fees tab; saving the setting brings it.",
      covers: ["PFE-08"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await expect(tab(page, "Fees")).toHaveCount(0);
      await walk.click(tab(page, "Settings"));
      await expect(page.getByTestId("fees-state")).toContainText("switched off for this program");
      await walk.click(page.getByLabel("Charge fees in this program"));
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText("The settings were saved.")).toBeVisible();
      await expect(tab(page, "Fees")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 290,
      chapter,
      role: "Superadmin",
      title: "A monthly fee is made: its amount, how often, and the day it falls due",
      caption:
        "A fee has a name, an amount in naira, how often it is charged and the day of the month it is due. Once made it is listed with all of that.",
      covers: ["PFE-01"],
    },
    async () => {
      await walk.click(tab(page, "Fees"));
      await expect(page.getByText("There are no invoices yet.")).toBeVisible();
      await walk.click(inner(page, "Fees"));
      await expect(page.getByText("No fee has been made yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New fee" }));
      const make = dialog(page, "New fee");
      await walk.type(make.getByLabel("Name"), f.name);
      await walk.type(make.getByLabel("Amount (₦)"), f.amount);
      await walk.selectOption(make.getByLabel("How often"), "Every month");
      await walk.type(make.getByLabel("Due on day"), f.dueDay);
      await walk.click(make.getByRole("button", { name: "Make fee" }));
      await expect(page.getByText("The fee was made.")).toBeVisible();
      await expect(page.getByRole("list", { name: "Fees" }).getByRole("listitem")).toContainText(`${f.name} · ${f.amountShown}`);
      await expect(page.getByRole("list", { name: "Fees" })).toContainText(`Every month, due on day ${f.dueDay}`);
    },
  );

  await walk.step(
    {
      id: 291,
      chapter,
      role: "Superadmin",
      title: "Invoices are previewed, then made in one step, and making them again makes nothing new",
      caption:
        "Before anything is made the page says how many invoices there would be and what they come to. Making them creates one for each person; asking again says that no new invoice would be made, because each already has one for the period.",
      covers: ["PFE-02"],
    },
    async () => {
      await walk.click(inner(page, "Make invoices"));
      await walk.click(page.getByRole("button", { name: "See who would get an invoice" }));
      await expect(page.getByText(/\d+ invoices would be made, ₦[\d,.]+ in all, from 1 fee/)).toBeVisible();
      await walk.click(page.getByRole("button", { name: /^Make \d+ invoices$/ }));
      await expect(page.getByText(/\d+ invoices were made, ₦[\d,.]+ in all\./)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "See who would get an invoice" }));
      await expect(page.getByText(/0 invoices would be made/)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Make 0/ })).toBeDisabled();
      await expect(page.getByRole("list", { name: "Skipped" })).toContainText("Already has an invoice for this period.");
    },
  );

  await walk.step(
    {
      id: 292,
      chapter,
      role: "Superadmin",
      title: "A payment is recorded with a receipt; the balance and the status follow, and nothing above the balance can be typed",
      caption:
        "An invoice starts Unpaid. A payment larger than what is owed is refused before it can be saved. A part payment makes it Part paid and shows the balance and a receipt number; paying the full balance settles it.",
      covers: ["PFE-03"],
    },
    async () => {
      await walk.click(inner(page, "Invoices"));
      await expect(invoiceRow(page, yusuf)).toContainText(`owes ${f.amountShown}`);
      await openInvoice(walk, page, yusuf);
      const invoice = dialog(page, "Invoice");
      await expect(invoice).toContainText("Unpaid");
      await walk.type(invoice.getByLabel("Amount", { exact: true }), f.over);
      await expect(invoice.getByText("That is more than is owed.")).toBeVisible();
      await expect(invoice.getByRole("button", { name: "Record payment" })).toBeDisabled();
      await walk.type(invoice.getByLabel("Amount", { exact: true }), f.part);
      await walk.click(invoice.getByRole("button", { name: "Record payment" }));
      await expect(invoice.getByText("The payment was recorded.")).toBeVisible();
      await expect(invoice).toContainText("Part paid");
      await expect(invoice).toContainText("paid ₦2,000.00 · owes ₦3,000.00");
      await expect(invoice.getByRole("list", { name: "Payments" })).toContainText("receipt RCP-");
      await walk.click(invoice.getByRole("button", { name: "Pay the full balance" }));
      await expect(invoice.getByLabel("Amount", { exact: true })).toHaveValue(f.rest);
      await walk.click(invoice.getByRole("button", { name: "Record payment" }));
      await expect(invoice.getByRole("button", { name: "Record payment" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 293,
      chapter,
      role: "Superadmin",
      title: "A discount needs a reason; an invoice can be marked pay in full only, and part payments allowed again",
      caption:
        "A discount cannot be applied without saying why, and the invoice then shows who gave it. An invoice marked pay in full only refuses a part payment in the app's words until part payments are allowed again.",
      covers: ["PFE-04"],
    },
    async () => {
      await walk.click(dialog(page, "Invoice").getByRole("button", { name: "Close" }).last());
      await openInvoice(walk, page, aisha);
      const invoice = dialog(page, "Invoice");
      await walk.type(invoice.getByLabel("Discount amount"), f.discount);
      await expect(invoice.getByRole("button", { name: "Apply discount" })).toBeDisabled();
      await walk.type(invoice.getByLabel("Reason for the discount"), f.discountReason);
      await walk.click(invoice.getByRole("button", { name: "Apply discount" }));
      await expect(invoice.getByText("The discount was applied.")).toBeVisible();
      await expect(invoice).toContainText(`Discount: ${f.discountReason} (${cast.superadmin.name})`);
      await walk.click(invoice.getByRole("button", { name: "Pay in full only" }));
      await expect(invoice).toContainText("Marked pay in full only.");
      await walk.type(invoice.getByLabel("Amount", { exact: true }), "100");
      await walk.click(invoice.getByRole("button", { name: "Record payment" }));
      await expect(invoice.getByText(/has to be paid in full/).last()).toBeVisible();
      await walk.click(invoice.getByRole("button", { name: "Allow part payments" }));
      await expect(invoice.getByText("Part payments are allowed again.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 294,
      chapter,
      role: "Superadmin",
      title: "The report shows what was billed, collected and owed, by branch and by group, and who owes",
      caption:
        "The report adds the invoices up: billed, collected and owed, with the share collected, split by branch and by group, and a list of the people who still owe.",
      covers: ["PFE-05"],
    },
    async () => {
      await walk.click(dialog(page, "Invoice").getByRole("button", { name: "Close" }).last());
      await walk.click(inner(page, "Report"));
      await expect(page.getByTestId("fees-total")).toContainText(/Billed ₦[\d,.]+ · collected ₦[\d,.]+ · owed ₦[\d,.]+/);
      await expect(page.getByRole("region", { name: "By branch" })).toContainText(school.branches.englishPrimary);
      await expect(page.getByRole("region", { name: "Who owes" })).toContainText(aisha);
      await expect(page.getByRole("region", { name: "Who owes" })).not.toContainText(yusuf);
    },
  );

  await walk.step(
    {
      id: 295,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator sees only their branch's invoices and can take a payment, but makes no fees or invoices",
      caption:
        "The branch administrator sees the invoices of the people of their own branch, with no Fees and no Make invoices views and no Settings. They can record a payment, and the report counts only their branch.",
      covers: ["PFE-06"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openFees(walk, page);
      await expect(inner(page, "Fees")).toHaveCount(0);
      await expect(inner(page, "Make invoices")).toHaveCount(0);
      await expect(page.getByRole("list", { name: "Invoices" })).not.toContainText(arabic);
      await openInvoice(walk, page, aisha);
      const invoice = dialog(page, "Invoice");
      await walk.type(invoice.getByLabel("Amount", { exact: true }), f.branchPayment);
      await walk.click(invoice.getByRole("button", { name: "Record payment" }));
      await expect(invoice.getByText("The payment was recorded.")).toBeVisible();
      await walk.click(invoice.getByRole("button", { name: "Close" }).last());
      await walk.click(inner(page, "Report"));
      await expect(page.getByTestId("fees-total")).toContainText(/Billed ₦[\d,.]+ · collected ₦[\d,.]+/);
      await expect(tab(page, "Settings")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 296,
      chapter,
      role: "Teacher",
      title: "A teacher has no Fees tab",
      caption: "Fees are not a teacher's business: the program's Overview is there, and its Fees are not.",
      covers: ["PFE-07"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await expect(tab(page, "Overview")).toBeVisible();
      await expect(tab(page, "Fees")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 297,
      chapter,
      role: "Superadmin",
      title: "Fees have a switch for the school and for each branch, beside the others",
      caption:
        "In Settings, fees in programs have their own switch for the school and each branch. Off for a branch, only that branch stops; off for the school, no program charges fees and what was recorded can only be read.",
      covers: ["PFE-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Settings");
      await walk.click(page.getByRole("button", { name: "Programs", exact: true }));
      await expect(page.getByRole("heading", { name: "Fees in programs" })).toBeVisible();
      await expect(page.getByText("Fees is on for the school", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Turn off program fees for ${arabic}` }));
      await expect(page.getByText(`${arabic} no longer uses fees in programs.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Turn program fees back on for ${arabic}` }));
      await expect(page.getByText(`${arabic} uses fees in programs again.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn off fees for the school" }));
      await expect(page.getByText("Fees is off for the school", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn on fees for the school" }));
      await expect(page.getByText("Fees is on for the school", { exact: true })).toBeVisible();
    },
  );
}
