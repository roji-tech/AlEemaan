import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { hashInvitationToken } from "@/lib/invitations/token";
import { clickAction, signInThroughUi, switchBranch } from "./helpers";

// Task 0117 on screen (the maintainer, 2026-11-20): all branches in one staff list, the "not on the staff list yet" panel that can be closed or snoozed, a superadmin deleting a record, the
// chosen branch kept when leaving a page, popups that close on an outside press, and the history of invitations. Driven on a desktop and a phone.

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
  const home = await seedInstance();
  const other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  const boss = await createUser({ role: Role.ADMIN, name: "Sweep Admin" }); // a superadmin: every branch
  await signInThroughUi(page, boss);
  return { home, other, boss };
}
const makeRecord = (branchId: string, firstName: string, lastName: string, extra: object = {}) =>
  db.staffRecord.create({
    data: {
      branchId,
      category: "TEACHING",
      firstName,
      lastName,
      email: `${firstName}.${lastName}.${Date.now()}@school.example`.toLowerCase(),
      ...extra,
    },
  });

test("All branches: one list of every branch, each card names its branch, nothing can be added, and Open in branch goes there", async ({
  page,
}) => {
  const { home, other } = await setUp(page);
  await makeRecord(home.id, "Hana", "Home");
  await makeRecord(other.id, "Olu", "Other");
  await page.goto(`/academics?tab=staff&branch=${home.id}`);
  await switchBranch(page, "All branches");
  await expect(page.getByTestId("current-branch")).toHaveText("All branches");
  const list = page.getByRole("list", { name: "Staff" });
  await expect(list.getByRole("listitem").filter({ hasText: "Hana Home" })).toContainText(home.name);
  await expect(list.getByRole("listitem").filter({ hasText: "Olu Other" })).toContainText(other.name);
  await expect(page.getByRole("button", { name: "New staff record" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add many" })).toHaveCount(0);
  await expect(page.getByText("Choose a branch to add staff there")).toBeVisible();
  await expectAccessible(page, "the staff list across branches");
  // Search works across branches.
  await page.getByRole("searchbox", { name: "Search staff" }).fill("Olu");
  await expect(page.getByText("1 staff record match")).toBeVisible();
  await page.getByRole("button", { name: `Open Olu Other in ${other.name}` }).click();
  await expect(page.getByTestId("current-branch")).toHaveText(other.name);
  await expect(page.getByRole("button", { name: "New staff record" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`branch=${other.id}`));
});

test("the 'not on the staff list yet' panel: Close, Remind me later, Don't list; a chip brings it back; the choice survives a reload", async ({
  page,
}) => {
  const { home } = await setUp(page);
  const khalid = await createUser({ name: "Akinniyi Khalid" });
  await db.membership.create({ data: { userId: khalid.id, branchId: home.id, role: Role.ADMIN } });
  await page.goto(`/academics?tab=staff&branch=${home.id}`);
  const panel = page.getByRole("region", { name: /Signs in here, not on the staff list yet/ });
  await expect(panel).toContainText("Akinniyi Khalid");
  await expectAccessible(page, "the panel with its new buttons");
  // Close: hidden, a chip stands in, and the chip reopens it.
  await panel.getByRole("button", { name: /^Close/ }).click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(panel).toBeHidden();
  const chip = page.getByRole("button", { name: /not on the list$/ });
  await expect(chip.first()).toBeVisible();
  await chip.first().click();
  await expect(panel).toBeVisible();
  // Remind me later: hidden for a week.
  await panel.getByRole("button", { name: "Remind me later" }).click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(panel).toBeHidden();
  await page
    .getByRole("button", { name: /not on the list$/ })
    .first()
    .click();
  // Don't list: the person is left out, "Show hidden" brings them back.
  await panel.getByRole("button", { name: "Don't list Akinniyi Khalid" }).click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Show hidden \(1\)/ })).toBeVisible();
  await page.getByRole("button", { name: /^Show hidden \(1\)/ }).click();
  await expect(page.getByRole("list", { name: "Left out of the list" })).toContainText("Akinniyi Khalid");
  await page.getByRole("button", { name: "List Akinniyi Khalid again" }).click();
  await expect(panel).toContainText("Akinniyi Khalid");
});

test("a superadmin deletes a record with no history after typing the name; the person's sign-in stays; a record with history says why not", async ({
  page,
}) => {
  const { home, boss } = await setUp(page);
  const member = await createUser({ name: "Main Super" });
  await db.membership.create({ data: { userId: member.id, branchId: home.id, role: Role.ADMIN } });
  await makeRecord(home.id, "Mistake", "Entry", { email: member.email, userId: member.id });
  const busy = await makeRecord(home.id, "Busy", "Teacher");
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 9", sortOrder: 9 } });
  await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A", classTeacherId: busy.id } });
  await page.goto(`/academics?tab=staff&branch=${home.id}`);
  const list = page.getByRole("list", { name: "Staff" });

  await clickAction(list.getByRole("listitem").filter({ hasText: "Busy Teacher" }), "Delete the record of Busy Teacher");
  let dialog = page.getByRole("dialog", { name: "Delete the record of Busy Teacher" });
  await dialog.getByLabel("Type Busy Teacher to confirm").fill("Busy Teacher");
  await dialog.getByRole("button", { name: "Delete record" }).click();
  await expect(dialog).toContainText("class teacher of 1 class arm");
  await expect(dialog).toContainText("Archive it instead");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(list.getByRole("listitem").filter({ hasText: "Busy Teacher" })).toBeVisible();

  await clickAction(list.getByRole("listitem").filter({ hasText: "Mistake Entry" }), "Delete the record of Mistake Entry");
  dialog = page.getByRole("dialog", { name: "Delete the record of Mistake Entry" });
  await expectAccessible(page, "the delete dialog");
  await expect(dialog.getByRole("button", { name: "Delete record" })).toBeDisabled();
  await dialog.getByLabel("Type Mistake Entry to confirm").fill("Mistake Entry");
  await dialog.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByText("The record of Mistake Entry was deleted.")).toBeVisible();
  await expect(list.getByRole("listitem").filter({ hasText: "Mistake Entry" })).toHaveCount(0);
  expect(await db.membership.count({ where: { userId: member.id, branchId: home.id } })).toBe(1);
  expect(await db.auditLog.count({ where: { action: "STAFF_DELETED", actorUserId: boss.id } })).toBe(1);
});

