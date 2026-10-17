import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  if (results.violations.length > 0) {
    console.log(
      "AXE VIOLATIONS ON " + what + ":",
      JSON.stringify(
        results.violations.map((v) => ({
          id: v.id,
          help: v.help,
          nodes: v.nodes.map((n) => ({ html: n.html, failureSummary: n.failureSummary })),
        })),
        null,
        2,
      ),
    );
  }
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.describe("Slice P6 — Multi-Channel Communication Console & WCAG 2.2 AA", () => {
  test("renders Communication Console, navigates tabs, composes broadcast, and passes WCAG 2.2 AA", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Comm Admin", superAdmin: false });

    // 1. Sign in as admin
    await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
    await expect(page).toHaveURL(/\/dashboard/);

    // 2. Navigate to /communication
    await page.goto("/communication");
    await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();

    // 3. Accessibility audit on Broadcast Composer tab
    await expectAccessible(page, "Communication — Broadcast Composer tab");

    // 4. Test Broadcast form interactions
    await page.getByLabel("Message Content").fill("Important school broadcast: parent-teacher meeting next Friday.");
    await expect(page.getByRole("paragraph").filter({ hasText: "Important school broadcast:" })).toBeVisible();

    // 5. Switch to Message Logs tab
    const logsTab = page.getByRole("tab", { name: "Message Logs & Dispatches" });
    await logsTab.click();
    await expect(logsTab).toHaveAttribute("aria-selected", "true");
    await expectAccessible(page, "Communication — Message Logs tab");

    // 6. Switch to Notification Templates tab
    const templatesTab = page.getByRole("tab", { name: "Notification Templates" });
    await templatesTab.click();
    await expect(templatesTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "+ New Template" })).toBeVisible();
    await expectAccessible(page, "Communication — Notification Templates tab");

    // 7. Open New Template Modal and audit accessibility
    await page.getByRole("button", { name: "+ New Template" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page, "Communication — New Template Dialog");

    // Close modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
