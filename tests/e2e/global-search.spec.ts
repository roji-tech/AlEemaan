import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0107: search the whole app from the top bar. A real browser: the `/` shortcut, what a result says (title, trail, kind, steps), that choosing one lands on its page AND its tab, that a person
// never finds a page they cannot open, the keyboard, the phone's sheet, and accessibility in both themes.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});
test.afterAll(async () => {
  await resetDatabase();
});

const box = (page: Page) => page.getByRole("combobox", { name: "Find a page or setting" });
const option = (page: Page, text: string | RegExp) => page.getByRole("option").filter({ hasText: text });
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function open(page: Page, user: Parameters<typeof signInThroughUi>[1], path = "/dashboard") {
  await signInThroughUi(page, user);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test.describe("on a wide screen", () => {
  test("`/` focuses the field; a result names its page, its tab, its kind and, for the active one, the steps; Enter lands on the page AND the tab", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, await createUser({ role: Role.ADMIN, superAdmin: true }));

    await page.locator("main").click(); // focus is not in a field
    await page.keyboard.press("/");
    await expect(box(page)).toBeFocused();

    await page.keyboard.type("login");
    const hit = option(page, "Sign-in access").first();
    await expect(hit).toBeVisible();
    await expect(hit).toContainText("Settings › Sign-in access");
    await expect(hit).toContainText("Setting"); // its kind, in words
    await expect(hit).toHaveAttribute("aria-selected", "true");
    // The active result spells the way out: the steps under it.
    await expect(hit.getByText("How to get there")).toBeVisible();
    await expect(hit.getByRole("listitem")).toHaveCount(3);
    await expect(hit.getByRole("listitem").nth(1)).toContainText("Sign-in access tab");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\?tab=signin$/);
    await expect(page.getByRole("tab", { name: "Sign-in access" })).toHaveAttribute("aria-selected", "true");
    // The panel closed behind it.
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("clicking a how-to goes to the page and the tab it names; the question the maintainer asked: 'start a new session' ends on Academics, Sessions", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, await createUser({ role: Role.ADMIN, superAdmin: false }));
    await box(page).click();
    await box(page).fill("new session");
    const hit = option(page, "Start a new academic session");
    await expect(hit).toBeVisible();
    await expect(hit).toContainText("Academics › Sessions");
    await hit.click();
    await expect(page).toHaveURL(/\/academics\?tab=sessions$/);
    await expect(page.getByRole("tab", { name: "Sessions" })).toHaveAttribute("aria-selected", "true");
  });

  test("a slip in a word is forgiven, and a made-up word says so and offers ideas", async ({ page, isMobile }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, await createUser({ role: Role.ADMIN, superAdmin: true }));
    await box(page).click();
    await box(page).fill("setings");
    await expect(option(page, "Settings").first()).toBeVisible();
    await box(page).fill("qwertyuiop");
    await expect(page.getByText(/Nothing found for/)).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test("a person never finds a page they cannot open: a teacher searching for fees finds no Finance, but finds Students", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, await createUser({ role: Role.TEACHING_STAFF }));
    await box(page).click();
    await box(page).fill("fees");
    await expect(page.getByText(/Nothing found for/)).toBeVisible();
    await expect(option(page, "Finance")).toHaveCount(0);
    await box(page).fill("pupil");
    await expect(option(page, "Students").first()).toBeVisible();
    await box(page).fill("invoice");
    await expect(option(page, /invoice/i)).toHaveCount(0);
    await box(page).fill("settings");
    await expect(option(page, /Sign-in access/)).toHaveCount(0);
  });

  test("the keyboard: Down and Up move the active result, Escape clears the words and then closes the panel, focus stays in the field", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, await createUser({ role: Role.ADMIN, superAdmin: true }));
    await box(page).click();
    await box(page).fill("term");
    const first = await box(page).getAttribute("aria-activedescendant");
    expect(first).toBeTruthy();
    await page.keyboard.press("ArrowDown");
    const second = await box(page).getAttribute("aria-activedescendant");
    expect(second).not.toBe(first);
    await page.keyboard.press("ArrowUp");
    expect(await box(page).getAttribute("aria-activedescendant")).toBe(first);
    await expect(box(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(box(page)).toHaveValue("");
    await expect(page.getByRole("listbox")).toBeVisible(); // the first Escape only cleared the words
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("what was chosen is remembered on this device and offered when the box is empty; only ids are kept, never what was typed", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, await createUser({ role: Role.ADMIN, superAdmin: false }));
    await box(page).click();
    await box(page).fill("attendance");
    await option(page, "Attendance").first().click();
    await expect(page).toHaveURL(/\/attendance/);
    await page.goto("/dashboard");
    await box(page).click();
    await expect(page.getByRole("group", { name: "Recent" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Recent" }).getByRole("option")).toContainText(["Attendance"]);
    const stored = await page.evaluate(() => window.localStorage.getItem("aleemaan.search.recent"));
    expect(stored).toBe('["/attendance"]');
    expect(stored).not.toContain("attendance ");
  });

  test("nothing typed leaves the browser: while searching, no request carries the words and none goes to the API", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, await createUser({ role: Role.ADMIN, superAdmin: true }));
    await box(page).click();
    const requests: { url: string; body: string }[] = [];
    page.on("request", (r) => requests.push({ url: r.url(), body: r.postData() ?? "" }));
    await box(page).pressSequentially("sign in access", { delay: 20 });
    await expect(option(page, "Sign-in access").first()).toBeVisible();
    // Next may prefetch a page a link points at (`?_rsc=`); that is the framework, not the text. Nothing typed is in any address or body, and no call is made to the API.
    expect(
      requests.filter((r) => /sign/i.test(decodeURIComponent(r.url + r.body))),
      "requests that carry the typed words",
    ).toEqual([]);
    expect(
      requests.filter((r) => r.url.includes("/api/")),
      "calls to the API while typing",
    ).toEqual([]);
  });

  for (const theme of ["dark", "light"] as const) {
    test(`accessible and readable in the ${theme} theme: the open panel with results has no violations`, async ({
      page,
      isMobile,
      baseURL,
    }) => {
      test.skip(isMobile, "sized by the desktop project");
      await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      await page.setViewportSize({ width: 1280, height: 800 });
      await open(page, await createUser({ role: Role.ADMIN, superAdmin: true }));
      await box(page).click();
      await box(page).fill("sign");
      await expect(page.getByRole("option").first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(" "))
              .slice(0, 3)
              .join(" | ")}`,
        ),
      ).toEqual([]);
      await box(page).fill("");
      await expect(page.getByRole("group", { name: "Common questions" })).toBeVisible();
      const empty = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(empty.violations.map((v) => v.id)).toEqual([]);
    });
  }
});

test.describe("on a phone", () => {
  test("the field is a magnifier button that opens a full-screen sheet with the box focused; choosing a result goes there and closes it; nothing scrolls sideways", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 360, height: 760 });
    await open(page, await createUser({ role: Role.ADMIN, superAdmin: false }));
    const button = page.getByRole("button", { name: "Find a page or setting" });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await button.click();
    const dialog = page.getByRole("dialog", { name: "Find a page or setting" });
    await expect(dialog).toBeVisible();
    await expect(box(page)).toBeFocused();
    await box(page).fill("password");
    const hit = option(page, "Change my password");
    await expect(hit).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      axe.violations.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 2)
            .join(" | ")}`,
      ),
    ).toEqual([]);
    await hit.click();
    await expect(page).toHaveURL(/\/account/);
    await expect(dialog).toBeHidden();
  });

  test("the sheet closes with its Close button and gives the focus back", async ({ page, isMobile }) => {
    test.skip(isMobile, "sized by the desktop project");
    await page.setViewportSize({ width: 360, height: 760 });
    await open(page, await createUser({ role: Role.ADMIN, superAdmin: false }));
    const button = page.getByRole("button", { name: "Find a page or setting" });
    await button.click();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog", { name: "Find a page or setting" })).toBeHidden();
    await expect(button).toBeFocused();
  });
});
