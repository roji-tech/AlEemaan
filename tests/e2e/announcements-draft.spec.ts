import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";
import type { Page } from "@playwright/test";

// Task 0057: two things in the announcement composer, both found by the product walkthrough and both untested until now. (1) "Save as Draft" published the announcement: the button set the
// status in React state and saved in the same click, so the request still carried the status of the render before (PUBLISHED). (2) The composer is mounted once and its fields start from
// `useState(initialAnnouncement?.x ?? "")`, which runs only on the first render, so "Edit" opened the form with whatever it held before (blank, or the last thing typed), not the
// announcement. These run in a real browser against the real database and read the STORED status, not the screen alone.

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const TITLE = "Sports day";

async function signedInAdmin(page: Page) {
  const admin = await createUser({ role: Role.ADMIN, name: "Admin User", superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/announcements");
  await expect(page.getByRole("heading", { level: 1, name: "Announcements & Broadcasts" })).toBeVisible();
}

async function compose(page: Page) {
  await page.getByRole("button", { name: /Post Announcement/ }).click();
  const dialog = page.getByRole("dialog", { name: "Create New Broadcast Announcement" });
  await dialog.getByLabel("Title *").fill(TITLE);
  await dialog.getByLabel("Announcement Message Body *").fill("Sports day is on Friday.");
  return dialog;
}

async function edit(page: Page) {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  return page.getByRole("dialog", { name: "Edit Broadcast Announcement" });
}

const storedStatus = async () => (await db.announcement.findFirstOrThrow({ where: { title: TITLE } })).status;
const card = (page: Page) =>
  page
    .locator("div")
    .filter({ has: page.getByRole("heading", { level: 3, name: TITLE }) })
    .filter({ has: page.getByRole("button", { name: "Edit", exact: true }) })
    .last();

test("a new announcement saved as a draft is stored as a draft and marked Draft", async ({ page }) => {
  await signedInAdmin(page);
  const dialog = await compose(page);
  await dialog.getByRole("button", { name: "Save as Draft", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page)).toContainText("Draft");
  expect(await storedStatus()).toBe("DRAFT");
});

test("a published announcement saved as a draft becomes a draft, and a draft published becomes published", async ({ page }) => {
  await signedInAdmin(page);
  const dialog = await compose(page);
  await dialog.getByRole("button", { name: "Publish Broadcast", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page)).not.toContainText("Draft");
  expect(await storedStatus()).toBe("PUBLISHED");

  // published, then edited and saved as a draft: it must stop being published
  const editing = await edit(page);
  await editing.getByRole("button", { name: "Save as Draft", exact: true }).click();
  await expect(editing).toBeHidden();
  await expect(card(page)).toContainText("Draft");
  expect(await storedStatus()).toBe("DRAFT");

  // and a draft, edited and published, is published again (the path that always worked, kept working)
  const publishing = await edit(page);
  await publishing.getByRole("button", { name: "Publish Broadcast", exact: true }).click();
  await expect(publishing).toBeHidden();
  await expect(card(page)).not.toContainText("Draft");
  expect(await storedStatus()).toBe("PUBLISHED");
});

test("editing an announcement opens it with its own title and message, not what the form held before", async ({ page }) => {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Admin User", superAdmin: false });
  await db.announcement.create({
    data: { branchId: branch.id, title: "Welcome to New Term", body: "Classes resume on Monday.", authorUserId: admin.id, isPinned: true },
  });
  await signInThroughUi(page, admin);
  await page.goto("/announcements");
  await expect(page.getByText("Welcome to New Term")).toBeVisible();
  const editing = await edit(page);
  await expect(editing.getByLabel("Title *")).toHaveValue("Welcome to New Term");
  await expect(editing.getByLabel("Announcement Message Body *")).toHaveValue("Classes resume on Monday.");
  await expect(editing.getByLabel("Pin to Top of Feed")).toBeChecked();

  // and a new one opened afterwards starts blank, not with the announcement that was just edited
  await editing.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: /Post Announcement/ }).click();
  const fresh = page.getByRole("dialog", { name: "Create New Broadcast Announcement" });
  await expect(fresh.getByLabel("Title *")).toHaveValue("");
  await expect(fresh.getByLabel("Announcement Message Body *")).toHaveValue("");
});
