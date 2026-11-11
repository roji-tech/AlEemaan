import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, seedInstance } from "../support/db";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";
import { brand } from "@/lib/brand";
import { labelsAr, landingAr, nameAr } from "@/lib/landing-ar";

// The landing page in Arabic (task 0050) in a real browser, on the desktop and on a phone: right to left and mirrored, in the Arabic font, readable by a screen reader (language and direction on the
// page's own element), the link between the two languages both ways, no script needed, a signed-in person never sees it. Axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes, also at
// 320 px wide and with larger text.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      `accessibility violations on ${what} [${theme} theme]`,
    ).toEqual([]);
    // Against the VISUAL viewport: a phone widens its layout viewport to fit an overflowing page, so `innerWidth` would grow with the overflow and the check could never fail.
    const { scrollWidth, width } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: Math.ceil(Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth)),
    }));
    expect(scrollWidth, `horizontal overflow on ${what} [${theme} theme]`).toBeLessThanOrEqual(width);
  }
  await setTheme(page, initial);
}

const headings = (page: Page, level: number) => page.getByRole("heading", { level }).allInnerTexts();
const extra = landingAr.links[0];
const box = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!;

test.beforeAll(async () => {
  await seedInstance();
});

test.describe("what a signed-out visitor sees at /ar", () => {
  test("a page with its own Arabic title, one h1, the headings in order, the landmarks, and the school's name and rights in Arabic", async ({
    page,
  }) => {
    const response = await page.goto("/ar");
    expect(response!.status()).toBe(200);
    await expect(page).toHaveTitle(landingAr.title);
    expect(await headings(page, 1)).toEqual([landingAr.headline]);
    expect(await headings(page, 2)).toEqual([landingAr.coversHeading, landingAr.peopleHeading, landingAr.closingHeading]);
    expect(await headings(page, 3)).toEqual([...landingAr.covers.map((c) => c.title), ...landingAr.people.map((p) => p.who)]);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("banner")).toContainText(nameAr);
    await expect(page.getByRole("main")).toContainText(landingAr.lead);
    await expect(page.getByRole("contentinfo")).toContainText(labelsAr.rights(new Date().getFullYear(), nameAr));
    // None of the English page's words is on it.
    await expect(page.getByText(brand.landing.headline)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  });

  test("the page's own element says Arabic and right to left; the document's language is left to the layout", async ({ page }) => {
    await page.goto("/ar");
    const wrapper = page.locator('div[lang="ar"][dir="rtl"]');
    await expect(wrapper).toHaveCount(1);
    await expect(wrapper.getByRole("main")).toHaveCount(1);
    await expect(wrapper.getByRole("banner")).toHaveCount(1);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("main")!).direction)).toBe("rtl");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });

  test("the branches and the kinds of people, each as a list item with its words, and no 'how it is run' section", async ({ page }) => {
    await page.goto("/ar");
    const section = (name: string) => page.getByRole("region", { name });
    await expect(section(landingAr.coversHeading).getByRole("listitem")).toHaveCount(landingAr.covers.length);
    await expect(section(landingAr.peopleHeading).getByRole("listitem")).toHaveCount(landingAr.people.length);
    for (const c of landingAr.covers) await expect(section(landingAr.coversHeading)).toContainText(c.text);
    for (const p of landingAr.people) await expect(section(landingAr.peopleHeading)).toContainText(p.text);
    await expect(page.getByRole("region")).toHaveCount(4);
    await expect(section(landingAr.coversHeading).locator("svg")).toHaveCount(0);
  });
});

test.describe("mirrored", () => {
  test("in the header the name is at the right and the way in at the left; in English it is the other way round", async ({ page }) => {
    await page.goto("/ar");
    const name = await box(page.getByRole("banner").getByText(nameAr, { exact: true }));
    const signIn = await box(page.getByRole("banner").getByRole("link", { name: labelsAr.signIn }));
    expect(name.x).toBeGreaterThan(signIn.x);
    await page.goto("/");
    const nameEn = await box(page.getByRole("banner").getByText(brand.name, { exact: true }));
    const signInEn = await box(page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }));
    expect(nameEn.x).toBeLessThan(signInEn.x);
  });

  test("the hero's words start at the right edge, the first branch is to the right of the second, and the hero's buttons run from the right", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/ar");
    const viewport = page.viewportSize()!;
    const h1 = await box(page.getByRole("heading", { level: 1 }));
    expect(h1.x + h1.width).toBeGreaterThan(viewport.width * (isMobile ? 0.85 : 0.6));
    const first = await box(page.getByRole("heading", { level: 3, name: landingAr.covers[0].title }));
    const second = await box(page.getByRole("heading", { level: 3, name: landingAr.covers[1].title }));
    if (isMobile)
      expect(second.y).toBeGreaterThan(first.y); // one column on a phone
    else expect(first.x).toBeGreaterThan(second.x);
    const buttons = page.getByRole("main").getByRole("link", { name: labelsAr.signIn }).first();
    const portal = page.getByRole("main").getByRole("link", { name: extra.label });
    if (!isMobile) expect((await box(buttons)).x).toBeGreaterThan((await box(portal)).x);
  });

  test("the text is set in the Arabic font, loaded from this site", async ({ page }) => {
    const fontFiles: string[] = [];
    page.on("response", (r) => {
      if (new URL(r.url()).pathname.includes("/_next/static/media/") && /\.woff2?$/.test(r.url())) fontFiles.push(r.url());
    });
    await page.goto("/ar");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("h1")!).fontFamily)).toMatch(/Noto Naskh Arabic/);
    expect(await page.evaluate(() => [...document.fonts].some((f) => /Noto Naskh Arabic/.test(f.family) && f.status === "loaded"))).toBe(
      true,
    );
    expect(fontFiles.length).toBeGreaterThan(0);
    // (A policy violation on the font would fail this test on its own: every browser test watches the page policy.)
  });
});

