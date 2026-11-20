import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { BRANCH_NAMES, Role, createUser, db, manageLoginSwitches, seedInstance } from "../support/db";
import { LOGIN_CLOSED_MESSAGE } from "@/lib/auth/login-switch-rules";
import { alertWith, fillCredentials, signInButton, signInThroughUi, openTab } from "./helpers";

// Student and parent sign-in, per branch (task 0091), in a real browser, desktop and phone: a superadmin turns a branch's switch on in Settings (Sign-in access) and is told what changed; the
// student the branch had shut out can then sign in; an administrator of one branch sees only that branch on the Users page. axe (WCAG 2.2 A/AA) on the panel, and no horizontal scroll at 320 px.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const [A_NAME, B_NAME] = BRANCH_NAMES;

test.beforeAll(async () => {
  manageLoginSwitches(true);
  await seedInstance();
});
test.beforeEach(async () => {
  await db.branch.updateMany({ data: { studentLoginEnabled: false, parentLoginEnabled: false } });
});
test.afterAll(async () => {
  manageLoginSwitches(false);
  await seedInstance(); // every branch ON again, for every spec that follows
});

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
const studentsBox = (page: Page, branch: string) => page.getByRole("checkbox", { name: `Students can sign in to ${branch}` });
const parentsBox = (page: Page, branch: string) => page.getByRole("checkbox", { name: `Parents can sign in to ${branch}` });
const flags = async (name: string) => {
  const row = await db.branch.findUniqueOrThrow({ where: { name } });
  return [row.studentLoginEnabled, row.parentLoginEnabled];
};

test("a superadmin opens a branch's student sign-in in Settings, is told what changed, and the student who was shut out then gets in", async ({
  page,
}) => {
  const superAdmin = await createUser({ role: Role.ADMIN, name: "Sade Superadmin" });
  const student = await createUser({ role: Role.STUDENT, name: "Sola Student" }); // in the first branch

  // Closed: the right password is answered with the plain reason, and the person stays on the sign-in page.
  await page.goto("/login");
  await fillCredentials(page, student.email, student.password);
  await signInButton(page).click();
  await expect(alertWith(page, LOGIN_CLOSED_MESSAGE)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  await page.context().clearCookies();
  await signInThroughUi(page, superAdmin);
  await page.goto("/settings");
  // At 320 px the tab strip snaps (scroll-snap mandatory): a pointer click can land while the strip settles under it and become no click at all. The tab is chosen with its own click event.
  await page.getByRole("tab", { name: "Sign-in access" }).dispatchEvent("click");
  await expect(page.getByRole("heading", { level: 2, name: "Student and parent sign-in" })).toBeVisible();
  await expect(studentsBox(page, A_NAME)).not.toBeChecked(); // off by default
  await expect(parentsBox(page, A_NAME)).not.toBeChecked();
  await expectAccessible(page, "the sign-in access panel");

  await studentsBox(page, A_NAME).click(); // click, not check(): the box shows the STORED value, so it flips when the server has answered, not at the click
  await expect(page.getByRole("status").filter({ hasText: `Student sign-in is now on in ${A_NAME}.` })).toBeVisible();
  await expect(studentsBox(page, A_NAME)).toBeChecked();
  await expect(studentsBox(page, B_NAME)).not.toBeChecked(); // only that branch
  expect(await flags(A_NAME)).toEqual([true, false]);

  // the audit entry names the branch
  const audit = await db.auditLog.findFirstOrThrow({
    where: { action: "LOGIN_SWITCHES_CHANGED", actorUserId: superAdmin.id },
    orderBy: { createdAt: "desc" },
  });
  expect(audit.afterValue).toMatchObject({ branchName: A_NAME, studentLoginEnabled: true });

  await page.context().clearCookies();
  await signInThroughUi(page, student);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a superadmin selects several branches and turns a switch on for them in one go; Select all and Clear work; the page fits at 320 px", async ({
  page,
}) => {
  await signInThroughUi(page, await createUser({ role: Role.ADMIN, name: "Sade Superadmin" }));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/settings");
  await openTab(page, "Sign-in access");
  await expect(page.getByRole("heading", { level: 2, name: "Student and parent sign-in" })).toBeVisible();

  const turnOn = page.getByRole("button", { name: "Turn on parent sign-in" });
  await expect(turnOn).toBeDisabled(); // nothing is selected yet
  await page.getByRole("checkbox", { name: `Select ${A_NAME} for a change to several branches` }).check();
  await page.getByRole("checkbox", { name: `Select ${B_NAME} for a change to several branches` }).check();
  await expect(page.getByText(/^2 of \d+ selected$/)).toBeVisible();
  await turnOn.click();
  await expect(page.getByRole("status").filter({ hasText: `Parent sign-in is now on in ${A_NAME} and ${B_NAME}.` })).toBeVisible();
  expect(await flags(A_NAME)).toEqual([false, true]);
  expect(await flags(B_NAME)).toEqual([false, true]);
  expect(await flags(BRANCH_NAMES[2])).toEqual([false, false]);

  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.getByText(/^(\d+) of \1 selected$/)).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(/^0 of \d+ selected$/)).toBeVisible();

  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Turn off parent sign-in" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Parent sign-in is now off in .*Parents who are signed in there are signed out on their next click\./ }),
  ).toBeVisible();
  expect(await flags(A_NAME)).toEqual([false, false]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no horizontal scroll at 320 px").toBeLessThanOrEqual(0);
  await expectAccessible(page, "the sign-in access panel with a selection, at 320 px");
});

test("an administrator of one branch sees only that branch on the Users page, has no bulk controls, and changes it", async ({ page }) => {
  const branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Bola Branchadmin" }); // administers the first branch only
  await signInThroughUi(page, branchAdmin);
  await page.goto("/users");

  const panel = page
    .getByRole("heading", { level: 2, name: "Student and parent sign-in" })
    .locator("xpath=ancestor::div[contains(@class,'shadow-card')][1]");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("list", { name: "Branches" }).getByRole("listitem")).toHaveCount(1);
  await expect(panel.getByRole("heading", { level: 3, name: A_NAME })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Select all" })).toHaveCount(0);
  await expect(studentsBox(page, B_NAME)).toHaveCount(0);

  await studentsBox(page, A_NAME).click(); // click, not check(): the box shows the STORED value, so it flips when the server has answered, not at the click
  await expect(page.getByRole("status").filter({ hasText: `Student sign-in is now on in ${A_NAME}.` })).toBeVisible();
  expect(await flags(A_NAME)).toEqual([true, false]);
  expect(await flags(B_NAME)).toEqual([false, false]);
  await expectAccessible(page, "the users page with the sign-in panel");
});
