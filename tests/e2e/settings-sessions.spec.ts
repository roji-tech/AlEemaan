import { test, expect } from "../support/fixtures";
import { Role, createUser, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Settings, Academic Sessions & Terms: a session made on the page is drawn at once the way one read from the database is drawn (found by the walkthrough, task 0033). The create call
// answers with the session row (ISO timestamps, the branch nested), the list is drawn from the page's own shape (the branch's name in a badge, plain yyyy-mm-dd dates); the new card used
// to show an empty badge and "2030-09-02T00:00:00.000Z" until the page was reloaded.

test.beforeAll(async () => {
  await seedInstance();
});

test("a new session's card has its branch badge and plain dates at once, and the same after a reload", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN });
  await signInThroughUi(page, admin);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Academic Sessions & Terms" }).click();

  const label = `Card ${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "New Academic Session" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Academic Session" });
  await dialog.getByLabel("Branch").selectOption({ label: "Primary (English)" });
  await dialog.getByLabel("Session Label (e.g. 2026/2027)").fill(label);
  await dialog.getByLabel("Session Start Date").fill("2030-09-02");
  await dialog.getByLabel("Session End Date").fill("2031-07-18");
  await dialog.getByRole("button", { name: "Create Session" }).click();

  // the heading's parent holds the badge, the label and the dates
  const head = () => page.getByRole("heading", { level: 3, name: label }).locator("..");
  await expect(head()).toBeVisible();
  await expect(head().locator("span").first()).toHaveText("Primary (English)");
  await expect(head()).toContainText("2030-09-02 → 2031-07-18");
  await expect(head()).not.toContainText("T00:00:00");

  // read back from the database, the card is the same
  await page.reload();
  await page.getByRole("button", { name: "Academic Sessions & Terms" }).click();
  await expect(head().locator("span").first()).toHaveText("Primary (English)");
  await expect(head()).toContainText("2030-09-02 → 2031-07-18");
});