test("a branch administrator is not offered Delete", async ({ page }) => {
  const home = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" });
  await makeRecord(home.id, "Plain", "Person");
  await signInThroughUi(page, admin);
  await page.goto("/academics?tab=staff");
  await page.getByRole("button", { name: "Actions for Plain Person" }).click();
  await expect(page.getByRole("button", { name: "Archive Plain Person" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete the record of Plain Person" })).toHaveCount(0);
});

test("the chosen branch is kept: leave the page and come back, and the address carries it", async ({ page }) => {
  const { other } = await setUp(page);
  await page.goto("/students");
  await switchBranch(page, other.name);
  await expect(page.getByTestId("current-branch")).toHaveText(other.name);
  await expect(page).toHaveURL(new RegExp(`branch=${other.id}`));
  await page.goto("/dashboard");
  await page.goto("/students");
  await expect(page.getByTestId("current-branch")).toHaveText(other.name);
  // Another page that lists by branch starts on it too.
  await page.goto("/academics?tab=classes");
  await expect(page.getByTestId("current-branch")).toHaveText(other.name);
});

test("a dropdown closes on a press outside it; a read-only dialog closes on its backdrop but a form does not", async ({ page }) => {
  const { home } = await setUp(page);
  await makeRecord(home.id, "Dora", "Details");
  await page.goto(`/academics?tab=staff&branch=${home.id}`);
  const switcher = page.getByRole("button", { name: "Switch branch" });
  await switcher.click();
  await expect(switcher).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("heading", { level: 1, name: "Academics" }).click();
  await expect(switcher).toHaveAttribute("aria-expanded", "false");

  const menu = page.getByRole("button", { name: "Actions for Dora Details" });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("heading", { level: 1, name: "Academics" }).click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");

  // A details view holds nothing to type: a press on the backdrop closes it.
  await page.getByRole("button", { name: "Details of Dora Details" }).click();
  const details = page.getByRole("dialog", { name: /Dora Details/ });
  await expect(details).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(details).toBeHidden();

  // A form keeps what was typed: the same press does not close it.
  await page.getByRole("button", { name: "New staff record" }).click();
  const form = page.getByRole("dialog", { name: "New staff record" });
  await form.getByLabel("First name").fill("Typed");
  await page.mouse.click(3, 3);
  await expect(form).toBeVisible();
  await expect(form.getByLabel("First name")).toHaveValue("Typed");
});

test("Users > Pending invitations: the history shows a revoked invitation with who revoked it", async ({ page }) => {
  const { home, boss } = await setUp(page);
  const revoked = await db.invitation.create({
    data: {
      email: `gone-${Date.now()}@school.example`,
      role: Role.TEACHING_STAFF,
      branchId: home.id,
      tokenHash: hashInvitationToken(randomBytes(32).toString("base64url")),
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      revokedAt: new Date(),
    },
  });
  await db.auditLog.create({
    data: {
      actorUserId: boss.id,
      action: "INVITATION_REVOKED",
      targetType: "Invitation",
      targetId: revoked.id,
      afterValue: { email: revoked.email, role: revoked.role, branchId: home.id },
      reason: "revoked by an administrator",
    },
  });
  await page.goto("/users?tab=invitations");
  await expect(page.getByText(revoked.email)).toHaveCount(0); // not open any more
  await page.getByRole("button", { name: /Show history/ }).click();
  const row = page.getByRole("list", { name: "Invitation history" }).getByRole("listitem").filter({ hasText: revoked.email });
  await expect(row).toContainText("Revoked by Sweep Admin");
  await expect(row).toContainText("revoked by an administrator");
  await expectAccessible(page, "the invitation history");
  await page.getByRole("button", { name: "Back to waiting invitations" }).click();
  await expect(page.getByRole("button", { name: /Show history/ })).toBeVisible();
});
