import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Inviting many people at once, in a real browser (task 0084): the branch is chosen first, a file is reviewed row by row (a replaced invitation is said so, an administrator role is
// refused to a branch administrator), and the whole list is saved. Desktop and phone (the two projects); axe (WCAG 2.2 A/AA) runs on the screens.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `I${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await db.invitation.deleteMany({ where: { email: { startsWith: tag.toLowerCase() } } });
});

const dialog = (page: Page) => page.getByRole("dialog").first();
const email = (name: string) => `${tag.toLowerCase()}${name}@bulk.test`;
const summary = (page: Page) =>
  dialog(page)
    .getByRole("status")
    .filter({ hasText: /rows?:/ });
async function openBulk(page: Page, superAdmin = false) {
  const user = await createUser({ role: Role.ADMIN, superAdmin, name: `${tag} Admin` });
  await signInThroughUi(page, user);
  await page.goto("/users");
  await page.getByRole("button", { name: "Invite many" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Invite many people" })).toBeVisible();
  return user;
}
const chooseBranch = (page: Page) => dialog(page).getByLabel("Branch").selectOption({ index: 1 });
const chooseFile = (page: Page, text: string) =>
  dialog(page)
    .getByLabel("CSV or Excel file")
    .setInputFiles({ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(text) });

test("the branch comes first; a file is reviewed with what it would replace, and the whole list is saved", async ({ page }) => {
  const admin = await openBulk(page);
  await expect(dialog(page).getByLabel("CSV or Excel file")).toBeDisabled();
  await chooseBranch(page);
  await expect(dialog(page).getByLabel("CSV or Excel file")).toBeEnabled();

  const branch = await db.membership.findFirstOrThrow({ where: { userId: admin.id } });
  await db.invitation.create({
    data: {
      email: email("open"),
      role: "PARENT",
      branchId: branch.id,
      tokenHash: "h".repeat(64),
      invitedById: admin.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  await chooseFile(page, `Email,Role\n${email("a")},Teacher\n${email("b")},Pupil\n${email("open")},Parent\n`);
  await expect(summary(page)).toContainText("3 rows: 3 ready, 0 with problems");
  await expect(dialog(page).getByText("Will replace the open invitation.")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Save all 3 rows" }).click();
  await expect(page.getByText("3 invitations created.")).toBeVisible();
  expect(await db.invitation.count({ where: { email: { startsWith: tag.toLowerCase() }, revokedAt: null } })).toBe(3);
});

test("a branch administrator is not offered Administrator and is told why a file that names it is refused; a superadmin is offered it", async ({
  page,
}) => {
  await openBulk(page);
  await chooseBranch(page);
  await chooseFile(page, `Email,Role\n${email("x")},Administrator\n${email("y")},Teaching staff\n`);
  await expect(summary(page)).toContainText("2 rows: 1 ready, 1 with problems");
  await expect(dialog(page).getByText("Only a superadmin can invite an administrator.")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Edit the 1 problem row" }).click();
  expect(await dialog(page).getByLabel("Role, row 2").locator("option").allInnerTexts()).not.toContain("Administrator");
});

test("a superadmin sees Administrator among the roles", async ({ page }) => {
  await openBulk(page, true);
  await chooseBranch(page);
  await dialog(page).getByRole("button", { name: "Type or paste rows" }).click();
  expect(await dialog(page).getByLabel("Role, row 1").locator("option").allInnerTexts()).toContain("Administrator");
});

test("on a phone and on a desktop the start screen and the review pass axe, with no page scroll", async ({ page }) => {
  await openBulk(page);
  await chooseBranch(page);
  await expectAccessible(page, "the start screen");
  await chooseFile(page, `Email,Role\n${email("p")},Parent\nnot-an-address,Teacher\n`);
  await expect(summary(page)).toContainText("2 rows: 1 ready, 1 with problems");
  await expectAccessible(page, "the review");
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
