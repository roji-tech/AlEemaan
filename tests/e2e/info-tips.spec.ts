import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";
import { INFO_TIPS, type InfoTipKey } from "@/components/ui/info-tips";

// The info icons (task 0054) in a real browser, on the real pages. What is held here: each icon sits BESIDE what it explains (never inside it), explains it in the registry's words,
// is 16px, moves nothing around it when it opens, and keeps its popover inside the window (a phone included); it opens on hover and on keyboard focus (desktop) or on a tap (phone);
// it closes on Escape (wherever the focus is), on a click elsewhere and when another opens; inside a dialog Escape closes the tip first; axe finds nothing with one open, in both themes.
// That the NAMES of the headings, labels and buttons beside an icon are unchanged is held by every other spec of the app, which finds them by those names and still passes.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeAll(async () => {
  await seedInstance();
});

const tipButton = (page: Page, key: InfoTipKey) => page.locator(`[data-info-tip="${key}"]`);
const tooltip = (page: Page) => page.getByRole("tooltip");

async function academics(page: Page, tab: string) {
  await page.goto("/academics");
  await expect(page.getByRole("heading", { level: 1, name: "Academics" })).toBeVisible();
  await page.getByRole("tab", { name: tab }).click();
}

type Place = { key: InfoTipKey; go: (page: Page) => Promise<void>; neighbour: (page: Page) => Locator };
const PLACES: Place[] = [
  {
    key: "academics.classes",
    go: (page) => academics(page, "Classes and subjects"),
    neighbour: (page) => page.getByRole("button", { name: "New class" }),
  },
  {
    key: "academics.subjects",
    go: (page) => academics(page, "Classes and subjects"),
    neighbour: (page) => page.getByRole("button", { name: "New subject" }),
  },
  {
    key: "academics.schemes",
    go: (page) => academics(page, "Assessment and grading"),
    neighbour: (page) => page.getByRole("button", { name: "New scheme" }),
  },
  {
    key: "academics.scales",
    go: (page) => academics(page, "Assessment and grading"),
    neighbour: (page) => page.getByRole("button", { name: "New grade scale" }),
  },
  {
    key: "students.show",
    go: async (page) => {
      await page.goto("/students");
      await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
    },
    neighbour: (page) => page.getByLabel("Show", { exact: true }),
  },
  {
    key: "attendance.window",
    go: async (page) => {
      await page.goto("/attendance");
      await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();
    },
    neighbour: (page) => page.locator("#attendance-date"),
  },
  {
    key: "communication.channel",
    go: async (page) => {
      await page.goto("/communication");
      await expect(page.getByRole("heading", { level: 1, name: "Communication" })).toBeVisible();
    },
    neighbour: (page) => page.locator("#broadcast-channel"),
  },
  {
    key: "communication.tags",
    go: async (page) => {
      await page.goto("/communication");
      await expect(page.getByRole("heading", { level: 1, name: "Communication" })).toBeVisible();
    },
    neighbour: (page) => page.getByRole("button", { name: "+ Student Name" }),
  },
  {
    key: "forms.marking",
    go: async (page) => {
      await page.goto("/forms");
      await page.getByRole("tab", { name: "Marking", exact: true }).click();
    },
    neighbour: (page) => page.getByLabel("Show", { exact: true }),
  },
  {
    key: "bank.reviewers",
    go: async (page) => {
      await page.goto("/question-bank");
      await page.getByRole("tab", { name: "Reviewers", exact: true }).click();
    },
    neighbour: (page) => page.getByRole("heading", { name: "Add a reviewer" }),
  },
  {
    key: "communication.status",
    go: async (page) => {
      await page.goto("/communication");
      await page.getByRole("tab", { name: "Message Logs & Dispatches" }).click();
    },
    neighbour: (page) => page.getByLabel("Filter by status"),
  },
];

async function signedInAdmin(page: Page) {
  const user = await createUser({ role: Role.ADMIN });
  await signInThroughUi(page, user);
}

