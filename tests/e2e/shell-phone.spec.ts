import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";
import fs from "node:fs";
import path from "node:path";

const SHOTS = path.resolve(__dirname, "../../out/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

// The phone shell, as the maintainer saw it on screenshots: the green tools button must not sit on "More" at any width where the bottom bar is shown (it did from 640 px), the More
// sheet is at most 80% of the screen and its sections fold, a role with few pages still has a bottom bar worth using, and the guide's header does not overlap itself.
test.beforeAll(async () => {
  await seedInstance();
});

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const moreButton = (page: Page) => mainNav(page).getByRole("button", { name: "More" });
const toolsButton = (page: Page) => page.getByRole("button", { name: /^Open Quick Tools/ });
type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  expect(box, "element is on the page").not.toBeNull();
  return box!;
};
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("the tools button does not cover More at any width where the bottom bar shows", async ({ page }) => {
  await signInThroughUi(page, await createUser({ role: Role.ADMIN }));
  for (const width of [360, 412, 575, 640, 700, 768, 900, 1023]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/dashboard");
    await expect(moreButton(page)).toBeVisible();
    await expect(toolsButton(page)).toBeVisible();
    expect(overlap(await boxOf(toolsButton(page)), await boxOf(moreButton(page))), `at ${width}px`).toBe(false);
    for (const link of await mainNav(page).getByRole("link").all()) {
      expect(overlap(await boxOf(toolsButton(page)), await boxOf(link)), `a tab, at ${width}px`).toBe(false);
    }
  }
});

test("the More sheet is at most 80% of the screen, scrolls inside, and each section folds and opens", async ({ page }) => {
  await signInThroughUi(page, await createUser({ role: Role.ADMIN }));
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/dashboard");
  await moreButton(page).click();
  const sheet = page.getByRole("dialog").locator("> div").first();
  await expect(sheet).toBeVisible();
  expect((await boxOf(sheet)).height).toBeLessThanOrEqual(600 * 0.8 + 1);
  expect(await sheet.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");

  const sections = page.getByRole("dialog").getByRole("button", { expanded: true });
  expect(await sections.count(), "sections that can fold").toBeGreaterThan(0);
  const first = sections.first();
  const target = await first.getAttribute("aria-controls"); // read before the click: `first` is a live locator and points at the next open section once this one folds
  expect(target).toMatch(/^more-section-/);
  const section = page.locator(`button[aria-controls="${target}"]`);
  await section.click();
  await expect(section).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(`#${target}`)).toBeHidden();
  await section.click();
  await expect(section).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`#${target}`)).toBeVisible();
});

test("a role with few pages of its own still gets a bottom bar of more than Overview, and More keeps Profile and Sign out", async ({
  page,
}) => {
  await signInThroughUi(page, await createUser({ role: Role.NON_TEACHING_STAFF }));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/dashboard");
  const links = mainNav(page).getByRole("link");
  expect(await links.count()).toBeGreaterThan(1);
  await moreButton(page).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Sign out" })).toBeVisible();
});

test('the video guide\'s header does not overlap itself, keeps "Back to App" on one line, and the page does not scroll sideways, from 320 to 700 px', async ({
  page,
}) => {
  await signInThroughUi(page, await createUser({ role: Role.ADMIN })); // the guide is a superadmin's
  for (const width of [320, 360, 395, 575, 700]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/video-guide");
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
    const parts = [
      header.getByRole("link", { name: "Back to App" }),
      header.getByRole("heading", { level: 1 }),
      header.getByRole("link", { name: "Download PDF" }),
      header.getByRole("link", { name: "Download Video" }),
    ];
    const boxes = [];
    for (const part of parts) boxes.push(await boxOf(part));
    // "Back to App" is one line (a line of this text is about 20 px high; three lines was the fault).
    expect(boxes[0].height, `"Back to App" on one line at ${width}px`).toBeLessThan(32);
    await page.screenshot({ path: `${SHOTS}/video-guide-header-${width}.png`, clip: { x: 0, y: 0, width, height: 260 } });
    for (let i = 0; i < boxes.length; i += 1) {
      expect(boxes[i].x + boxes[i].width, `part ${i} inside the screen at ${width}px`).toBeLessThanOrEqual(width + 1);
      for (let j = i + 1; j < boxes.length; j += 1) expect(overlap(boxes[i], boxes[j]), `parts ${i} and ${j} at ${width}px`).toBe(false);
    }
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll, `${width}px`).toBeLessThanOrEqual(client);
  }
});

test("the video guide is a superadmin's: signed out goes to sign-in; a branch administrator and a teacher are told so and are not offered the link", async ({
  page,
}) => {
  await page.goto("/video-guide");
  await expect(page).toHaveURL(/\/login/);
  for (const who of [{ role: Role.ADMIN, superAdmin: false }, { role: Role.TEACHING_STAFF }]) {
    await page.context().clearCookies();
    await signInThroughUi(page, await createUser(who));
    await page.goto("/video-guide");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "AlEemaan End-to-End Walkthrough & Tour" })).toHaveCount(0);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /^Account menu for/ }).click();
    await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Video guide" })).toHaveCount(0);
  }
});
