import { test, expect } from "../support/fixtures";
import { seedInstance } from "../support/db";
import { signInButton } from "./helpers";

// The ONE spec that differs between AlEemaan and Octalve Edu: it pins the brand — the colours
// from app/brand.css and the words from lib/brand.ts — so a token or copy change can't slip
// through unnoticed, and so the two products can't quietly end up wearing each other's colours.

test.beforeAll(async () => {
  await seedInstance();
});

const GREEN = "rgb(42, 127, 79)"; //      #2A7F4F — filled buttons (4.94 : 1 with white; the artifact's #2E8B57 is 4.25 : 1)
const DEEP_GREEN = "rgb(11, 61, 36)"; //  #0b3d24 — the sign-in brand panel

const backgroundOf = (locator: import("@playwright/test").Locator) =>
  locator.evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("AlEemaan's brand", () => {
  test("the tab title carries the product name", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle("Sign in · AlEemaan");
  });

  test("the primary button is AlEemaan green — in the dark theme AND the light one — and never Octalve's indigo", async ({ page }) => {
    await page.goto("/login");
    expect(await backgroundOf(signInButton(page))).toBe(GREEN);

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await backgroundOf(signInButton(page))).toBe(GREEN);
    expect(await backgroundOf(signInButton(page))).not.toBe("rgb(79, 70, 229)");
  });

  test("desktop: the brand panel is deep green with the artifact's headline, blurb and three points", async ({ page, isMobile }) => {
    test.skip(isMobile, "the panel only exists from 1024 px up");
    await page.goto("/login");
    const panel = page.locator("aside");
    await expect(panel).toBeVisible();
    expect(await backgroundOf(panel)).toBe(DEEP_GREEN);
    await expect(panel).toContainText("One school, four branches, one login.");
    await expect(panel).toContainText("Secondary & Primary, English & Arabic — every branch's records in one place.");
    for (const point of [
      "Secondary & Primary, English & Arabic",
      "Branch-level academic terms",
      "One admin account, every branch",
    ]) {
      await expect(panel.getByText(point, { exact: true })).toBeVisible(); // the blurb starts with the same words
    }
  });

  test("phone: the panel gives way to a compact brand header (name and tagline) above the form", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the compact header is the phone layout");
    await page.goto("/login");
    await expect(page.locator("aside")).toBeHidden();
    const header = page.getByRole("main"); // the (hidden) panel repeats the name; this is the visible one
    await expect(header.getByText("AlEemaan", { exact: true })).toBeVisible();
    await expect(header.getByText("Secondary & Primary • English & Arabic")).toBeVisible();
  });
});
