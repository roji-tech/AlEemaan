import type { Page, Route } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Saving a bulk file in batches, in the background (task 0095). The save used to be one request and one transaction: 144 pupils ran past the database transaction's 60 seconds in production
// (P2028, 2026-11-18) and nothing was saved. Now it goes 20 rows at a time, each batch its own request, with progress; a refused batch stops it with the earlier rows saved and the later ones still on
// screen; and "Keep working" lets it carry on in the app shell while the dialog is closed.
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const dialog = (page: Page) => page.getByRole("dialog").first();
const IMPORT = "**/api/v1/academics/subjects/import";
const csv = (n: number) =>
  "Subject,Code\n" + Array.from({ length: n }, (_, i) => `Subject ${String(i + 1).padStart(2, "0")},`).join("\n") + "\n";
const isSave = (route: Route) => JSON.parse(route.request().postData() ?? "{}").dryRun === false;

async function loaded(page: Page, n: number) {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/academics");
  await page.getByRole("tab", { name: "Subjects", exact: true }).click();
  await page.getByRole("button", { name: "Add many" }).click();
  await dialog(page)
    .getByLabel("CSV or Excel file")
    .setInputFiles({ name: "subjects.csv", mimeType: "text/csv", buffer: Buffer.from(csv(n)) });
  await expect(
    dialog(page)
      .getByRole("status")
      .filter({ hasText: /rows?:/ }),
  ).toContainText(`${n} rows: ${n} ready, 0 with problems`);
  return admin;
}

test("45 rows are saved as three requests of 20, 20 and 5, and the dialog closes when they are all in", async ({ page }) => {
  await loaded(page, 45);
  const sizes: number[] = [];
  await page.route(IMPORT, async (route) => {
    if (isSave(route)) sizes.push(JSON.parse(route.request().postData()!).rows.length);
    await route.continue();
  });
  await dialog(page).getByRole("button", { name: "Save all 45 rows" }).click();
  await expect(page.getByText("45 subjects added.")).toBeVisible();
  await expect(dialog(page)).toBeHidden();
  expect(sizes).toEqual([20, 20, 5]);
  expect(await db.subject.count()).toBe(45);
});

test("a refused batch stops the save: the first batch stays saved, the rest stay on screen and can be saved again", async ({ page }) => {
  await loaded(page, 45);
  let saves = 0;
  await page.route(IMPORT, async (route) => {
    if (!isSave(route)) return route.continue();
    saves++;
    if (saves === 2)
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ data: null, meta: {}, error: { code: "INTERNAL", message: "Something went wrong. Nothing was changed." } }),
      });
    return route.continue();
  });
  await dialog(page).getByRole("button", { name: "Save all 45 rows" }).click();
  await expect(dialog(page)).toContainText("20 of 45 saved.");
  expect(await db.subject.count()).toBe(20); // the batch before the refusal is in
  await expect(
    dialog(page)
      .getByRole("status")
      .filter({ hasText: /rows?:/ }),
  ).toContainText("25 rows: 25 ready, 0 with problems"); // only what is not saved is left

  await page.unroute(IMPORT);
  await dialog(page).getByRole("button", { name: "Save all 25 rows" }).click();
  await expect(page.getByText("25 subjects added.")).toBeVisible();
  expect(await db.subject.count()).toBe(45);
});

test("Keep working: the dialog closes, the save carries on in the corner of the screen, and finishes", async ({ page }) => {
  await loaded(page, 45);
  await page.route(IMPORT, async (route) => {
    if (isSave(route)) await new Promise((r) => setTimeout(r, 700)); // slow enough to be seen
    await route.continue();
  });
  await dialog(page).getByRole("button", { name: "Save all 45 rows" }).click();
  await expect(dialog(page).getByText(/Saving \d+ of 45/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Keep working" }).click();
  await expect(dialog(page)).toBeHidden();
  const tray = page.getByRole("region", { name: "Saving in the background" });
  await expect(tray).toContainText("Adding 45 subjects");
  await expect(tray.getByRole("progressbar")).toBeVisible();
  await expect(tray.getByText("All 45 saved.")).toBeVisible();
  await expect(page.getByText("45 subjects added.")).toBeVisible();
  expect(await db.subject.count()).toBe(45);
});

test("Stop after this batch leaves the rest unsaved and downloadable", async ({ page }) => {
  await loaded(page, 45);
  await page.route(IMPORT, async (route) => {
    if (isSave(route)) await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await dialog(page).getByRole("button", { name: "Save all 45 rows" }).click();
  await dialog(page).getByRole("button", { name: "Keep working" }).click();
  const tray = page.getByRole("region", { name: "Saving in the background" });
  await tray.getByRole("button", { name: "Stop after this batch" }).click();
  await expect(tray).toContainText(/Stopped by you after \d+ of 45/);
  const saved = await db.subject.count();
  expect(saved).toBeGreaterThan(0);
  expect(saved).toBeLessThan(45);
  await expect(tray.getByRole("button", { name: /Download the \d+ not saved/ })).toBeVisible();
});
