import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { BRANCH_NAMES, Role, createUser, db, seedInstance } from "../support/db";
import { memberLabel } from "@/lib/branches/labels";
import { signInThroughUi } from "./helpers";

// The Branches page: the list with real member counts, and "New branch" wired to the existing
// POST /api/v1/branches. Every outcome of that call has its own honest message; each is driven here,
// including the ones that are hard to cause for real (server error, offline, refused) via routing.

test.beforeAll(async () => {
  await seedInstance();
});

const newBranchButton = (page: Page) => page.getByRole("button", { name: "New branch" });
const nameField = (page: Page) => page.getByLabel("Branch name");
const createButton = (page: Page) => page.getByRole("button", { name: "Create", exact: true });
const rows = (page: Page) => page.getByRole("list", { name: "Branches" }).getByRole("listitem");
const rowFor = (page: Page, name: string) => rows(page).filter({ hasText: name });
const POST_URL = "**/api/v1/branches";

let sequence = 0;
const uniqueName = (label = "Test branch") => `${label} ${Date.now().toString(36)}-${++sequence}`;

async function openBranches(page: Page) {
  const admin = await createUser({ role: Role.ADMIN });
  await signInThroughUi(page, admin);
  await page.goto("/branches");
  await expect(page.getByRole("heading", { level: 1, name: "Branches" })).toBeVisible();
  return admin;
}

const postsTo = (page: Page) => {
  const seen: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/api/v1/branches")) seen.push(req.url());
  });
  return seen;
};

test.describe("the list", () => {
  test("shows every branch with its real member count", async ({ page }) => {
    await openBranches(page);
    const branches = await db.branch.findMany({ include: { _count: { select: { memberships: true } } } });
    expect(branches.length).toBeGreaterThanOrEqual(BRANCH_NAMES.length);
    for (const name of BRANCH_NAMES) {
      const expected = branches.find((b) => b.name === name)!._count.memberships;
      await expect(rowFor(page, name)).toContainText(memberLabel(expected));
    }
  });

  test("member counts read naturally — none, one, several — and follow the database", async ({ page }) => {
    await openBranches(page);
    const name = uniqueName("Counts");
    const branch = await db.branch.create({ data: { name } });

    await page.reload();
    await expect(rowFor(page, name)).toContainText("No members yet");

    const first = await createUser();
    await db.membership.create({ data: { userId: first.id, branchId: branch.id, role: Role.STUDENT } });
    await page.reload();
    await expect(rowFor(page, name)).toContainText("1 member");
    await expect(rowFor(page, name)).not.toContainText("1 members");

    const second = await createUser();
    await db.membership.create({ data: { userId: second.id, branchId: branch.id, role: Role.PARENT } });
    await page.reload();
    await expect(rowFor(page, name)).toContainText("2 members");
  });
});

