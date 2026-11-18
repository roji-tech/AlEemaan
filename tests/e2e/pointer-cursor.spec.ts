import { test, expect } from "../support/fixtures";

// The real thing the unit spec only reads: in a browser, a button shows the pointer. The sign-in page needs no account.
test("on the sign-in page a button and a link show the pointer", async ({ page }) => {
  await page.goto("/login");
  const cursor = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).cursor);
  expect(await cursor("button[type=submit]")).toBe("pointer");
  expect(await cursor("a[href]")).toBe("pointer");
});
