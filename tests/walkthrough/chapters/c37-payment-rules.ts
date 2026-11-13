import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, paymentRules as r, pupils, school } from "../cast";
import { mainNav, signIn, signOut } from "./shared";

// C37 Finance payment rules (task 0033, section 6.37): the school decides whether an invoice can be paid in parts and the smallest part. A branch may only make the rule stricter. An invoice says what may be paid, a part below
// the smallest is refused in words and the whole balance is one press; one invoice can be marked pay in full and cleared again. The school's rule is put back at the end.

const chapter = "C37 Payment rules";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const branchBlock = (page: Page) => page.getByRole("listitem").filter({ hasText: school.branches.englishPrimary });
const invoice = (page: Page) => page.getByRole("dialog", { name: /^Invoice / });
const record = (page: Page) => page.getByRole("dialog", { name: /Record Offline Payment/ });
const zainab = `${pupils.zainab.first} ${pupils.zainab.last}`;

async function openRules(walk: Walk, page: Page): Promise<void> {
  await walk.click(mainNav(page).getByRole("link", { name: "Finance", exact: true }));
  await walk.click(tab(page, "Payment Rules"));
}

async function openInvoice(walk: Walk, page: Page): Promise<void> {
  await walk.click(mainNav(page).getByRole("link", { name: "Finance", exact: true }));
  await walk.click(tab(page, "Student Invoices & Payments"));
  await walk.selectOption(page.getByLabel("Branch:", { exact: true }), school.branches.englishPrimary);
  await walk.type(page.getByLabel("Search student or invoice number"), pupils.zainab.first);
  await expect(page.getByRole("button", { name: "View & Pay" })).toHaveCount(1);
  await walk.click(page.getByRole("button", { name: "View & Pay" }));
  await expect(invoice(page)).toContainText(zainab);
}

export async function c37PaymentRules(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 346,
      chapter,
      role: "Superadmin",
      title: "The school decides whether an invoice can be paid in parts, and the smallest part",
      caption:
        "Payment Rules starts by allowing parts of any amount. The superadministrator chooses an amount as the smallest part and saves the school's rule, and the sentence at the top now says what it is.",
      covers: ["PPY-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openRules(walk, page);
      await expect(page.getByText("The school: Part payments are allowed, of any amount.")).toBeVisible();
      await walk.selectOption(page.locator("#school-kind"), "AMOUNT");
      await walk.type(page.locator("#school-value"), r.schoolMinimum);
      await walk.click(page.getByRole("button", { name: "Save the school's rule" }));
      await expect(page.getByText("The school's rule is saved.")).toBeVisible();
      await expect(page.getByText(/The school: Part payments are allowed, at least ₦10,000\./)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 347,
      chapter,
      role: "Superadmin",
      title: "A branch can make the rule stricter for itself, never looser than the school's",
      caption:
        "A branch may ask for a larger smallest part, never a smaller one. A smaller one is refused in words; a larger one is saved. The branch can then follow the school's rule again.",
      covers: ["PPY-02"],
    },
    async () => {
      await walk.selectOption(branchBlock(page).getByLabel("Smallest part"), "AMOUNT");
      await walk.type(branchBlock(page).getByLabel("Smallest amount (₦)"), r.branchTooLow);
      await walk.click(page.getByRole("button", { name: `Save the rule for ${school.branches.englishPrimary}` }));
      await expect(page.getByText(/only raise it/)).toBeVisible();
      await walk.type(branchBlock(page).getByLabel("Smallest amount (₦)"), r.branchHigher);
      await walk.click(page.getByRole("button", { name: `Save the rule for ${school.branches.englishPrimary}` }));
      await expect(page.getByText(`The rule for ${school.branches.englishPrimary} is saved.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Follow the school's rule in ${school.branches.englishPrimary}` }));
      await expect(page.getByText(`${school.branches.englishPrimary} follows the school's rule again.`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 348,
      chapter,
      role: "Superadmin",
      title: "The invoice says what may be paid; a part below the smallest is refused in words and the whole balance is one press",
      caption:
        "An invoice's page says what may be paid. Recording a payment smaller than the smallest part is refused with the amount, and Pay the full balance fills the whole balance in.",
      covers: ["PPY-03"],
    },
    async () => {
      await openInvoice(walk, page);
      await expect(invoice(page).getByText("Part payments are allowed, at least ₦10,000.")).toBeVisible();
      await walk.click(invoice(page).getByRole("button", { name: "Record Payment" }));
      await expect(record(page).getByText("Part payments are allowed, at least ₦10,000.")).toBeVisible();
      await walk.type(record(page).getByLabel("Payment Amount (₦)"), r.tooSmall);
      await walk.click(record(page).getByRole("button", { name: "Record Payment & Issue Receipt" }));
      await expect(record(page).getByRole("alert").filter({ hasText: "The smallest part you can pay is ₦10,000." })).toBeVisible();
      await walk.click(record(page).getByRole("button", { name: "Pay the full balance" }));
      await expect(record(page).getByLabel("Payment Amount (₦)")).toHaveValue("55000");
    },
  );

  await walk.step(
    {
      id: 349,
      chapter,
      role: "Superadmin",
      title: "One invoice can be marked pay in full, and cleared again",
      caption:
        "A single invoice can be marked Pay in full only: its sentence changes and a part is refused. Allow part payments again puts it back.",
      covers: ["PPY-04"],
    },
    async () => {
      await walk.click(record(page).getByRole("button", { name: "Cancel" }));
      await walk.click(invoice(page).getByRole("switch", { name: /Pay in full only/ }));
      await expect(invoice(page).getByText("This invoice has to be paid in full.")).toBeVisible();
      await walk.click(invoice(page).getByRole("button", { name: "Record Payment" }));
      await walk.type(record(page).getByLabel("Payment Amount (₦)"), r.partOfFull);
      await walk.click(record(page).getByRole("button", { name: "Record Payment & Issue Receipt" }));
      await expect(record(page).getByRole("alert").filter({ hasText: "has to be paid in full" })).toBeVisible();
      await walk.click(record(page).getByRole("button", { name: "Cancel" }));
      await walk.click(invoice(page).getByRole("switch", { name: /Allow part payments again/ }));
      await expect(invoice(page).getByText(/Part payments are allowed/)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 350,
      chapter,
      role: "Superadmin",
      title: "Put the school's rule back",
      caption: "The school's smallest part goes back to any amount, so the next pages see the school as it was.",
      covers: ["PPY-01"],
    },
    async () => {
      await walk.click(invoice(page).getByRole("button", { name: "Close" }).last());
      await walk.click(tab(page, "Payment Rules"));
      await walk.selectOption(page.locator("#school-kind"), "NONE");
      await walk.click(page.getByRole("button", { name: "Save the school's rule" }));
      await expect(page.getByText("The school: Part payments are allowed, of any amount.")).toBeVisible();
    },
  );
}
