import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance, uniqueEmail } from "../support/db";
import { clickAction, openInvitationsTab, signInThroughUi } from "./helpers";

// Sweep 2 (task 0118) on screen: staff with no branch yet (add, place, delete), a draft invitation (save, send, send all), "Add to department" in the staff selection bar, and the branch
// that stays chosen when you leave a page and come back. Desktop and phone. The department head's review is covered over HTTP (tests/api/department-head-review.spec.ts).

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}
const dialog = (page: Page) => page.getByRole("dialog");

test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function superadmin(page: Page) {
  const home = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Sweep Boss" });
  await signInThroughUi(page, admin);
  return { home, admin };
}

test("staff with no branch: a superadmin adds one under 'Not placed in a branch', it is in no branch's list, then places it", async ({
  page,
}) => {
  const { home } = await superadmin(page);
  await page.goto("/academics?tab=staff&branch=unplaced");
  await expect(page.getByTestId("current-branch")).toHaveText("Not placed in a branch");
  await expect(page.getByText(/People added without a branch/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add many" })).toHaveCount(0); // a file needs a branch

  await page.getByRole("button", { name: "New staff record" }).click();
  const form = dialog(page);
  await form.getByLabel("First name").fill("Zed");
  await form.getByLabel("Last name").fill("Unplaced");
  await expectAccessible(page, "the new staff record form");
  await form.getByRole("button", { name: "Add staff record" }).click();
  await expect(page.getByText("Zed Unplaced added.")).toBeVisible();
  const list = page.getByRole("list", { name: "Staff" });
  await expect(list.getByRole("listitem").filter({ hasText: "Zed Unplaced" })).toBeVisible();
  expect(await db.staffRecord.count({ where: { firstName: "Zed", branchId: null } })).toBe(1);

  // Not in any branch's list.
  await page.goto(`/academics?tab=staff&branch=${home.id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Staff" })).toBeVisible();
  await expect(page.getByText("Zed Unplaced")).toHaveCount(0);

  // Place it.
  await page.goto("/academics?tab=staff&branch=unplaced");
  await clickAction(page, "Place Zed Unplaced in a branch");
  const place = dialog(page);
  await place.getByLabel("Branch").selectOption({ label: BRANCH_NAMES[1] });
  await expectAccessible(page, "the place dialog");
  await place.getByRole("button", { name: "Place in branch" }).click();
  await expect(page.getByText(new RegExp(`Zed Unplaced is now in ${BRANCH_NAMES[1].replace(/[()]/g, "\\$&")}`))).toBeVisible();
  await expect(page.getByRole("list", { name: "Staff" }).getByText("Zed Unplaced")).toHaveCount(0);
  expect(await db.staffRecord.count({ where: { firstName: "Zed", branchId: { not: null } } })).toBe(1);
  expect(await db.auditLog.count({ where: { action: "STAFF_PLACED" } })).toBe(1);
});

test("a draft invitation: Save as draft sends nothing, it is listed as a draft, Send makes it a waiting invitation, Send all drafts sends the rest", async ({
  page,
}) => {
  await superadmin(page);
  await page.goto("/users");
  await page.getByRole("button", { name: "Invite someone" }).click();
  const d = dialog(page);
  const first = uniqueEmail("draft");
  await d.getByLabel("Email address").fill(first);
  await d.getByLabel("Role").selectOption("PARENT");
  await d.getByLabel("Branch").selectOption({ label: BRANCH_NAMES[0] });
  await d.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText(/Draft saved for .*Nothing was sent/)).toBeVisible();
  expect(await db.invitation.count({ where: { email: first, tokenHash: null } })).toBe(1);

  // A second draft, saved the same way.
  await page.getByRole("button", { name: "Invite someone" }).click();
  const second = uniqueEmail("draft2");
  await dialog(page).getByLabel("Email address").fill(second);
  await dialog(page).getByLabel("Role").selectOption("PARENT");
  await dialog(page).getByLabel("Branch").selectOption({ label: BRANCH_NAMES[0] });
  await dialog(page).getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText(/Draft saved for/).first()).toBeVisible();

  await openInvitationsTab(page);
  const waiting = page.getByRole("list", { name: "Pending invitations" });
  await expect(waiting.getByRole("listitem").filter({ hasText: first })).toContainText("Draft");
  await expectAccessible(page, "the pending invitations with drafts");

  await clickAction(page, `Send the draft invitation to ${first}`);
  await expect(page.getByText(`The invitation to ${first} was sent.`)).toBeVisible();
  await expect(waiting.getByRole("listitem").filter({ hasText: first })).not.toContainText("Draft");
  expect(await db.invitation.count({ where: { email: first, tokenHash: { not: null } } })).toBe(1);

  await page.getByRole("button", { name: /Send all drafts \(1\)/ }).click();
  await expect(page.getByText(/1 draft sent\./)).toBeVisible();
  expect(await db.invitation.count({ where: { email: second, tokenHash: { not: null } } })).toBe(1);
});

test("Add to department: tick people in the staff list and put them in a department", async ({ page }) => {
  const { home } = await superadmin(page);
  await db.settingValue.create({
    data: { scope: "BRANCH", branchId: home.id, key: "academics.useDepartments", value: true, status: "APPROVED" },
  });
  await db.department.create({ data: { branchId: home.id, name: "Sciences" } });
  await db.staffRecord.createMany({
    data: [
      { branchId: home.id, category: "TEACHING", firstName: "Amina", lastName: "Yusuf", email: uniqueEmail("amina") },
      { branchId: home.id, category: "TEACHING", firstName: "Bala", lastName: "Musa", email: uniqueEmail("bala") },
    ],
  });
  await page.goto(`/academics?tab=staff&branch=${home.id}`);
  await page.getByRole("button", { name: "Select everyone who can be invited (2)" }).click();
  const bar = page.getByRole("region", { name: "Selected staff" });
  await bar.getByRole("button", { name: "Add to department" }).click();
  const d = dialog(page);
  await expect(d).toContainText("Amina Yusuf");
  await expectAccessible(page, "the add to department dialog");
  await d.getByLabel("Department").selectOption({ label: "Sciences" });
  await d.getByRole("button", { name: "Add to department" }).click();
  await expect(page.getByText("2 added to Sciences.")).toBeVisible();
  expect(await db.departmentMember.count({ where: { isHead: false } })).toBe(2);
});

test("the branch you chose is still chosen when you come back to the page (the address, then the browser's memory)", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the same behaviour as on a desktop; the phone only moves the picker");
  await superadmin(page);
  await page.goto("/forms");
  const choice = page.getByLabel("Branch", { exact: true });
  const second = await choice.evaluate((el) => (el as HTMLSelectElement).options[1].text);
  await choice.selectOption({ label: second });
  await expect(page).toHaveURL(/branch=/);
  // Away and back, with no branch in the address: the browser remembers it.
  await page.goto("/dashboard");
  await page.goto("/forms");
  // The remembered branch is applied just after hydration (the first paint matches the server's), so read it until it settles rather than once.
  await expect
    .poll(() => page.getByLabel("Branch", { exact: true }).evaluate((el) => (el as HTMLSelectElement).selectedOptions[0].text))
    .toBe(second);
});

test("a record that is already a draft is edited with Save draft and Complete, not the redundant Save and Save as draft (staff)", async ({
  page,
}) => {
  const { home } = await superadmin(page);
  await db.staffRecord.create({ data: { branchId: home.id, category: "TEACHING", firstName: "Dee", lastName: "Draft", isDraft: true } });
  await db.staffRecord.create({ data: { branchId: home.id, category: "TEACHING", firstName: "Nora", lastName: "Normal" } });
  await page.goto(`/academics?tab=staff&branch=${home.id}`);

  // A normal record keeps Save and Save as draft.
  await clickAction(page, "Edit Nora Normal");
  await expect(dialog(page).getByRole("button", { name: "Save as draft" })).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Cancel" }).click();

  // A draft: Save draft and Complete.
  await clickAction(page, "Edit Dee Draft");
  const form = dialog(page);
  await expect(form.getByRole("button", { name: "Save as draft" })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Save draft" })).toBeVisible();
  await expectAccessible(page, "the draft's form");
  await form.getByRole("button", { name: "Complete" }).click();
  await expect(form.getByRole("alert").filter({ hasText: /Missing/ })).toBeVisible(); // still a draft, and says what is missing
  expect((await db.staffRecord.findFirstOrThrow({ where: { firstName: "Dee" } })).isDraft).toBe(true);

  await form.getByLabel("Gender (optional)").selectOption("FEMALE");
  await form.getByLabel("Email (optional)").fill(uniqueEmail("dee"));
  await form.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByText("Dee Draft saved and completed: no longer a draft.")).toBeVisible();
  expect((await db.staffRecord.findFirstOrThrow({ where: { firstName: "Dee" } })).isDraft).toBe(false);
});

test("a pupil who is already a draft is edited with Save draft and Complete (pupils)", async ({ page }) => {
  const { home } = await superadmin(page);
  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "Basic 3" } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A" } });
  const pupil = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Dee",
      lastName: "Pupil",
      gender: "FEMALE",
      admissionNo: `2026/${Date.now() % 100000}`,
      isDraft: true,
    },
  });
  await db.studentEnrollment.create({
    data: {
      branchId: home.id,
      studentId: pupil.id,
      sessionId: session.id,
      className: group.name,
      arm: "A",
      classArmId: arm.id,
      status: "ACTIVE",
    },
  });
  await page.goto(`/students?branch=${home.id}`);
  await clickAction(page, "Edit Dee Pupil");
  const form = dialog(page);
  await expect(form.getByRole("button", { name: "Save as draft" })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Save draft" })).toBeVisible();
  await form.getByRole("button", { name: "Complete" }).click();
  await expect(form.getByRole("alert").filter({ hasText: /Missing/ })).toBeVisible(); // no guardian contact yet
  expect((await db.studentRecord.findUniqueOrThrow({ where: { id: pupil.id } })).isDraft).toBe(true);
  await form.getByLabel("Guardian name (optional)").fill("Mr Pupil");
  await form.getByLabel("Guardian phone (optional)").fill("08031234567");
  await form.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByText("Dee Pupil saved and completed: no longer a draft.")).toBeVisible();
  expect((await db.studentRecord.findUniqueOrThrow({ where: { id: pupil.id } })).isDraft).toBe(false);
});