test.describe("creating a branch", () => {
  test("the whole happy path: open → type → Create → announced, listed, focus back on the button, audited", async ({ page }) => {
    const admin = await openBranches(page);
    const name = uniqueName("Happy");

    await expect(newBranchButton(page)).toHaveAttribute("aria-expanded", "false");
    await newBranchButton(page).click();
    await expect(newBranchButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(nameField(page)).toBeFocused();

    await nameField(page).fill(name);
    await createButton(page).click();

    await expect(page.getByRole("status")).toContainText(`“${name}” was created.`);
    await expect(rowFor(page, name)).toContainText("No members yet");
    await expect(nameField(page)).toHaveCount(0); // the form closed
    await expect(newBranchButton(page)).toBeFocused();
    await expect(newBranchButton(page)).toHaveAttribute("aria-expanded", "false");

    const saved = await db.branch.findUniqueOrThrow({ where: { name } });
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "BRANCH_CREATED", targetId: saved.id } });
    expect(audit.actorUserId).toBe(admin.id);
    expect(audit.afterValue).toEqual({ name });
  });

  test("the Overview's branch count follows", async ({ page }) => {
    await openBranches(page);
    await newBranchButton(page).click();
    await nameField(page).fill(uniqueName("Counted"));
    await createButton(page).click();
    await expect(page.getByRole("status")).toContainText("was created");

    await page.goto("/dashboard");
    const total = await db.branch.count();
    const tile = page.getByRole("region", { name: "Totals" }).getByRole("listitem").filter({ hasText: "Branches" });
    await expect(tile).toHaveText(new RegExp(`^Branches\\s*${total}$`));
  });

  test("the name is trimmed", async ({ page }) => {
    await openBranches(page);
    const name = uniqueName("Trim");
    await newBranchButton(page).click();
    await nameField(page).fill(`   ${name}   `);
    await createButton(page).click();
    await expect(page.getByRole("status")).toContainText(`“${name}” was created.`);
    expect(await db.branch.count({ where: { name } })).toBe(1);
  });

  test("empty and blank names are caught locally: inline error, focus in the field, NOTHING sent", async ({ page }) => {
    await openBranches(page);
    const posts = postsTo(page);
    await newBranchButton(page).click();

    for (const blank of ["", "    "]) {
      await nameField(page).fill(blank);
      await createButton(page).click();
      await expect(page.getByText("Enter a branch name.")).toBeVisible();
      await expect(nameField(page)).toBeFocused();
      await expect(nameField(page)).toHaveAttribute("aria-invalid", "true");
      const describedBy = await nameField(page).getAttribute("aria-describedby");
      await expect(page.locator(`#${describedBy}`)).toHaveText("Enter a branch name."); // tied to the field
    }
    expect(posts).toHaveLength(0);

    await nameField(page).fill("x");
    await expect(page.getByText("Enter a branch name.")).toBeHidden(); // clears as they fix it
  });

  test("a duplicate name is refused clearly; the form stays open with what they typed", async ({ page }) => {
    await openBranches(page);
    const name = uniqueName("Dupe");
    await db.branch.create({ data: { name } });

    await newBranchButton(page).click();
    await nameField(page).fill(name);
    await createButton(page).click();

    await expect(page.getByText("A branch with this name already exists.")).toBeVisible();
    await expect(nameField(page)).toBeFocused();
    await expect(nameField(page)).toHaveValue(name);
    await expect(nameField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(createButton(page)).toBeEnabled();
    expect(await db.branch.count({ where: { name } })).toBe(1);
  });

  test("Cancel closes the form, returns focus to the button, creates nothing, and forgets the draft", async ({ page }) => {
    await openBranches(page);
    const before = await db.branch.count();
    const name = uniqueName("Cancelled");

    await newBranchButton(page).click();
    await nameField(page).fill(name);
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(nameField(page)).toHaveCount(0);
    await expect(newBranchButton(page)).toBeFocused();
    expect(await db.branch.count()).toBe(before);

    await newBranchButton(page).click();
    await expect(nameField(page)).toHaveValue(""); // not the old draft
  });

  test("names are limited to 100 characters as they type", async ({ page }) => {
    await openBranches(page);
    await newBranchButton(page).click();
    await nameField(page).pressSequentially("x".repeat(120));
    expect((await nameField(page).inputValue()).length).toBe(100);
  });

  test("a double-click creates ONE branch (the button is disabled while the request is in flight)", async ({ page }) => {
    await openBranches(page);
    const name = uniqueName("Twice");
    await page.route(POST_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400)); // keep it in flight
      await route.continue();
    });
    const posts = postsTo(page);

    await newBranchButton(page).click();
    await nameField(page).fill(name);
    await createButton(page).dblclick();
    await expect(page.getByRole("status")).toContainText("was created");
    expect(posts).toHaveLength(1);
    expect(await db.branch.count({ where: { name } })).toBe(1);
  });
});

test.describe("when creating fails", () => {
  const envelope = (status: number, code: string, message: string) => ({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data: null, meta: {}, error: { code, message } }),
  });

  test("a server error is reported plainly; the form stays open, the name is kept, and a retry works", async ({ page }) => {
    await openBranches(page);
    const name = uniqueName("Retry");
    await page.route(POST_URL, (route) => route.fulfill(envelope(500, "INTERNAL", "boom")));

    await newBranchButton(page).click();
    await nameField(page).fill(name);
    await createButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: "We couldn't create the branch. Please try again in a moment." })).toBeVisible();
    await expect(page.getByText("boom")).toHaveCount(0); // no server internals leak into the UI
    await expect(nameField(page)).toHaveValue(name);
    await expect(createButton(page)).toBeEnabled();
    expect(await db.branch.count({ where: { name } })).toBe(0);

    await page.unroute(POST_URL);
    await createButton(page).click();
    await expect(page.getByRole("status")).toContainText(`“${name}” was created.`);
  });

  test("offline: says it can't reach the server", async ({ page }) => {
    await openBranches(page);
    await page.route(POST_URL, (route) => route.abort("connectionrefused"));
    await newBranchButton(page).click();
    await nameField(page).fill(uniqueName("Offline"));
    await createButton(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "Can't reach the server" })).toBeVisible();
    await expect(createButton(page)).toBeEnabled();
  });

  test("refused (403): says so, without pretending it worked", async ({ page }) => {
    await openBranches(page);
    await page.route(POST_URL, (route) => route.fulfill(envelope(403, "FORBIDDEN", "Forbidden")));
    await newBranchButton(page).click();
    await nameField(page).fill(uniqueName("Refused"));
    await createButton(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "You don't have permission to create branches." })).toBeVisible();
  });

  test("the session ended while the form was open (a real 401): they are taken to sign in", async ({ page }) => {
    const admin = await openBranches(page);
    await newBranchButton(page).click();
    await nameField(page).fill(uniqueName("Expired"));
    await db.session.deleteMany({ where: { userId: admin.id } });

    await createButton(page).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a rejected name from the API (400) is shown against the field", async ({ page }) => {
    await openBranches(page);
    await page.route(POST_URL, (route) => route.fulfill(envelope(400, "VALIDATION", "Branch name is required")));
    await newBranchButton(page).click();
    await nameField(page).fill("something");
    await createButton(page).click();
    await expect(page.getByText("Branch name is required")).toBeVisible();
    await expect(nameField(page)).toBeFocused();
  });
});
