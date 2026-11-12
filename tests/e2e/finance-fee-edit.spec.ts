import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";
import type { Page } from "@playwright/test";

// Task 0058: the dialog that edits a fee item was mounted once, and its fields start from `useState(initialItem?.x ?? default)`, which runs only on the first render. So "Edit" opened the
// form with an empty name and amount, the FIRST term and "All Classes (Universal)", whatever the fee was; someone who retyped the name and the amount and pressed "Update Item" moved a
// "Primary 1" fee to every class. Found by the product walkthrough (C11 step 86). Each fee is seeded so that every value differs from the form's defaults: the SECOND term, and a named class.

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

async function seededFees() {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Finance Admin", superAdmin: false });
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20") },
  });
  // the first term is what the form defaults to, so the fees below are in the second
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
  const second = await db.academicPeriod.create({
    data: {
      branchId: branch.id,
      sessionId: session.id,
      ordinal: 2,
      label: "2nd Term",
      startDate: new Date("2027-01-10"),
      endDate: new Date("2027-04-10"),
    },
  });
  const jss = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
  const primary = await db.classGroup.create({ data: { branchId: branch.id, name: "Primary 1" } });
  const sports = await db.feeStructure.create({
    data: { branchId: branch.id, periodId: second.id, classGroupId: primary.id, name: "Sports levy", amount: 12000 },
  });
  const library = await db.feeStructure.create({
    data: { branchId: branch.id, periodId: second.id, classGroupId: jss.id, name: "Library fee", amount: 8000 },
  });
  return { admin, second, jss, primary, sports, library };
}

async function openFeeSchedule(page: Page, admin: Awaited<ReturnType<typeof seededFees>>["admin"]) {
  await signInThroughUi(page, admin);
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "Finance & Fee Invoicing" })).toBeVisible();
  await page.getByRole("tab", { name: "Fee Schedules & Structures" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Sports levy" })).toBeVisible();
}

const editOf = (page: Page, fee: string) =>
  page.getByRole("row").filter({ hasText: fee }).getByRole("button", { name: "Edit", exact: true });
const editDialog = (page: Page) => page.getByRole("dialog", { name: "Edit Fee Structure Item" });

test("editing a fee opens it with its own name, amount, term and class", async ({ page }) => {
  const { admin, second, primary } = await seededFees();
  await openFeeSchedule(page, admin);
  await editOf(page, "Sports levy").click();
  const dialog = editDialog(page);
  await expect(dialog.getByLabel("Fee Item Name")).toHaveValue("Sports levy");
  // the amount comes back from the database as a decimal; 12000 may be written 12000 or 12000.00
  await expect(dialog.getByLabel(/^Amount/)).toHaveValue(/^12000(\.0+)?$/);
  await expect(dialog.getByLabel("Academic Term / Period")).toHaveValue(second.id);
  await expect(dialog.getByLabel("Class Group Scope")).toHaveValue(primary.id);
});

test("changing only the amount of a fee leaves its name, term and class as they were", async ({ page }) => {
  const { admin, second, primary, sports } = await seededFees();
  await openFeeSchedule(page, admin);
  await editOf(page, "Sports levy").click();
  const dialog = editDialog(page);
  await dialog.getByLabel(/^Amount/).fill("15000");
  await dialog.getByRole("button", { name: "Update Item", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => Number((await db.feeStructure.findUniqueOrThrow({ where: { id: sports.id } })).amount)).toBe(15000);
  const stored = await db.feeStructure.findUniqueOrThrow({ where: { id: sports.id } });
  expect({ name: stored.name, period: stored.periodId, classGroup: stored.classGroupId }).toEqual({
    name: "Sports levy",
    period: second.id,
    classGroup: primary.id,
  });
});

test("each opening starts from its own fee: a second fee after a cancelled edit, then a blank new one", async ({ page }) => {
  const { admin, second, jss } = await seededFees();
  await openFeeSchedule(page, admin);
  // the first fee is opened and cancelled WITHOUT saving, so the panel is not refreshed in between: the case in which one opening's leftovers used to show in the next
  // (no check of what the first opening shows: the first test does that. This one is about what the SECOND opening shows after the first one was typed into.)
  await editOf(page, "Sports levy").click();
  await editDialog(page).getByLabel("Fee Item Name").fill("Sports levy (half typed)");
  await editDialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editDialog(page)).toBeHidden();

  await editOf(page, "Library fee").click();
  const dialog = editDialog(page);
  await expect(dialog.getByLabel("Fee Item Name")).toHaveValue("Library fee");
  await expect(dialog.getByLabel(/^Amount/)).toHaveValue(/^8000(\.0+)?$/);
  await expect(dialog.getByLabel("Academic Term / Period")).toHaveValue(second.id);
  await expect(dialog.getByLabel("Class Group Scope")).toHaveValue(jss.id);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();

  // and a new fee, afterwards, is blank: no name, no amount, the first term, all classes
  // the button's name is "+ Add Fee Item" (a plus sign in its own span), so it is matched by the words, not exactly
  await page.getByRole("button", { name: "Add Fee Item" }).click();
  const created = page.getByRole("dialog", { name: "Create New Fee Structure Item" });
  await expect(created.getByLabel("Fee Item Name")).toHaveValue("");
  await expect(created.getByLabel(/^Amount/)).toHaveValue("");
  await expect(created.getByLabel("Class Group Scope")).toHaveValue("");
  await expect(created.getByLabel("Academic Term / Period")).not.toHaveValue(second.id);
});

test("retyping a fee's name and amount keeps it in its class", async ({ page }) => {
  // the person's own way round the blank form of the old dialog: type the name and the amount again and press Update. The scope select then held "All Classes (Universal)", and the server
  // stores what it is sent, so a "Primary 1" fee became a fee for every class.
  const { admin, primary, sports } = await seededFees();
  await openFeeSchedule(page, admin);
  await editOf(page, "Sports levy").click();
  const dialog = editDialog(page);
  await dialog.getByLabel("Fee Item Name").fill("Sports levy and kit");
  await dialog.getByLabel(/^Amount/).fill("13000");
  await dialog.getByRole("button", { name: "Update Item", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await db.feeStructure.findUniqueOrThrow({ where: { id: sports.id } })).name).toBe("Sports levy and kit");
  const stored = await db.feeStructure.findUniqueOrThrow({ where: { id: sports.id } });
  expect({ amount: Number(stored.amount), classGroup: stored.classGroupId }).toEqual({ amount: 13000, classGroup: primary.id });
});

test("the term of an existing fee cannot be changed, and the dialog says so; a new fee can choose its term", async ({ page }) => {
  // the update schema has no `periodId`, so the server dropped a changed term without a word; the select is now disabled for an existing fee, with a sentence saying why
  const { admin, second } = await seededFees();
  await openFeeSchedule(page, admin);
  await editOf(page, "Sports levy").click();
  const dialog = editDialog(page);
  await expect(dialog.getByLabel("Academic Term / Period")).toBeDisabled();
  await expect(dialog.getByLabel("Academic Term / Period")).toHaveValue(second.id);
  await expect(dialog.getByText("A fee stays in the term it was made for.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Add Fee Item" }).click();
  const created = page.getByRole("dialog", { name: "Create New Fee Structure Item" });
  await expect(created.getByLabel("Academic Term / Period")).toBeEnabled();
  await expect(created.getByText("A fee stays in the term it was made for.")).toHaveCount(0);
});