test.describe("between the two languages", () => {
  test("from the Arabic page the English link says English, is marked as English, and opens the English page", async ({ page }) => {
    await page.goto("/ar");
    const link = page.getByRole("banner").getByRole("link", { name: "English", exact: true });
    await expect(link).toHaveAttribute("href", "/");
    await expect(link).toHaveAttribute("lang", "en");
    await expect(link).toHaveAttribute("hreflang", "en");
    await link.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: brand.landing.headline })).toBeVisible();
  });

  test("from the English page the Arabic link says Arabic in Arabic, is marked as Arabic, and opens the Arabic page", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("banner").getByRole("link", { name: "العربية", exact: true });
    await expect(link).toHaveAttribute("href", "/ar");
    await expect(link).toHaveAttribute("lang", "ar");
    await expect(link).toHaveAttribute("hreflang", "ar");
    await link.click();
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.getByRole("heading", { level: 1, name: landingAr.headline })).toBeVisible();
  });
});

test.describe("its links and buttons", () => {
  test("the way in says so in Arabic in four places and leads to /login; the portal link is in the hero and the footer and works", async ({
    page,
  }) => {
    await page.goto("/ar");
    await expect(page.getByRole("link", { name: labelsAr.signIn, exact: true })).toHaveCount(4);
    await expect(page.getByRole("link", { name: extra.label })).toHaveCount(2);
    await page.getByRole("main").getByRole("link", { name: labelsAr.signIn, exact: true }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/ar");
    await page.getByRole("main").getByRole("link", { name: extra.label }).click();
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("the theme button is named in Arabic for what it will do, and does it", async ({ page }) => {
    await page.goto("/ar");
    const toggle = page.getByRole("banner").getByRole("button");
    const first = await toggle.getAttribute("aria-label");
    expect([labelsAr.theme.toLight, labelsAr.theme.toDark]).toContain(first);
    await toggle.click();
    const second = await toggle.getAttribute("aria-label");
    expect([labelsAr.theme.toLight, labelsAr.theme.toDark]).toContain(second);
    expect(second).not.toBe(first);
  });

  test("by keyboard: the English link, then the theme button, then the way in, each with a visible ring", async ({ page, isMobile }) => {
    test.skip(isMobile, "tab order is a desktop concern");
    await page.goto("/ar");
    for (const name of ["English", null, labelsAr.signIn]) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      if (name) await expect(focused).toHaveAccessibleName(name);
      else await expect(focused).toHaveRole("button");
      const ring = await focused.evaluate(
        (el) => getComputedStyle(el).outlineStyle !== "none" && parseFloat(getComputedStyle(el).outlineWidth) >= 2,
      );
      expect(ring, `a visible focus ring on ${name ?? "the theme button"}`).toBe(true);
    }
  });
});

test.describe("how it reads", () => {
  test("Axe and horizontal overflow in both themes, at 320 px wide, and with text a third bigger", async ({ page }) => {
    await page.goto("/ar");
    await checkBothThemes(page, "the Arabic landing page");
    await page.setViewportSize({ width: 320, height: 700 });
    await checkBothThemes(page, "the Arabic landing page at 320 px");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "133%";
    });
    await checkBothThemes(page, "the Arabic landing page at 320 px with larger text");
  });

  test("the English page, with its new link, still passes Axe and overflow at 320 px", async ({ page }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 320, height: 700 });
    await checkBothThemes(page, "the English landing page at 320 px, with the link to Arabic");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "133%";
    });
    await checkBothThemes(page, "the English landing page at 320 px with larger text, with the link to Arabic");
  });
});

test.describe("without a script", () => {
  test.use({ javaScriptEnabled: false });

  test("the page and its links are all there: it is written on the server", async ({ page }) => {
    await page.goto("/ar");
    await expect(page.getByRole("heading", { level: 1, name: landingAr.headline })).toBeVisible();
    await expect(page.getByRole("region", { name: landingAr.coversHeading }).getByRole("listitem")).toHaveCount(landingAr.covers.length);
    await page.getByRole("banner").getByRole("link", { name: "English", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("who does not see it", () => {
  test("a signed-in person who opens /ar is taken to their dashboard, and never sees the page", async ({ page }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Arabic Landing Teacher" });
    await signInThroughUi(page, teacher);
    await page.goto("/ar");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: landingAr.headline })).toHaveCount(0);
  });
});
