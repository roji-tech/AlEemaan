import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, seedInstance } from "../support/db";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";
import { brand } from "@/lib/brand";

// The landing page (task 0048) in a real browser, on the desktop and on a phone: what a signed-out visitor sees at `/`, how it reads for a screen reader and a keyboard, that its two links work, that it needs
// no script, that a signed-in person never sees it. Axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes, also at 320 px wide.

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

const landing = brand.landing;
const extra = landing.links[0]; // the one public page besides sign-in that the brand names
const headings = (page: Page, level: number) => page.getByRole("heading", { level }).allInnerTexts();

test.beforeAll(async () => {
  await seedInstance();
});

test.describe("what a signed-out visitor sees", () => {
  test("a page with its own title, one h1, the headings in order, and the header, main and footer landmarks", async ({ page }) => {
    const response = await page.goto("/");
    expect(response!.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle(landing.title);

    expect(await headings(page, 1)).toEqual([landing.headline]);
    expect(await headings(page, 2)).toEqual([landing.coversHeading, landing.peopleHeading, landing.closingHeading]);
    expect(await headings(page, 3)).toEqual([...landing.covers.map((c) => c.title), ...landing.people.map((p) => p.who)]);

    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("banner")).toContainText(brand.name);
    await expect(page.getByRole("main")).toContainText(landing.lead);
    await expect(page.getByRole("contentinfo")).toContainText(`© ${new Date().getFullYear()} ${brand.name}`);
  });

  test("the school's branches and the kinds of people, each as a list item with its words, and no 'how it is run' section", async ({
    page,
  }) => {
    await page.goto("/");
    const section = (name: string) => page.getByRole("region", { name });
    await expect(section(landing.coversHeading).getByRole("listitem")).toHaveCount(landing.covers.length);
    await expect(section(landing.peopleHeading).getByRole("listitem")).toHaveCount(landing.people.length);
    for (const c of landing.covers) await expect(section(landing.coversHeading)).toContainText(c.text);
    for (const p of landing.people) await expect(section(landing.peopleHeading)).toContainText(p.text);
    await expect(page.getByRole("region")).toHaveCount(4); // the hero, what it covers, the people, the closing band
  });

  test("the page is about the school: its town and its four branches are on it, and none of the software features task 0048 listed is", async ({
    page,
  }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main).toContainText("Ibadan, Nigeria");
    for (const branch of ["Secondary (English)", "Primary (English)", "Secondary (Arabic)", "Primary (Arabic)"])
      await expect(main.getByRole("heading", { level: 3, name: branch, exact: true })).toBeVisible();
    for (const feature of ["Pupils and staff", "Attendance", "Marks", "Report cards", "Fees", "The end of the year", "What it covers"])
      await expect(main.getByRole("heading", { name: feature, exact: true }), feature).toHaveCount(0);
    // A branch card has no icon: nothing decorative stands in for it.
    await expect(page.getByRole("region", { name: landing.coversHeading }).locator("svg")).toHaveCount(0);
  });

  test("the four branch cards sit two by two where there is room, and one to a row on a phone (no card is left alone on a row)", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    const cards = page.getByRole("region", { name: landing.coversHeading }).getByRole("listitem");
    await expect(cards).toHaveCount(4);
    const spots = await cards.evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { x: Math.round(box.x), y: Math.round(box.y) };
      }),
    );
    const columns = new Set(spots.map((spot) => spot.x)).size;
    const rows = new Set(spots.map((spot) => spot.y)).size;
    expect({ columns, rows }).toEqual(isMobile ? { columns: 1, rows: 4 } : { columns: 2, rows: 2 });
  });

  test("the way in and the brand's own extra link each lead to a page that works", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to your dashboard" })).toBeVisible();

    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: extra.label }).click();
    await expect(page).toHaveURL(new RegExp(`${extra.href}$`));
    await expect(page.getByRole("heading", { level: 1, name: "AlEemaan Portal" })).toBeVisible(); // drawn once the page has asked whether a portal session exists
  });

  test("the sign-in link is in the header, the hero, the closing band and the footer, and always goes to /login", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("link", { name: "Sign in", exact: true });
    await expect(links).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) await expect(links.nth(i)).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: extra.label })).toHaveCount(2);
  });

  test("the theme switch works, and the choice is kept for the next visit", async ({ page }) => {
    await page.goto("/");
    const toLight = page.getByRole("button", { name: "Switch to light theme" });
    await toLight.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("a keyboard goes through every control in the order of the page, and each shows a focus ring", async ({ page }) => {
    await page.goto("/");
    const stops: { name: string; ring: number; style: string }[] = [];
    for (let presses = 0; presses < 8; presses += 1) {
      await page.keyboard.press("Tab");
      stops.push(
        await page.evaluate(async () => {
          const el = document.activeElement as HTMLElement;
          // Under reduced motion every property "transitions" over 0.01 ms, so the width read in the very instant of the key press can still be the one before the ring: wait for it to settle.
          await Promise.all(
            el
              .getAnimations()
              .filter((animation) => animation instanceof CSSTransition)
              .map((animation) => animation.finished.catch(() => undefined)),
          );
          const style = getComputedStyle(el);
          return {
            name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
            ring: Number.parseFloat(style.outlineWidth),
            style: style.outlineStyle,
          };
        }),
      );
    }
    // The theme switch, the header's sign-in, the hero's two links, the closing band's, then the footer's two; then round to the top.
    expect(stops.map((s) => s.name).slice(0, 7)).toEqual([
      "Switch to light theme",
      "Sign in",
      "Sign in",
      extra.label,
      "Sign in",
      "Sign in",
      extra.label,
    ]);
    for (const stop of stops.slice(0, 7)) {
      expect(stop.style, stop.name).not.toBe("none");
      expect(stop.ring, stop.name).toBeGreaterThanOrEqual(2);
    }
  });

  test("Axe and horizontal overflow in both themes, and at 320 px wide", async ({ page }) => {
    await page.goto("/");
    await checkBothThemes(page, "the landing page");
    await page.setViewportSize({ width: 320, height: 700 });
    await checkBothThemes(page, "the landing page at 320 px");
    // Text that is a third bigger again must still fit the line (WCAG 1.4.4 and 1.4.10): nothing cut off, nothing sideways.
    // (Through the style object, not a style tag: the page's policy refuses inline style text, which is the policy working.)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "133%";
    });
    await checkBothThemes(page, "the landing page at 320 px with larger text");
  });
});

