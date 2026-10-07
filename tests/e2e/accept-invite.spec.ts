import { test, expect } from "../support/fixtures";
import type { Page } from "@playwright/test";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance, uniqueEmail } from "../support/db";
import { BREACH_URL } from "../support/env";
import { hashInvitationToken, newInvitationToken } from "@/lib/invitations/token";
import { fillCredentials, signInButton, signInThroughUi } from "./helpers";

// The page an invitation email opens, in a real browser, desktop and phone (domain-implementation-plan.md, "Build design — Users pages and
// invitations"). Served by the server that checks new passwords against the local breach-service stand-in. Links are made directly in
// the database so each test starts from a known token; the API specs cover the mailed round trip.
test.use({ baseURL: BREACH_URL });

const BREACHED = "Tr0ub4dor&3-but-leaked";
const STRONG = "a-fresh-unseen-passphrase-3";

let branches: { id: string; name: string }[];
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
  branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
});

async function linkFor(email: string, role: Role = Role.TEACHING_STAFF, opts: { expired?: boolean; branch?: number } = {}) {
  const token = newInvitationToken();
  await db.invitation.create({
    data: {
      email,
      role,
      branchId: branches[opts.branch ?? 0].id,
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(Date.now() + (opts.expired ? -60_000 : 3_600_000)),
    },
  });
  return { token, url: `/accept-invite#token=${token}` };
}
const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name });

test.describe("a person with no account", () => {
  test("sees the role, the branch and a masked address; the token leaves the address bar at once; they choose a name and password, join, sign in, and are in", async ({
    page,
  }) => {
    const to = uniqueEmail("newbie");
    const { url, token } = await linkFor(to, Role.TEACHING_STAFF, { branch: 1 });
    await page.goto(url);
    await expect(heading(page, "Join AlEemaan")).toBeVisible();
    await expect(page.getByText("Teaching staff")).toBeVisible();
    await expect(page.getByText(new RegExp(`at ${BRANCH_NAMES[1].replace(/[()]/g, "\\$&")}`))).toBeVisible();
    await expect(page.getByText(/This invitation is for n\*\*\*@/)).toBeVisible();
    await expect(page.getByText(to)).toHaveCount(0); // never in full
    expect(page.url()).not.toContain(token); // the secret is out of the address bar, history and screenshots
    expect(page.url()).not.toContain("#");
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

    await page.getByLabel("Your name").fill("  Nia   Newbie ");
    await page.getByLabel("Password", { exact: true }).fill(STRONG);
    await page.getByLabel("Confirm password").fill(STRONG);
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(heading(page, "You're in")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to sign in" })).toBeFocused();
    await page.getByRole("button", { name: "Continue to sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await fillCredentials(page, to, STRONG);
    await signInButton(page).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await db.user.findUniqueOrThrow({ where: { email: to } })).name).toBe("Nia Newbie");
    const membership = await db.membership.findFirstOrThrow({ where: { user: { email: to } } });
    expect(membership).toMatchObject({ role: "TEACHING_STAFF", branchId: branches[1].id, deactivatedAt: null });
  });

  test("mistakes are explained next to the field, before the link is spent: blank name, weak password, mismatch — and a password found in a breach, by the server", async ({
    page,
  }) => {
    const to = uniqueEmail("fixme");
    const { url } = await linkFor(to);
    await page.goto(url);
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Choose a password.")).toBeVisible();
    await page.getByLabel("Your name").fill("Fix Me");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Password", { exact: true }).fill(STRONG);
    await page.getByLabel("Confirm password").fill(STRONG + "x");
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(page.getByText("The two passwords don't match.")).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill(BREACHED);
    await page.getByLabel("Confirm password").fill(BREACHED);
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(page.getByText(/data breach/i)).toBeVisible(); // the server's reason, shown at the password
    expect(await db.user.count({ where: { email: to } })).toBe(0);
    expect((await db.invitation.findFirstOrThrow({ where: { email: to } })).acceptedAt).toBeNull(); // the link is still unspent

    await page.getByLabel("Password", { exact: true }).fill(STRONG);
    await page.getByLabel("Confirm password").fill(STRONG);
    await page.getByRole("button", { name: "Create account and join" }).click();
    await expect(heading(page, "You're in")).toBeVisible();
  });
});

test.describe("a person who already has an account", () => {
  test("signed out: they are asked to sign in first (nothing about the account is changed), and the sign-in link works", async ({
    page,
  }) => {
    const owner = await createUser({ name: "Olu Owner" });
    const { url } = await linkFor(owner.email, Role.PARENT);
    await page.goto(url);
    await expect(heading(page, "Sign in to join AlEemaan")).toBeVisible();
    await expect(page.getByText("An account already exists for this address.")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0); // no way to set a password for someone else's account
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await db.membership.count({ where: { userId: owner.id } })).toBe(0);
  });

  test("signed in as that account: one button, and they are in", async ({ page }) => {
    const owner = await createUser({ name: "Olu Owner" });
    await signInThroughUi(page, owner);
    const { url } = await linkFor(owner.email, Role.PARENT);
    await page.goto(url);
    await expect(heading(page, "Join AlEemaan")).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await page.getByRole("button", { name: "Join AlEemaan" }).click();
    await expect(heading(page, "You're in")).toBeVisible();
    await page.getByRole("button", { name: "Go to your dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("main").getByText("Parent").first()).toBeVisible();
  });

  test("signed in as SOMEONE ELSE: told so, with a way out — and nothing is joined", async ({ page }) => {
    const owner = await createUser();
    const other = await createUser();
    await signInThroughUi(page, other);
    const { url } = await linkFor(owner.email, Role.ADMIN);
    await page.goto(url);
    await expect(heading(page, "This invitation is for a different account")).toBeVisible();
    await expect(page.getByText("You're signed in as someone else.")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await db.membership.count({ where: { userId: { in: [owner.id, other.id] } } })).toBe(0);
  });
});

test.describe("links that cannot be used", () => {
  test("no token, a made-up token, an expired one and a used one all say the same thing and offer the way on", async ({ page }) => {
    const used = await linkFor(uniqueEmail("used"));
    await db.invitation.updateMany({ where: { tokenHash: hashInvitationToken(used.token) }, data: { acceptedAt: new Date() } });
    const expired = await linkFor(uniqueEmail("late"), Role.PARENT, { expired: true });
    for (const url of [
      "/accept-invite",
      `/accept-invite#token=${newInvitationToken()}`,
      "/accept-invite#token=short",
      expired.url,
      used.url,
    ]) {
      await page.goto(url);
      await expect(heading(page, "This link can't be used")).toBeVisible();
      await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
      await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    }
  });

  test("the dead-link wording differs only where it helps: an incomplete link says 'incomplete'", async ({ page }) => {
    await page.goto("/accept-invite");
    await expect(page.getByRole("alert").filter({ hasText: "incomplete" })).toBeVisible();
    await page.goto(`/accept-invite#token=${newInvitationToken()}`);
    await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
  });

  test("a second link opened in the SAME tab (only the fragment changes) replaces the first", async ({ page }) => {
    const first = await linkFor(uniqueEmail("one"));
    const second = await linkFor(uniqueEmail("two"));
    await page.goto(first.url);
    await expect(page.getByText(/This invitation is for o\*\*\*@/)).toBeVisible();
    await page.evaluate((hash) => void (window.location.hash = hash), `token=${second.token}`);
    await expect(page.getByText(/This invitation is for t\*\*\*@/)).toBeVisible();
  });
});
