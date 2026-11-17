import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import writeXlsxFile from "write-excel-file/universal";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Adding staff in bulk, in a real browser (task 0084): a CSV or Excel file read and reviewed row by row, problem rows downloaded, corrected and uploaded back, the good rows saved
// on their own when the administrator chooses, a grid of at most 50 rows with paste, and a warning before unsaved rows are thrown away. Desktop and phone (the two projects), and
// one test that sets tablet, desktop and phone widths itself. Axe (WCAG 2.2 A/AA) runs on the screens.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
async function expectNoPageScroll(page: Page, what: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal overflow on ${what}`).toBeLessThanOrEqual(innerWidth);
}

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `B${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await db.staffRecord.deleteMany({ where: { firstName: { startsWith: tag } } });
});

const dialog = (page: Page) => page.getByRole("dialog").first();
const csv = (...lines: string[]) => Buffer.from(["Category,First name,Last name,Phone,Email", ...lines].join("\n"));
async function openBulk(page: Page, role: Role = Role.ADMIN) {
  const user = await createUser({ role, superAdmin: false, name: `${tag} Admin` });
  await signInThroughUi(page, user);
  await page.goto("/academics");
  await page.getByRole("tab", { name: "Staff" }).click();
  await page.getByRole("button", { name: "Add many" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Add staff in bulk" })).toBeVisible();
}
const chooseFile = (page: Page, name: string, buffer: Buffer) =>
  dialog(page)
    .getByLabel("CSV or Excel file")
    .setInputFiles({
      name,
      mimeType: name.endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
const summary = (page: Page) =>
  dialog(page)
    .getByRole("status")
    .filter({ hasText: /rows?:/ });

test("a file is reviewed row by row; problem rows download, are corrected and uploaded back; then everything saves", async ({ page }) => {
  await openBulk(page);
  await chooseFile(
    page,
    "staff.csv",
    csv(
      `Teaching,${tag}A,One,08030000001,${tag}a@x.com`,
      `Teaching,${tag}B,Two,,nope`,
      `NT,${tag}C,Three,,`,
      `Teaching,${tag}D,Four,,${tag}A@x.com`,
    ),
  );
  await expect(summary(page)).toContainText("4 rows: 2 ready, 2 with problems");
  await expect(dialog(page).getByText("That does not look like an email address.")).toBeVisible();
  await expect(dialog(page).getByText("Repeats row 2.")).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: /^Save all/ })).toHaveCount(0);

  const download = page.waitForEvent("download");
  await dialog(page).getByRole("button", { name: "Problem rows (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/problem-rows.*\.csv$/);
  const text = fs.readFileSync((await file.path())!, "utf8");
  expect(text).toContain("Row,Category,First name,Last name,Phone,Email,Problem");
  expect(text).toContain(`3,Teaching,${tag}B,Two`);

  await dialog(page)
    .getByLabel("Upload the corrections")
    .setInputFiles({
      name: "fixed.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `Row,Category,First name,Last name,Phone,Email\n3,Teaching,${tag}B,Two,,${tag}b@x.com\n5,Teaching,${tag}D,Four,,${tag}d@x.com\n99,Teaching,x,y,,\n`,
      ),
    });
  await expect(summary(page)).toContainText("4 rows: 4 ready, 0 with problems");
  await expect(dialog(page).getByText("There is no row 99 in this file.")).toBeVisible();

  await dialog(page).getByRole("button", { name: "Save all 4 rows" }).click();
  await expect(page.getByText("4 staff records added.")).toBeVisible();
  expect(await db.staffRecord.count({ where: { firstName: { startsWith: tag } } })).toBe(4);
});

test("the administrator can save only the good rows now, and the problem rows stay to be fixed", async ({ page }) => {
  await openBulk(page);
  await chooseFile(page, "staff.csv", csv(`Teaching,${tag}A,One,,`, `Teaching,${tag}B,Two,,bad`, `NT,${tag}C,Three,,`));
  await expect(summary(page)).toContainText("3 rows: 2 ready, 1 with problems");
  await dialog(page).getByRole("button", { name: "Save the 2 good rows now" }).click();
  await expect(page.getByText("2 staff records added.")).toBeVisible();
  expect(await db.staffRecord.count({ where: { firstName: { startsWith: tag } } })).toBe(2);
  await expect(summary(page)).toContainText("1 row: 0 ready, 1 with problems");
});

test("an Excel file reads, and the template is an Excel file with dropdowns", async ({ page }) => {
  await openBulk(page);
  const download = page.waitForEvent("download");
  await dialog(page).getByRole("button", { name: "Excel template" }).click();
  expect((await download).suggestedFilename()).toBe("staff-template.xlsx");
  const book = await writeXlsxFile([
    ["Category", "First name", "Last name", "Phone"].map((value) => ({ value, type: String })),
    ["Teaching staff", `${tag}X`, "Excel", "8030000009"].map((value) => ({ value, type: String })),
  ]).toBlob();
  await chooseFile(page, "staff.xlsx", Buffer.from(await book.arrayBuffer()));
  await expect(summary(page)).toContainText("1 row: 1 ready, 0 with problems");
  await dialog(page).getByRole("button", { name: "Save all 1 row" }).click();
  await expect(page.getByText("1 staff record added.")).toBeVisible();
  expect((await db.staffRecord.findFirstOrThrow({ where: { firstName: `${tag}X` } })).phone).toBe("08030000009");
});

test("a file that cannot be read says so and what to do; an old .xls is not guessed at", async ({ page }) => {
  await openBulk(page);
  await chooseFile(page, "notes.txt", Buffer.from("hello"));
  await expect(dialog(page).getByRole("alert")).toContainText("CSV or Excel (.xlsx)");
  await chooseFile(page, "old.xls", Buffer.from("x"));
  await expect(dialog(page).getByRole("alert")).toContainText("Save it as .xlsx or CSV");
  await chooseFile(page, "empty.csv", Buffer.from(""));
  await expect(dialog(page).getByRole("alert")).toContainText("empty");
  await chooseFile(page, "wrong.csv", Buffer.from("A,B\n1,2"));
  await expect(dialog(page).getByRole("alert")).toContainText('"First name" column is missing');
});

test("the grid: type, choose from a dropdown, paste from Excel, stop at 50 rows, delete a row, check, save", async ({ page }) => {
  await openBulk(page);
  await dialog(page).getByRole("button", { name: "Type or paste rows" }).click();
  await expect(dialog(page).getByText("1 of 50 rows")).toBeVisible();
  await dialog(page).getByLabel("Category, row 1").selectOption({ label: "Teaching staff" });
  await dialog(page).getByLabel("First name, row 1").fill(`${tag}G1`);
  await dialog(page).getByLabel("Last name, row 1").fill("Grid");
  await dialog(page).getByRole("button", { name: "Add row" }).click();
  await expect(dialog(page).getByText("2 of 50 rows")).toBeVisible();

  // a block copied from Excel (tab between cells, new line between rows) fills the cells downward from where it is pasted, adding rows
  const block = [`Non-teaching staff\t${tag}G2\tPasted\t08030000002\t`, `Teaching\t${tag}G3\tPasted\t\t${tag}g3@x.com`].join("\n");
  await dialog(page)
    .getByLabel("Category, row 2")
    .evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, block);
  await expect(dialog(page).getByText("3 of 50 rows")).toBeVisible();
  await expect(dialog(page).getByLabel("First name, row 3")).toHaveValue(`${tag}G3`);

  await dialog(page).getByRole("button", { name: "Delete row 1" }).click();
  await expect(dialog(page).getByText("2 of 50 rows")).toBeVisible();

  const many = Array.from({ length: 60 }, (_, i) => `Teaching\t${tag}M${i}\tMany\t\t`).join("\n");
  await dialog(page)
    .getByLabel("Category, row 2")
    .evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, many);
  await expect(dialog(page).getByText("50 of 50 rows")).toBeVisible();
  await expect(dialog(page).getByText("Only 50 rows fit; 10 were not pasted.")).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Add row" })).toBeDisabled();

  await dialog(page).getByRole("button", { name: "Check the rows" }).click();
  await expect(summary(page)).toContainText("50 rows: 50 ready, 0 with problems");
  await dialog(page).getByRole("button", { name: "Save all 50 rows" }).click();
  await expect(page.getByText("50 staff records added.")).toBeVisible();
  expect(await db.staffRecord.count({ where: { firstName: { startsWith: tag } } })).toBe(50);
});

