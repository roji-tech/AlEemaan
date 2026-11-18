import { test, expect } from "../support/fixtures";
import { Role, createUser, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// A click on a link shows a loading state at once instead of the old page until the new one is ready. The server's answer for the next page is held back for two seconds, so what the
// person sees in between is what is being tested. Desktop and phone.
test.beforeAll(async () => {
  await seedInstance();
});

test("a click on a link shows 'Loading the page' inside the shell while the next page is prepared, then the page", async ({
  page,
  isMobile,
}) => {
  const admin = await createUser({ role: Role.ADMIN });
  await signInThroughUi(page, admin);
  await expect(page.getByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();

  // Hold back only the page data of the NEXT navigation (a client-side navigation asks for it with `_rsc`).
  await page.route(/\/users\?.*_rsc=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  if (isMobile) await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("link", { name: "Users", exact: true }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Loading the page" })).toBeAttached();
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("status").filter({ hasText: "Loading the page" })).toHaveCount(0);
});
