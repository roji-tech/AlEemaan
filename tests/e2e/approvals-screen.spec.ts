import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The Approvals page in a real browser (Slice UI1): a superadmin puts the report-card layout behind approval, an administrator's change becomes a request with a
// reason, the superadmin approves it under Requests and the layout takes effect; the verification page proposal; self-approval grants. Axe (WCAG 2.2 A/AA) runs on
// every section in BOTH themes, on desktop and on a phone. Screenshots go to out/screenshots.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
const SHOTS = path.resolve(__dirname, "../../out/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const dialog = (page: Page) => page.getByRole("dialog");

let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `P${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  const home = await seedInstance();
  await db.settingApproval.deleteMany({ where: { branchId: home.id } });
  await db.settingValue.deleteMany({ where: { branchId: home.id } });
  await db.settingValue.deleteMany({ where: { key: { startsWith: "enforce_approval_" } } });
  await db.verificationPageConfig.deleteMany({ where: { branchId: home.id } });
  await db.adminSelfApprovalGrant.deleteMany({ where: { branchId: home.id } });
});

async function people() {
  const home = await seedInstance();
  const sup = await createUser({ superAdmin: true, name: `${tag} Super` });
  await db.membership.create({ data: { userId: sup.id, branchId: home.id, role: Role.ADMIN } });
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: `${tag} Admin` });
  return { home, sup, admin };
}

for (const theme of ["dark", "light"] as const) {
  test(`approvals: every section is accessible for a superadmin and an administrator (${theme} theme)`, async ({ page, baseURL }, info) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const { sup } = await people();
    await signInThroughUi(page, sup);
    await page.goto("/approvals");
    await expect(page.getByRole("heading", { level: 1, name: "Approvals and rules" })).toBeVisible();
    for (const tab of ["Requests", "Report cards", "Verification page", "Self-approval"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      await page.waitForLoadState("networkidle");
      await expectAccessible(page, `${tab} (${theme})`);
    }
    await page.screenshot({ path: path.join(SHOTS, `approvals-${theme}-${info.project.name}.png`) });
  });
}

test("approvals: enforcement, a request with a reason, and the superadmin's decision, end to end", async ({ page, browser, baseURL }) => {
  const { home, sup, admin } = await people();
  await signInThroughUi(page, sup);
  await page.goto("/approvals");
  await page.getByRole("tab", { name: "Report cards" }).click();
  await page.getByLabel(/An administrator.s layout change needs my approval/).click();
  await expect(page.getByLabel(/An administrator.s layout change needs my approval/)).toBeChecked();
  await expect(page.getByText("Administrators' layout changes now need your approval.")).toBeVisible();

  const adminPage = await (await browser.newContext({ baseURL: baseURL! })).newPage();
  await signInThroughUi(adminPage, admin);
  await adminPage.goto("/approvals");
  await expect(adminPage.getByRole("tab", { name: "Self-approval" })).toHaveCount(0);
  await adminPage.getByRole("tab", { name: "Report cards" }).click();
  await adminPage.getByLabel(/old school look|Legacy/i).check();
  await adminPage.getByRole("button", { name: "Save layout" }).click();
  await expect(adminPage.getByText(/couldn.t be saved|reason is required|Say why/i)).toBeVisible(); // no reason: refused in the server's words
  await adminPage.getByLabel(/^Reason/).fill("Parents are used to the old card.");
  await adminPage.getByRole("button", { name: "Save layout" }).click();
  await expect(adminPage.getByText(/Sent to a superadmin for approval/)).toBeVisible();

  await page.getByRole("tab", { name: "Requests" }).click();
  await page.getByLabel("Branch").selectOption({ label: "Secondary (English)" });
  await expect(page.getByText("Report-card layout")).toBeVisible();
  await expect(page.getByText("Reason: Parents are used to the old card.")).toBeVisible();
  await page.getByRole("button", { name: /^Approve Report-card layout/ }).click();
  await expectAccessible(page, "decision dialog");
  await dialog(page)
    .getByLabel(/Your reason/)
    .fill("Agreed.");
  await dialog(page).getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved.")).toBeVisible();

  await adminPage.reload();
  await adminPage.getByRole("tab", { name: "Report cards" }).click();
  await expect(adminPage.getByRole("radio", { checked: true })).toHaveAccessibleName(/Legacy/i);
  expect(await db.settingApproval.count({ where: { branchId: home.id, status: "APPROVED" } })).toBe(1);
  await adminPage.context().close();
});

test("approvals: an administrator proposes verification fields; a superadmin grants and withdraws self-approval", async ({
  page,
  browser,
  baseURL,
}) => {
  const { admin, sup } = await people();
  const adminPage = await (await browser.newContext({ baseURL: baseURL! })).newPage();
  await signInThroughUi(adminPage, admin);
  await adminPage.goto("/approvals");
  await adminPage.getByRole("tab", { name: "Verification page" }).click();
  await adminPage.getByLabel("Show the marks").check();
  await adminPage.getByLabel(/Why is this change needed/).fill("Parents ask for marks.");
  await adminPage.getByRole("button", { name: "Send for approval" }).click();
  await expect(adminPage.getByText(/Sent to a superadmin for approval/)).toBeVisible();
  await adminPage.context().close();

  await signInThroughUi(page, sup);
  await page.goto("/approvals");
  await page.getByLabel("Branch").selectOption({ label: "Secondary (English)" });
  // The request itself, not the words: getByText("Public verification page") also matches the page's own description ("...report cards and public
  // verification page show..."), so before the list had loaded it passed on the description (desktop) and, once both existed, failed on strict mode (phone).
  await expect(page.getByRole("button", { name: new RegExp(`^Approve Public verification page from ${tag} Admin`) })).toBeVisible();
  await page.getByRole("tab", { name: "Self-approval" }).click();
  await page.getByLabel("Branch").selectOption({ label: "Secondary (English)" }); // a superadmin sees every branch, the first alphabetically is not the home one
  await page.getByRole("button", { name: new RegExp(`Allow ${tag} Admin`) }).click();
  await expect(page.getByText(`${tag} Admin may now approve their own marks.`)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`Withdraw ${tag} Admin`) }).click();
  await expect(page.getByText(`${tag} Admin can no longer approve their own marks.`)).toBeVisible();
});