test("problem rows can be edited in the grid when there are 50 or fewer, even if the file is larger; editing everything needs 50 rows or fewer", async ({
  page,
}) => {
  await openBulk(page);
  const lines = Array.from({ length: 60 }, (_, i) => `Teaching,${tag}F${i},File,,${i < 2 ? "bad" : ""}`);
  await chooseFile(page, "big.csv", csv(...lines));
  await expect(summary(page)).toContainText("60 rows: 58 ready, 2 with problems");
  await expect(dialog(page).getByRole("button", { name: "Edit all 60 rows" })).toBeDisabled();
  await expect(dialog(page).getByText(/more than 50 rows/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Edit the 2 problem rows" }).click();
  await expect(dialog(page).getByText("2 of 50 rows")).toBeVisible();
  await expect(dialog(page).getByLabel("Email, row 2")).toHaveValue("bad");
  await dialog(page).getByLabel("Email, row 2").fill(`${tag}f0@x.com`);
  await dialog(page).getByLabel("Email, row 3").fill(`${tag}f1@x.com`);
  await dialog(page).getByRole("button", { name: "Check the rows" }).click();
  await expect(summary(page)).toContainText("60 rows: 60 ready, 0 with problems");
});

test("leaving with rows that are not saved asks first and offers the download; nothing entered closes at once", async ({ page }) => {
  await openBulk(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add many" }).click();
  await dialog(page).getByRole("button", { name: "Type or paste rows" }).click();
  await dialog(page).getByLabel("First name, row 1").fill(`${tag}L`);
  await page.keyboard.press("Escape");
  const leave = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(leave).toBeVisible();
  const download = page.waitForEvent("download");
  await leave.getByRole("button", { name: "Download as CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await leave.getByRole("button", { name: "Stay" }).click();
  await expect(leave).toBeHidden();
  await expect(dialog(page).getByLabel("First name, row 1")).toHaveValue(`${tag}L`);
  await dialog(page).getByRole("button", { name: "Close", exact: true }).click();
  await leave.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a teacher does not get the button", async ({ page }) => {
  const user = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false, name: `${tag} Teacher` });
  await signInThroughUi(page, user);
  await page.goto("/academics");
  await page.getByRole("tab", { name: "Staff" }).click();
  await expect(page.getByRole("heading", { name: "Staff", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add many" })).toHaveCount(0);
});

test("layout at tablet, desktop and phone widths: no page scroll, labelled cards on a phone, a table above it, and axe on each screen", async ({
  page,
}) => {
  await openBulk(page);
  await dialog(page).getByRole("button", { name: "Type or paste rows" }).click();
  await dialog(page).getByLabel("First name, row 1").fill(`${tag}R`);
  await dialog(page).getByLabel("Email, row 1").fill("nope");
  for (const [name, width, height] of [
    ["tablet", 820, 1180],
    ["desktop", 1280, 800],
    ["phone", 390, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(dialog(page).getByLabel("First name, row 1")).toBeVisible();
    await expectNoPageScroll(page, `the grid at ${name}`);
    await expectAccessible(page, `the grid at ${name}`);
    const header = dialog(page).getByRole("columnheader", { name: "First name" });
    if (width >= 768) await expect(header).toBeVisible();
    else await expect(header).toBeHidden();
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await dialog(page).getByRole("button", { name: "Check the rows" }).click();
  await expect(summary(page)).toContainText("1 row: 0 ready, 1 with problems");
  await expectNoPageScroll(page, "the review on a phone");
  await expectAccessible(page, "the review on a phone");
});
