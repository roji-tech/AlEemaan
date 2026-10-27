import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Permission } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The Results approval tab of Settings in a real browser, on a desktop and a phone, in both themes (task 0039, slice 3): add a section, put a class in it, say where an approver
// approves, choose how classes in no section are handled. Every change goes through the confirmation dialog, which asks for the superadmin's password. The server rules (who is refused
// what, the audit rows) are the API spec's; this file is about what a person sees and can do.

test.describe.configure({ timeout: 180_000 });
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, what: string) {
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      `accessibility violations on ${what} (${theme})`,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${what} scrolls sideways (${theme})`).toBe(true);
  }
  await page.evaluate(() => void (document.documentElement.dataset.theme = "dark"));
}

let admin: Awaited<ReturnType<typeof createUser>>;
let approverUser: Awaited<ReturnType<typeof createUser>>;
let homeId = "";

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  const home = await seedInstance();
  homeId = home.id;
  admin = await createUser({ name: "Sue Superadmin", role: Role.ADMIN });
  approverUser = await createUser({ name: "Ada Approver", superAdmin: false });
  await db.membership.create({ data: { userId: approverUser.id, branchId: home.id, role: Role.TEACHING_STAFF, permissions: [Permission.CAN_APPROVE_RESULTS] } });
  await db.classGroup.createMany({ data: [{ branchId: home.id, name: "JSS 1" }, { branchId: home.id, name: "SSS 1" }] });
});

const dialog = (page: Page) => page.getByRole("dialog", { name: "Confirm it's you" });
async function openTab(page: Page) {
  await signInThroughUi(page, admin);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Results approval" }).click();
  await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible();
}
async function confirm(page: Page) {
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel("Your password").fill(admin.password);
  await dialog(page).getByRole("button", { name: "Confirm and save" }).click();
  await expect(dialog(page)).toBeHidden();
}

test("a superadmin adds a section, puts a class in it and gives an approver that section; a wrong password changes nothing", async ({ page }) => {
  await openTab(page);
  await expect(page.getByText("There are no sections yet.")).toBeVisible();
  await expect(page.getByText("Approves nothing yet.")).toBeVisible(); // the approver has the permission and nowhere to approve
  await expectAccessible(page, "results approval (empty)");

  // nothing typed: told what is missing, the dialog does not open
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByText("Give the section a name.")).toBeVisible();
  await expect(dialog(page)).toBeHidden();

  await page.getByLabel("New section").fill("Junior");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(dialog(page)).toContainText("Junior");
  await expectAccessible(page, "the confirmation dialog");
  // a wrong password is told in the dialog and nothing is written
  await dialog(page).getByLabel("Your password").fill("not-the-password-1");
  await dialog(page).getByRole("button", { name: "Confirm and save" }).click();
  await expect(dialog(page)).toContainText("That password isn't right.");
  expect(await db.section.count()).toBe(0);
  await dialog(page).getByLabel("Your password").fill(admin.password);
  await dialog(page).getByRole("button", { name: "Confirm and save" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText("Added the section Junior.")).toBeVisible();
  expect(await db.section.count({ where: { branchId: homeId, name: "Junior" } })).toBe(1);

  // put JSS 1 in it
  await page.getByLabel("Section for JSS 1").selectOption({ label: "Junior" });
  await page.getByRole("button", { name: "Place JSS 1" }).click();
  await confirm(page);
  await expect(page.getByText("Put JSS 1 in Junior.")).toBeVisible();
  expect((await db.classGroup.findFirstOrThrow({ where: { name: "JSS 1" } })).sectionId).not.toBeNull();
  await expectAccessible(page, "results approval (one section)");

  // give the approver the section
  await page.getByRole("button", { name: "Change where Ada Approver approves" }).click();
  await page.getByLabel("Junior", { exact: true }).check();
  await page.getByRole("button", { name: "Review & save" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Where Ada Approver approves" })).toContainText("Section: Junior");
  const rows = await db.resultApprovalScope.findMany({ where: { userId: approverUser.id } });
  expect(rows.map((row) => row.kind)).toEqual(["SECTION"]);
  expect((await db.auditLog.findMany({ where: { action: "RESULT_APPROVAL_SCOPE_CHANGED" } })).length).toBe(1);
});

test("a section can be renamed, archived and restored, and classes in no section are chosen per branch", async ({ page }) => {
  const section = await db.section.create({ data: { branchId: homeId, name: "Primary" } });
  await openTab(page);
  await page.getByRole("button", { name: "Rename Primary" }).click();
  await page.getByLabel("New name for Primary").fill("Lower school");
  await page.getByRole("button", { name: "Save name" }).click();
  await confirm(page);
  await expect(page.getByText("Renamed the section Primary to Lower school.")).toBeVisible();

  await page.getByRole("button", { name: "Archive Lower school" }).click();
  await confirm(page);
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await expectAccessible(page, "results approval (an archived section)");
  await page.getByRole("button", { name: "Restore Lower school" }).click();
  await confirm(page);
  expect((await db.section.findUniqueOrThrow({ where: { id: section.id } })).archivedAt).toBeNull();

  await page.getByLabel("Who approves a class that is in no section").selectOption("ANY_SECTION_APPROVER");
  await expect(dialog(page)).toContainText("Also any approver of a section in the branch");
  await confirm(page);
  await expect(page.getByLabel("Who approves a class that is in no section")).toHaveValue("ANY_SECTION_APPROVER");
  expect((await db.settingAudit.findMany({ where: { settingKey: "results.unsectionedClassApproval" } })).map((row) => row.action)).toEqual(["CHANGED_WIDENING"]);
});

test("Everything cannot be combined; with it ticked the boxes below are off", async ({ page }) => {
  await openTab(page);
  await page.getByRole("button", { name: "Change where Ada Approver approves" }).click();
  await page.getByLabel("Everything (General)").check();
  await expect(page.getByLabel("JSS 1", { exact: true })).toBeDisabled(); // a class box inside the switched-off group
  await expect(page.getByLabel("SSS 1", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Review & save" }).click();
  await confirm(page);
  await expect(page.getByRole("list", { name: "Where Ada Approver approves" })).toContainText("Everything");
  expect((await db.resultApprovalScope.findMany({ where: { userId: approverUser.id } })).map((row) => row.kind)).toEqual(["GENERAL"]);
});

test("a person who is not a superadmin is told they cannot open Settings", async ({ page }) => {
  await signInThroughUi(page, approverUser);
  await page.goto("/settings");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});