test.describe("text on the deep brand band", () => {
  // Axe cannot judge text laid over a patterned background (it reports the pair as "needs review", not as a violation), so a loss of contrast on the closing band would pass the scan above. The ratio is
  // measured here instead: the text's own colour (with its opacity) laid over the band's colour, by the WCAG formula, against the 4.5:1 that normal text needs.
  async function ratios(page: Page) {
    return page.evaluate(() => {
      const rgba = (css: string): [number, number, number, number] => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.fillStyle = css;
        context.fillRect(0, 0, 1, 1);
        const d = context.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const over = (fg: [number, number, number, number], bg: number[]) => [0, 1, 2].map((i) => fg[3] * fg[i] + (1 - fg[3]) * bg[i]);
      const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      const band = document.querySelector("section[aria-labelledby='landing-closing']") as HTMLElement;
      const bandColour = rgba(getComputedStyle(band).backgroundColor).slice(0, 3);
      const out: Record<string, number> = {};
      for (const [name, element] of [
        ["heading", band.querySelector("h2")!],
        ["text", band.querySelector("p")!],
      ] as const)
        out[name] = ratio(over(rgba(getComputedStyle(element).color), bandColour), bandColour);
      const link = band.querySelector("a")!;
      const linkStyle = getComputedStyle(link);
      out.link = ratio(
        over(rgba(linkStyle.color), rgba(linkStyle.backgroundColor).slice(0, 3)),
        rgba(linkStyle.backgroundColor).slice(0, 3),
      );
      return out;
    });
  }

  test("the heading, the sentence and the link on it are all readable (4.5:1 or better), in both themes", async ({ page }) => {
    await page.goto("/");
    for (const theme of ["dark", "light"]) {
      await setTheme(page, theme);
      const measured = await ratios(page);
      for (const [name, value] of Object.entries(measured))
        expect(value, `${name} on the closing band [${theme} theme]`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test.describe("without a script", () => {
  test.use({ javaScriptEnabled: false });

  test("the page and its links are all there: it is written on the server", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: landing.headline })).toBeVisible();
    await expect(page.getByRole("region", { name: landing.coversHeading }).getByRole("listitem")).toHaveCount(landing.covers.length);
    await page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("who does not see it", () => {
  test("a signed-in person who opens / is taken to their dashboard, and never sees the landing page", async ({ page }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Landing Teacher" });
    await signInThroughUi(page, teacher);
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: landing.headline })).toHaveCount(0);
    await expect(page.getByRole("region", { name: landing.coversHeading })).toHaveCount(0);
  });

  test("/dashboard is still sign-in only: a signed-out visitor is sent to /login, not to the landing page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