/// How a person opens one: a mouse points at it (after the short delay), a finger taps it.
async function openIt(page: Page, icon: Locator, isMobile: boolean) {
  if (isMobile) await icon.tap();
  else await icon.hover();
  await expect(tooltip(page)).toBeVisible();
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "the element has a box").not.toBeNull();
  return b!;
}

for (const place of PLACES) {
  test(`the icon for ${place.key} sits beside what it explains, says what the registry says, and moves nothing`, async ({
    page,
    isMobile,
  }) => {
    await signedInAdmin(page);
    await place.go(page);
    const icon = tipButton(page, place.key);
    await expect(icon).toHaveCount(1);
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAccessibleName("More information");

    // beside, never inside, a heading, a label, a column heading or another button
    await expect(
      icon.locator("xpath=ancestor::*[self::h1 or self::h2 or self::h3 or self::label or self::th or self::button][1]"),
    ).toHaveCount(0);

    // Scrolled into view FIRST: an icon below the fold (the composer's tags) is scrolled to by the hover or the tap, and a neighbour's box in window coordinates would then differ by the
    // scroll, which is not a layout shift.
    // (to the centre of the window: on a phone "if needed" can leave it under the fixed bottom bar)
    await icon.evaluate((el) => el.scrollIntoView({ block: "center" }));

    // 16 px, with the invisible 24 px touch target around it (a pseudo-element: no box of its own to measure, so what is measured is the row it sits in)
    const size = await box(icon);
    expect(Math.round(size.width)).toBe(16);
    expect(Math.round(size.height)).toBe(16);

    const before = await box(place.neighbour(page));
    // The invisible touch area around the icon must not overlap the control beside it. The area is the icon's box grown by the pseudo-element's inset (read from the computed style, so this
    // follows the CSS), compared with the neighbour's box: an overlap is a part of the neighbour where a tap would reach the icon instead.
    const grown = await icon.evaluate((el) => {
      const after = getComputedStyle(el, "::after");
      const rect = el.getBoundingClientRect();
      const [top, right, bottom, left] = [after.top, after.right, after.bottom, after.left].map((value) => -parseFloat(value));
      return { x: rect.x - left, y: rect.y - top, width: rect.width + left + right, height: rect.height + top + bottom };
    });
    expect(Math.round(grown.width), "the touch area is 24 px wide").toBe(24);
    expect(Math.round(grown.height), "the touch area is 24 px high").toBe(24);
    const overlapX = Math.min(grown.x + grown.width, before.x + before.width) - Math.max(grown.x, before.x);
    const overlapY = Math.min(grown.y + grown.height, before.y + before.height) - Math.max(grown.y, before.y);
    expect(
      overlapX > 0.5 && overlapY > 0.5,
      `the icon's touch area overlaps the neighbouring control by ${Math.round(overlapX)} x ${Math.round(overlapY)} px`,
    ).toBe(false);
    // opening one must not make the page wider either (a phone widens the page to fit anything that sticks out, and the next clamp then reads the wrong edge)
    const scrollWidth = () => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    const widthBefore = await scrollWidth();
    const scrolledBefore = await page.evaluate(() => window.scrollY);
    await openIt(page, icon, isMobile);
    expect(await scrollWidth(), "the page is no wider with the tip open").toEqual(widthBefore);
    // ...and must not scroll the page: with the page scrolled to its end, an earlier first-pass placement made Chrome scroll up 227 px a few milliseconds after the click, so it is read after
    // two animation frames, not straight away
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    expect(await page.evaluate(() => window.scrollY), "opening the tip does not scroll the page").toBe(scrolledBefore);
    await expect(tooltip(page)).toHaveText(INFO_TIPS[place.key]);
    await expect(icon).toHaveAttribute("aria-expanded", "true");
    const tipId = await tooltip(page).getAttribute("id");
    await expect(icon).toHaveAttribute("aria-describedby", tipId!);

    // the popover is inside the window, and nothing near it moved
    const view = page.viewportSize()!;
    const pop = await box(tooltip(page));
    expect(pop.x).toBeGreaterThanOrEqual(0);
    expect(pop.y).toBeGreaterThanOrEqual(0);
    expect(pop.x + pop.width).toBeLessThanOrEqual(view.width);
    expect(pop.y + pop.height).toBeLessThanOrEqual(view.height);
    const after = await box(place.neighbour(page));
    expect(after).toEqual(before);

    await page.keyboard.press("Escape");
    await expect(tooltip(page)).toHaveCount(0);
    await expect(icon).toHaveAttribute("aria-expanded", "false");
  });
}

