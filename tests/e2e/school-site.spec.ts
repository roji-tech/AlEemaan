import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { seedInstance } from "../support/db";
import { SCHOOL_SITE_PAGES } from "@/lib/school-site/paths";

// The school's own website in a real browser (task 0080), on a desktop and on a phone: every page loads with no policy violation and no script error (the shared fixture fails on both), has one h1 and passes axe
// (WCAG 2.2 A/AA); no page scrolls sideways; and the parts that move work: the menu, the fee dialog, the curriculum tabs, the FAQ and the forms that write to WhatsApp.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function noSideways(page: Page, what: string) {
  const { scrollWidth, width } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: Math.ceil(Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth)),
  }));
  expect(scrollWidth, `horizontal overflow on ${what}`).toBeLessThanOrEqual(width);
}

for (const route of SCHOOL_SITE_PAGES) {
  test(`${route}: one h1, no axe violation, no sideways scroll`, async ({ page }) => {
    await page.goto(route, { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(/\S/);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}]: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      `axe on ${route}`,
    ).toEqual([]);
    await noSideways(page, route);
  });
}

test("the menu: on a phone its button opens and closes the links, Escape closes it; Sign in leads to the sign-in page", async ({
  page,
  isMobile,
}) => {
  // The sign-in page shows a parent's and a student's button only while some branch has that sign-in on (task 0109). The shared helper makes the seeded branches with both on, so this
  // test does not depend on what the spec before it left (the batch run of 2026-11-19 found one button here: the spec before had emptied the database, so no branch was open).
  await seedInstance();
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (isMobile) {
    const button = page.getByRole("button", { name: "Open the menu" });
    await expect(nav.getByRole("link", { name: "About Us" })).toBeHidden();
    await button.click();
    await expect(nav.getByRole("link", { name: "About Us" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(nav.getByRole("link", { name: "About Us" })).toBeHidden();
    await button.click();
  }
  await nav.getByRole("link", { name: "Sign in", exact: true }).click();
  // Not straight to a sign-in form: the page with a button for each kind of person (here the portals are off, so each goes to the one form).
  await expect(page).toHaveURL(/\/select-role$/);
  const buttons = page.getByRole("list", { name: "Sign-in portals" }).getByRole("link");
  await expect(buttons).toHaveCount(3);
  await buttons.first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("the links between the pages go to the right ones, and Portal is the application's own", async ({ page, isMobile }) => {
  await page.goto("/about");
  const open = async (name: string) => {
    if (isMobile) await page.getByRole("button", { name: "Open the menu" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true }).click();
  };
  await open("Academics");
  await expect(page).toHaveURL(/\/our-academics$/);
  await open("Portal");
  await expect(page).toHaveURL(/\/portal$/);
});

test("the curriculum tabs: Arabic shows its subjects and hides the western ones; an address with #arabic opens it", async ({ page }) => {
  await page.goto("/our-academics");
  await expect(page.getByRole("tab", { name: "Western Program" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Arabic Program" }).click();
  await expect(page.getByText("Arabic Grammar (Nahw & Sarf)")).toBeVisible();
  await expect(page.getByText("Further Mathematics")).toBeHidden();
  await page.goto("/our-academics#arabic");
  await expect(page.getByRole("tab", { name: "Arabic Program" })).toHaveAttribute("aria-selected", "true");
});

test("the fee dialog opens from Admissions, shows a table with a total and the payment account, switches bill and closes on Escape", async ({
  page,
}) => {
  await page.goto("/admissions#fees");
  await page.getByRole("button", { name: "View Full Fee Structure" }).click();
  const dialog = page.getByRole("dialog", { name: "Fee Structure" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("table")).toBeVisible();
  await expect(dialog.getByRole("rowheader", { name: "Total" })).toBeVisible();
  await expect(dialog.getByText("Payment Account")).toBeVisible();
  const first = await dialog.getByRole("heading", { level: 3 }).first().textContent();
  await dialog.getByRole("group", { name: "Category" }).getByRole("button").nth(1).click();
  await expect(dialog.getByRole("heading", { level: 3 }).first()).not.toHaveText(first ?? "");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the admission form: an empty form is refused in words and opens nothing; a filled one opens WhatsApp with the answers", async ({
  page,
  context,
}) => {
  await page.goto("/admissions");
  await page.getByRole("button", { name: "Send application on WhatsApp" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Please fill in" })).toBeVisible();
  await page.getByLabel("Student's Full Name *").fill("Test Pupil");
  await page.getByLabel("Date of Birth *").fill("2015-04-02");
  await page.getByLabel("Gender *").selectOption("female");
  await page.getByLabel("Applying For *").selectOption("JSS 1");
  await page.getByLabel("Parent/Guardian Name *").fill("Test Parent");
  await page.getByLabel("Phone Number *").fill("08000000000");
  await page.getByLabel("Home Address *").fill("1 Test Street, Ibadan");
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Send application on WhatsApp" }).click();
  const opened = await popup;
  // wa.me sends the visitor on to api.whatsapp.com, which writes the message with "+" for spaces.
  const sent = decodeURIComponent(opened.url()).replaceAll("+", " ");
  expect(sent).toMatch(/phone=2348153005393|wa\.me\/2348153005393/);
  for (const line of [
    "Admission application, Aleeman School",
    "Student's Full Name: Test Pupil",
    "Gender: Female",
    "Applying For: JSS 1",
    "Number of Children Applying: 1 Child",
    "Parent/Guardian Name: Test Parent",
  ])
    expect(sent).toContain(line);
});

test("a vacancy opens its requirements, and Apply writes the position into the WhatsApp message", async ({ page }) => {
  await page.goto("/vacancy");
  const role = page.getByRole("article").filter({ hasText: "English Language Teacher" }).first();
  await role.getByText("Details").click();
  await expect(role.getByText("Familiarity with WAEC English Language and Literature syllabi")).toBeVisible();
  const href = await role.getByRole("link", { name: /Apply on WhatsApp/ }).getAttribute("href");
  expect(decodeURIComponent(href ?? "")).toContain("position of English Language Teacher");
});

test("the contact page frames the map and the FAQ opens one answer at a time", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.locator('iframe[title^="Map showing"]')).toHaveAttribute("src", /maps\.google\.com\/maps/);
  const first = page.locator("details").first();
  const second = page.locator("details").nth(1);
  await first.getByRole("heading").click();
  await expect(first).toHaveAttribute("open", "");
  await second.getByRole("heading").click();
  await expect(second).toHaveAttribute("open", "");
  await expect(first).not.toHaveAttribute("open", "");
});

test("the old students page says the records are coming and shows no invented people", async ({ page }) => {
  await page.goto("/oldstudents");
  await expect(page.getByRole("heading", { name: "Alumni Records Coming Soon" })).toBeVisible();
  await expect(page.getByText("Ahmed Hassan")).toHaveCount(0);
});

// The row of links needs about 1,100 px; between a phone and that width it used to wrap and clip ("Sign in" on two lines, the logo's name cut off). Below 1,280 px the header is the logo and
// the menu button; from 1,280 px it is the full row, and at no width does a label wrap or the bar spill sideways.
for (const width of [360, 575, 700, 768, 900, 1024, 1100, 1279, 1280, 1440]) {
  test(`the header is never cramped at ${width} px: a menu button below 1,280, the full row on one line from it, nothing sideways`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    const menuButton = page.getByRole("button", { name: /the menu$/ });
    if (width < 1280) {
      await expect(menuButton).toBeVisible();
      await expect(nav.getByRole("link", { name: "About Us" })).toBeHidden();
    } else {
      await expect(menuButton).toBeHidden();
      const heights = await nav.getByRole("link").evaluateAll((links) => links.map((l) => Math.round(l.getBoundingClientRect().height)));
      const one = Math.min(...heights);
      expect(Math.max(...heights), "no label wraps onto a second line").toBeLessThanOrEqual(one + 2);
    }
    const logoName = await page
      .getByRole("link", { name: /Aleeman School/ })
      .first()
      .boundingBox();
    expect(logoName!.height, "the name beside the logo is on one line").toBeLessThan(70);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await context.close();
  });
}
