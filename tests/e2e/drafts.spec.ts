import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0101 D1 (batch 3a) on screen (the maintainer, 2026-11-19: "how do I mark a new staff record or multiple records as draft?"): a staff record or a pupil is saved as a draft with only the
// names, shows a Draft badge and what is missing, can be found with the Drafts filter, is refused Complete until it has what a finished record needs, and is completed from the Actions menu.
// "Add many" saves a whole file as drafts. Desktop and phone (the two projects); axe (WCAG 2.2 A/AA) on the lists with a draft.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

const dialog = (page: Page) => page.getByRole("dialog").first();
// The filters sit behind the toolbar's Filters button; opening it twice would close it, so it is opened only when closed.
async function openFilters(page: Page) {
  const button = page.getByRole("button", { name: /^Filters/ });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
}

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `D${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  const starts = { startsWith: tag };
  await db.staffRecord.deleteMany({ where: { firstName: starts } });
  await db.studentEnrollment.deleteMany({ where: { student: { firstName: starts } } });
  await db.studentRecord.deleteMany({ where: { firstName: starts } });
  await db.classArm.deleteMany({ where: { classGroup: { name: starts } } });
  await db.classGroup.deleteMany({ where: { name: starts } });
  await db.academicSession.deleteMany({ where: { label: `${tag} session` } });
});

async function signInAsAdmin(page: Page) {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: `${tag} Admin` });
  await signInThroughUi(page, admin);
  return branch;
}

test("staff: Save as draft shows the badge and what is missing; the Drafts filter finds it; Complete is refused, then allowed once the record is finished", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/academics?tab=staff");
  await expect(page.getByRole("heading", { level: 2, name: "Staff", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New staff record" }).click();
  await dialog(page).getByLabel("First name").fill(`${tag}Dee`);
  await dialog(page).getByLabel("Last name").fill("Raft");
  await dialog(page).getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText(`${tag}Dee Raft added as a draft.`)).toBeVisible();

  const item = () =>
    page
      .getByRole("list", { name: "Staff" })
      .getByRole("listitem")
      .filter({ hasText: `${tag}Dee` });
  await expect(item()).toContainText("Draft");
  await expect(item()).toContainText("Missing: gender, e-mail or phone");
  await expect(page.getByText(/1 draft/).first()).toBeVisible();
  // A draft is not offered for an invitation, and cannot be given subjects: its card has no tick box, and Manage says why.
  await expect(item().getByLabel(`Select ${tag}Dee Raft to invite`)).toHaveCount(0);
  await expectAccessible(page, "the staff list with a draft");

  // The Drafts filter.
  await openFilters(page);
  const drafts = page.getByRole("combobox", { name: "Drafts" });
  await drafts.selectOption("NO");
  await expect(item()).toHaveCount(0);
  await drafts.selectOption("YES");
  await expect(item()).toHaveCount(1);
  await drafts.selectOption("");

  // Complete is refused, and says what is missing.
  await clickAction(item(), `Complete ${tag}Dee Raft`);
  await expect(page.getByText(/not complete yet/).first()).toBeVisible();
  await expect(page.getByText(/Missing: gender, e-mail or phone/).first()).toBeVisible();
  await expect(item()).toContainText("Draft");

  // Finish the record, then complete it.
  await clickAction(item(), `Edit ${tag}Dee Raft`);
  await dialog(page).getByLabel("Gender (optional)").selectOption("FEMALE");
  await dialog(page).getByLabel("Email (optional)").fill(`${tag.toLowerCase()}dee@school.example`);
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`${tag}Dee Raft saved.`)).toBeVisible();
  await expect(item()).toContainText("Draft"); // saving never completes it on its own
  await clickAction(item(), `Complete ${tag}Dee Raft`);
  await expect(page.getByText(`${tag}Dee Raft is complete: no longer a draft.`)).toBeVisible();
  await expect(item()).not.toContainText("Draft");
  // And it can be put back.
  await clickAction(item(), `Mark ${tag}Dee Raft as a draft`);
  await expect(page.getByText(`${tag}Dee Raft is now a draft.`)).toBeVisible();
  await expect(item()).toContainText("Draft");
  expect(await db.staffRecord.count({ where: { firstName: `${tag}Dee`, isDraft: true } })).toBe(1);
});

test("staff: Add many can save the whole file as drafts", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/academics?tab=staff");
  await page.getByRole("button", { name: "Add many" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Add staff in bulk" })).toBeVisible();
  await dialog(page)
    .getByLabel(/Save these as drafts/)
    .check();
  await dialog(page)
    .getByLabel("CSV or Excel file")
    .setInputFiles({
      name: "staff.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(["Category,First name,Last name,Phone,Email", `Teaching,${tag}A,One,,`, `Non-teaching,${tag}B,Two,,`].join("\n")),
    });
  await expect(
    dialog(page)
      .getByRole("status")
      .filter({ hasText: /rows?:/ }),
  ).toContainText("2 rows: 2 ready, 0 with problems");
  await dialog(page).getByRole("button", { name: "Save all 2 rows" }).click();
  await expect(page.getByText("2 staff records added as drafts.")).toBeVisible();
  expect(await db.staffRecord.count({ where: { firstName: { startsWith: tag }, isDraft: true } })).toBe(2);
});

test("pupils: Save as draft with only the names; the list says what is missing; Complete is refused, then allowed after a class and a guardian are added (no date of birth needed)", async ({
  page,
}) => {
  const branch = await signInAsAdmin(page);
  await db.academicSession.create({
    data: {
      branchId: branch.id,
      label: `${tag} session`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "ACTIVE",
    },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: `${tag} JSS 1` } });
  await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
  await page.goto("/students");
  await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();

  await page.getByRole("button", { name: "New student" }).click();
  await dialog(page).getByLabel("First name", { exact: true }).fill(`${tag}Zainab`);
  await dialog(page).getByLabel("Last name").fill("Aliyu");
  await dialog(page).getByLabel("Gender").selectOption("FEMALE");
  await dialog(page).getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText(`${tag}Zainab Aliyu registered as a draft.`)).toBeVisible();

  const row = () => page.getByRole("listitem").filter({ hasText: `${tag}Zainab` });
  await expect(row()).toContainText("Draft");
  await expect(row()).toContainText("Missing: class, guardian name, guardian phone or e-mail");
  await expect(page.getByText(/1 draft among these pupils/)).toBeVisible();
  await expectAccessible(page, "the pupil list with a draft");

  await openFilters(page);
  const drafts = page.getByRole("combobox", { name: "Drafts" });
  await drafts.selectOption("NO");
  await expect(row()).toHaveCount(0);
  await drafts.selectOption("YES");
  await expect(row()).toHaveCount(1);
  await drafts.selectOption("");

  await clickAction(row(), `Complete ${tag}Zainab Aliyu`);
  await expect(page.getByText(/not complete yet/).first()).toBeVisible();
  await expect(row()).toContainText("Draft");

  // A pupil with no class can be given one from the edit form; then it can be completed.
  await clickAction(row(), `Edit ${tag}Zainab Aliyu`);
  await dialog(page).getByLabel("Class (optional)").selectOption(`${tag} JSS 1`);
  await dialog(page).getByLabel("Arm").selectOption("A");
  await dialog(page).getByLabel("Guardian name (optional)").fill("Mr Aliyu");
  await dialog(page).getByLabel("Guardian phone (optional)").fill("08031234567");
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`${tag}Zainab Aliyu saved.`)).toBeVisible();
  await expect(row()).toContainText(`${tag} JSS 1 A`);
  await expect(row()).toContainText("Draft");
  await clickAction(row(), `Complete ${tag}Zainab Aliyu`);
  await expect(page.getByText(`${tag}Zainab Aliyu is complete: no longer a draft.`)).toBeVisible();
  await expect(row()).not.toContainText("Draft");
  expect(await db.studentRecord.count({ where: { firstName: `${tag}Zainab`, isDraft: false } })).toBe(1);
});

test("pupils: Add many can save the whole file as drafts", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/students");
  await page.getByRole("button", { name: "Add many" }).click();
  await dialog(page)
    .getByLabel(/Save these as drafts/)
    .check();
  await dialog(page)
    .getByLabel("CSV or Excel file")
    .setInputFiles({
      name: "pupils.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(["First name,Last name,Gender", `${tag}Amina,Importer,Female`, `${tag}Bilal,Importer,Male`].join("\n")),
    });
  await expect(
    dialog(page)
      .getByRole("status")
      .filter({ hasText: /rows?:/ }),
  ).toContainText("2 rows: 2 ready, 0 with problems");
  await dialog(page).getByRole("button", { name: "Save all 2 rows" }).click();
  await expect(page.getByText(/2 pupils added to .* as drafts\./)).toBeVisible();
  expect(await db.studentRecord.count({ where: { firstName: { startsWith: tag }, isDraft: true } })).toBe(2);
});