test("desktop: it opens when the mouse points at it and closes when the mouse leaves", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone has no hover");
  await signedInAdmin(page);
  await academics(page, "Classes and subjects");
  const icon = tipButton(page, "academics.classes");
  await expect(tooltip(page)).toHaveCount(0);
  await icon.hover();
  await expect(tooltip(page)).toBeVisible();
  // it stays open while the mouse moves from the icon onto the explanation
  await tooltip(page).hover();
  await expect(tooltip(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip(page)).toHaveCount(0);
});

test("desktop: it opens when the keyboard reaches it, Escape closes it with the focus where it was, and a click elsewhere closes it too", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the keyboard path is the desktop one");
  await signedInAdmin(page);
  await academics(page, "Classes and subjects");
  const icon = tipButton(page, "academics.classes");
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    if (await icon.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(icon).toBeFocused();
  await expect(tooltip(page)).toBeVisible();
  await expect(tooltip(page)).toHaveText(INFO_TIPS["academics.classes"]);
  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toHaveCount(0);
  await expect(icon).toBeFocused();

  // Enter or Space on the icon opens it again; a click on the page closes it
  await page.keyboard.press("Enter");
  await expect(tooltip(page)).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Academics" }).click();
  await expect(tooltip(page)).toHaveCount(0);
});

test("desktop: Escape closes a tip that was opened by the mouse, with the mouse still on it", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone has no hover");
  await signedInAdmin(page);
  await academics(page, "Classes and subjects");
  await tipButton(page, "academics.subjects").hover();
  await expect(tooltip(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toHaveCount(0);
});

test("only one is open at a time", async ({ page, isMobile }) => {
  await signedInAdmin(page);
  await academics(page, "Classes and subjects");
  await openIt(page, tipButton(page, "academics.classes"), isMobile);
  await expect(tooltip(page)).toHaveText(INFO_TIPS["academics.classes"]);
  await openIt(page, tipButton(page, "academics.subjects"), isMobile);
  await expect(tooltip(page)).toHaveCount(1);
  await expect(tooltip(page)).toHaveText(INFO_TIPS["academics.subjects"]);
});

test("phone: a tap opens it, a second tap closes it, and a tap elsewhere closes it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a tap is the phone path");
  await signedInAdmin(page);
  await academics(page, "Classes and subjects");
  const icon = tipButton(page, "academics.classes");
  await icon.tap();
  await expect(tooltip(page)).toBeVisible();
  await icon.tap();
  await expect(tooltip(page)).toHaveCount(0);
  await icon.tap();
  await expect(tooltip(page)).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Academics" }).tap();
  await expect(tooltip(page)).toHaveCount(0);
});

test("in a dialog, Escape closes the tip first and the dialog only the next time", async ({ page, isMobile }) => {
  await signedInAdmin(page);
  await academics(page, "Assessment and grading");
  await page.getByRole("button", { name: "New scheme" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const icon = tipButton(page, "scheme.applies");
  await expect(icon).toBeVisible();
  await openIt(page, icon, isMobile);
  await expect(tooltip(page)).toHaveText(INFO_TIPS["scheme.applies"]);
  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

for (const theme of ["dark", "light"] as const) {
  test(`axe finds nothing on a page with a tip open (${theme} theme)`, async ({ page, baseURL, isMobile }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    await signedInAdmin(page);
    await academics(page, "Classes and subjects");
    await openIt(page, tipButton(page, "academics.classes"), isMobile);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
      `accessibility violations with a tip open (${theme})`,
    ).toEqual([]);
  });
}
