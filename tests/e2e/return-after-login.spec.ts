import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { fillCredentials, signInButton } from "./helpers";

// Sent to sign in from a page (the session ended, or never was), you come back to THAT page after signing in, not the dashboard. The address is checked on the server: only a path
// inside the site is followed.
test.beforeAll(async () => {
  await seedInstance();
});

test("a signed-out visit to a page goes to sign-in and, after signing in, back to that page", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN });
  await page.goto("/users");
  await expect(page).toHaveURL(/\/login\?next=%2Fusers$/);
  await fillCredentials(page, admin.email, admin.password);
  await signInButton(page).click();
  await expect(page).toHaveURL(/\/users$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
});

test("the page's own query is kept", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN });
  await page.goto("/users?role=PARENT");
  await expect(page).toHaveURL(/\/login\?next=%2Fusers%3Frole%3DPARENT$/);
  await fillCredentials(page, admin.email, admin.password);
  await signInButton(page).click();
  await expect(page).toHaveURL(/\/users\?role=PARENT$/, { timeout: 15_000 });
});

test("a session that ended while you were on a page: the next page you open sends you to sign-in and back", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN });
  await page.goto("/login");
  await fillCredentials(page, admin.email, admin.password);
  await signInButton(page).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await db.session.deleteMany({ where: { userId: admin.id } }); // the session ends on the server (idle limit, signed out elsewhere)
  await page.goto("/branches");
  await expect(page).toHaveURL(/\/login\?next=%2Fbranches$/);
  await fillCredentials(page, admin.email, admin.password);
  await signInButton(page).click();
  await expect(page).toHaveURL(/\/branches$/, { timeout: 15_000 });
});

test("an address outside the site in the sign-in link is ignored: signing in goes to the dashboard", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN });
  for (const next of ["https://evil.example/x", "//evil.example", "/\\evil.example", "/api/v1/auth/me"]) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await fillCredentials(page, admin.email, admin.password);
    await signInButton(page).click();
    await expect(page, next).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    await page.context().clearCookies();
  }
});

test("already signed in and opening a sign-in link with a page: you go straight to that page", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN });
  await page.goto("/login");
  await fillCredentials(page, admin.email, admin.password);
  await signInButton(page).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await page.goto("/login?next=%2Fusers");
  await expect(page).toHaveURL(/\/users$/);
});
