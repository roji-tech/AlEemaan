import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Toasts instead of banners at the top of the page (task 0096): the outcome of an action appears in the corner, is announced, can be closed, goes by itself, and the page is not pushed down.
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const toasts = (page: Page) => page.getByRole("region", { name: "Notifications" });

async function withClass(page: Page, name: string) {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await db.classGroup.create({ data: { branchId: admin.branchId!, name, sortOrder: 1 } });
  await signInThroughUi(page, admin);
  await page.goto("/academics");
  await expect(page.getByRole("list", { name: "Classes" })).toBeVisible();
}

test("archiving a class shows a toast in the corner, not a banner at the top, and the page does not move", async ({ page }) => {
  await withClass(page, "Toast Class");
  const heading = page.getByRole("heading", { level: 2, name: "Classes and arms" });
  const before = (await heading.boundingBox())!.y;
  await page.getByRole("button", { name: "Archive Toast Class" }).click();

  const toast = toasts(page).getByRole("status").filter({ hasText: "Toast Class archived." });
  await expect(toast).toBeVisible();
  // the page did not shift down to make room for a banner
  expect(Math.abs((await heading.boundingBox())!.y - before)).toBeLessThan(2);
  // it sits in the top right corner
  const box = (await toast.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x + box.width).toBeGreaterThan(viewport.width * 0.6);
  expect(box.y).toBeLessThan(200);
});

test("a toast can be closed, and one that is not goes by itself", async ({ page }) => {
  await withClass(page, "Closing Class");
  await page.getByRole("button", { name: "Archive Closing Class" }).click();
  const toast = toasts(page).getByRole("status").filter({ hasText: "Closing Class archived." });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Dismiss this message" }).click();
  await expect(toast).toHaveCount(0);

  await withClassAgain(page);
  const second = toasts(page).getByRole("status").filter({ hasText: "Second Class archived." });
  await expect(second).toBeVisible();
  await expect(second).toHaveCount(0, { timeout: 9_000 }); // a success is on screen about five seconds
});

async function withClassAgain(page: Page) {
  const group = await db.classGroup.create({
    data: { branchId: (await db.branch.findFirstOrThrow()).id, name: "Second Class", sortOrder: 2 },
  });
  expect(group.id).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Archive Second Class" }).click();
}

test("a toast that holds the pointer stays; it is announced; axe finds nothing wrong with it", async ({ page }) => {
  await withClass(page, "Held Class");
  await page.getByRole("button", { name: "Archive Held Class" }).click();
  const toast = toasts(page).getByRole("status").filter({ hasText: "Held Class archived." });
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.waitForTimeout(6_000); // longer than its lifetime
  await expect(toast).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});
