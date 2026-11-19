import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0113 S1 on screen (the maintainer, 2026-11-19: "scholarship can be of different types", "some students might be marked paid through scholarship"): Finance > Scholarships adds a type; a pupil is
// given a full scholarship from the pupil's Actions list; Apply to open invoices settles the open invoice, which then reads "Paid by scholarship" in the invoice list and its detail; the pupil's card
// shows a chip. Driven on a desktop and a phone, with axe on each screen.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}

test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function setUp(page: Page) {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Scholarship Admin" });
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-01-01"), endDate: new Date("2027-12-31"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: {
      branchId: branch.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: new Date("2026-01-10"),
      isCurrent: true,
    },
  });
  const pupil = await db.studentRecord.create({
    data: { branchId: branch.id, firstName: "Holder", lastName: "Pupil", gender: "FEMALE", admissionNo: `E2E/SCH/${Date.now() % 100000}` },
  });
  await db.invoice.create({
    data: {
      branchId: branch.id,
      studentId: pupil.id,
      periodId: period.id,
      invoiceNo: `INV-E2E-${Date.now() % 100000}`,
      totalAmount: "50000.00",
      amountPaid: "0",
      status: "UNPAID",
      lineItems: [{ name: "Tuition", amount: "50000.00" }],
    },
  });
  await signInThroughUi(page, admin);
  return { branch, admin, pupil };
}

test("Finance > Scholarships: add a type; it is listed with its share; the form refuses a bad share", async ({ page }) => {
  await setUp(page);
  await page.goto("/finance?tab=scholarships");
  await expect(page.getByRole("heading", { level: 2, name: "Scholarships" })).toBeVisible();
  await expect(page.getByText("No scholarship types yet")).toBeVisible();
  await expectAccessible(page, "Finance > Scholarships (empty)");

  await page.getByRole("button", { name: "New scholarship type" }).click();
  const dialog = page.getByRole("dialog", { name: "New scholarship type" });
  await dialog.getByLabel("Name").fill("Hafiz award");
  await dialog.getByLabel("Share of the fees (%)").fill("150");
  await dialog.getByRole("button", { name: "Add type" }).click();
  await expect(dialog).toContainText("at most 100");
  await expectAccessible(page, "the new type form with its problem");
  await dialog.getByLabel("Share of the fees (%)").fill("100");
  await dialog.getByRole("button", { name: "Add type" }).click();
  const list = page.getByRole("list", { name: "Scholarship types" });
  await expect(list.getByRole("listitem").filter({ hasText: "Hafiz award" })).toContainText("Full (100%)");
  await expect(page.getByText("Hafiz award added.")).toBeVisible();
  expect(await db.scholarshipType.count({ where: { name: "Hafiz award", percent: 100 } })).toBe(1);

  await page.getByRole("button", { name: "Archive Hafiz award" }).click();
  await expect(page.getByRole("list", { name: "Archived scholarship types" })).toContainText("Hafiz award");
  await expectAccessible(page, "Finance > Scholarships (archived)");
});

test("a pupil gets a full scholarship, the open invoice is settled by it and reads Paid by scholarship; the card shows the scholarship", async ({
  page,
}) => {
  const { branch, admin } = await setUp(page);
  await db.scholarshipType.create({ data: { branchId: branch.id, name: "Hafiz award", percent: 100 } });
  await page.goto(`/students?branch=${branch.id}&q=Holder`);
  await clickAction(page, "Scholarships of Holder Pupil");
  const dialog = page.getByRole("dialog", { name: "Scholarships of Holder Pupil" });
  await expect(dialog).toContainText("No scholarship yet");
  await dialog.getByLabel("Scholarship type").selectOption({ label: "Hafiz award (100%)" });
  await expect(dialog.getByLabel("Share of the fees (%)")).toHaveValue("100");
  await expectAccessible(page, "the pupil's Scholarships dialog");
  await dialog.getByRole("button", { name: "Give scholarship" }).click();
  const held = dialog.getByRole("list", { name: "Scholarships of Holder Pupil" });
  await expect(held).toContainText("Hafiz award");
  await expect(held).toContainText("Full scholarship");
  expect((await db.studentScholarship.findFirstOrThrow({ where: { createdById: admin.id } })).percent).toBe(100);
  // Granting alone changed nothing already issued; the invoice is offered.
  expect((await db.invoice.findFirstOrThrow()).status).toBe("UNPAID");
  await dialog.getByRole("button", { name: /Apply to this pupil's open invoices \(1\)/ }).click();
  await expect(page.getByText(/Applied to 1 invoice/)).toBeVisible();
  await expect(page.getByText(/1 is now paid by scholarship/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Apply to this pupil's open invoices/ })).toHaveCount(0);
  const invoice = await db.invoice.findFirstOrThrow();
  expect([invoice.status, invoice.totalAmount.toString(), invoice.amountPaid.toString()]).toEqual(["PAID", "0", "0"]);
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();

  // The card.
  await expect(page.getByRole("list", { name: "Students" }).getByRole("listitem").filter({ hasText: "Holder Pupil" })).toContainText(
    "Full scholarship: Hafiz award",
  );

  // The invoice list and the invoice itself.
  await page.goto("/finance?tab=invoices");
  const row = page.getByRole("row").filter({ hasText: "Holder Pupil" });
  await expect(row).toContainText("PAID BY SCHOLARSHIP");
  await expectAccessible(page, "the invoice list with a paid-by-scholarship invoice");
  await row.getByRole("button", { name: "View & Pay" }).click();
  const detail = page.getByRole("dialog", { name: /Invoice INV-E2E/ });
  await expect(detail).toContainText("PAID BY SCHOLARSHIP");
  await expect(detail).toContainText("Scholarship: Hafiz award (100%)");
});

test("the pupil filter: has a scholarship, none, one type", async ({ page }) => {
  const { branch, admin, pupil } = await setUp(page);
  const t = await db.scholarshipType.create({ data: { branchId: branch.id, name: "Academic merit", percent: 50 } });
  await db.studentScholarship.create({
    data: { branchId: branch.id, studentId: pupil.id, typeId: t.id, percent: 50, createdById: admin.id },
  });
  await db.studentRecord.create({
    data: { branchId: branch.id, firstName: "Plain", lastName: "Pupil", gender: "MALE", admissionNo: `E2E/PL/${Date.now() % 100000}` },
  });
  await page.goto(`/students?branch=${branch.id}&q=Pupil`);
  const list = page.getByRole("list", { name: "Students" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").filter({ hasText: "Holder" })).toContainText("Scholarship: Academic merit 50%");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Scholarship", { exact: true }).selectOption("ANY");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Holder");
  await page.getByLabel("Scholarship", { exact: true }).selectOption("NONE");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Plain");
  await page.getByLabel("Scholarship", { exact: true }).selectOption({ label: "Academic merit" });
  await expect(list).toContainText("Holder");
  await expect(list).not.toContainText("Plain");
});
