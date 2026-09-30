import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { BRANCH_NAMES, Role, createUser, db, seedInstance, sha256Hex } from "../support/db";
import { HTTP_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

// The admin shell from the design artifact: on a desktop a sidebar + top bar; on a phone a compact
// top bar + a floating bottom tab bar with a "More" sheet. Both are driven for real here — what is
// visible, what is announced, what the keyboard does, and what happens on the way out.

test.beforeAll(async () => {
  await seedInstance();
});

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const accountMenuButton = (page: Page) => page.getByRole("button", { name: /^Account menu for/ });
const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });

test.describe("signed-out visitors never see the shell", () => {
  for (const path of ["/dashboard", "/branches", "/account"]) {
    test(`${path} sends them to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

test.describe("desktop: sidebar and top bar", () => {
  test.skip(({ isMobile }) => isMobile, "the sidebar is the desktop layout");

  test("the sidebar names the product, lists the pages, and marks the current one", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, admin);

    const nav = mainNav(page);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Branches" })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByText("AlEemaan", { exact: true }).first()).toBeVisible();

    // Not-yet-built pages are honest: visible, marked, and not links.
    await expect(nav.getByRole("link", { name: /Settings|Users/ })).toHaveCount(0);
    await expect(nav.getByText("Settings")).toBeVisible();
    await expect(nav.getByText("Users")).toBeVisible();
    await expect(nav.getByText("coming soon")).toHaveCount(2); // the screen-reader text
    await expect(nav.getByText("Soon", { exact: true })).toHaveCount(2); // the visible pill

    // The signed-in person sits at the foot of the sidebar.
    const sidebar = page.locator("div.fixed", { has: nav });
    await expect(sidebar).toContainText("Amina Yusuf");
    await expect(sidebar).toContainText("Administrator");
  });

  test("navigating updates the current page, the breadcrumb, the heading and the tab title", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await expect(breadcrumb(page)).toContainText("Admin");
    await expect(breadcrumb(page).getByText("Overview")).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle("Overview · AlEemaan");

    await mainNav(page).getByRole("link", { name: "Branches" }).click();
    await expect(page).toHaveURL(/\/branches$/);
    await expect(page.getByRole("heading", { level: 1, name: "Branches" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Branches" })).toHaveAttribute("aria-current", "page");
    await expect(mainNav(page).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current", "page");
    await expect(breadcrumb(page).getByText("Branches")).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle("Branches · AlEemaan");
  });

  test("skip link: the first Tab reaches it, Enter moves focus into the main content", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await page.reload();

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible(); // only visible while focused
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("main");
  });

  test("the theme toggle in the top bar flips the theme and it follows you to the next page", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await mainNav(page).getByRole("link", { name: "Branches" }).click();
    await expect(page).toHaveURL(/\/branches$/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("the account menu (top bar)", () => {
  test("it is a disclosure: closed by default, opens with name, email, role and its actions", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, admin);

    const button = accountMenuButton(page);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("link", { name: "Profile" })).toHaveCount(0);

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(`#${await button.getAttribute("aria-controls")}`);
    await expect(panel).toContainText("Amina Yusuf");
    await expect(panel).toContainText(admin.email);
    await expect(panel).toContainText("Administrator");
    await expect(panel.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(panel.getByText("Settings")).toBeVisible(); // "soon", as in the artifact
    await expect(panel.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("Escape closes it and puts focus back on the button; so does a click elsewhere", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    const button = accountMenuButton(page);

    await button.click();
    await page.getByRole("link", { name: "Profile" }).focus();
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    // Somewhere the open panel can't cover (on a phone it spans most of the width): the page's left edge.
    await page.mouse.click(4, 400);
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("Profile leads to the account page, and the menu is closed when you get there", async ({ page, isMobile }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, admin);
    await accountMenuButton(page).click();
    await page.getByRole("link", { name: "Profile" }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page).toHaveTitle("Account · AlEemaan");
    await expect(accountMenuButton(page)).toHaveAttribute("aria-expanded", "false");
    if (!isMobile) await expect(breadcrumb(page).getByText("Account")).toHaveAttribute("aria-current", "page");
  });

  test("Sign out from the menu ends the session server-side and in the browser", async ({ page, context }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    expect(await db.session.count({ where: { userId: admin.id } })).toBe(1);

    await accountMenuButton(page).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await db.session.count({ where: { userId: admin.id } })).toBe(0);
    expect((await context.cookies()).find((c) => c.name === "aleemaan.session-token")).toBeUndefined();

    await page.goto("/branches");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("a session that ends underneath the shell", () => {
  test("a revoked session is sent to /login on the next page load, from every page", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await db.session.deleteMany({ where: { userId: admin.id } });

    for (const path of ["/branches", "/account", "/dashboard"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("…and so is an in-app navigation: a layout isn't re-run, so every PAGE has to check for itself", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await db.session.deleteMany({ where: { userId: admin.id } });

    // Not a page load: a client-side navigation to a page whose layout is already on screen.
    await mainNav(page).getByRole("link", { name: "Branches" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Secondary (English)")).toHaveCount(0); // and no branch data was ever shown
  });
});

test.describe("someone who is not an administrator", () => {
  test("sees only what is theirs: Overview alone in the navigation, their own branches, no Settings", async ({ page, isMobile }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Zainab Bello" });
    await signInThroughUi(page, teacher);

    await expect(page.getByRole("heading", { level: 1, name: "Welcome, Zainab" })).toBeVisible();
    await expect(mainNav(page).getByRole("link")).toHaveCount(1);
    await expect(mainNav(page).getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Branches", exact: true })).toHaveCount(0);
    await expect(page.getByText("Settings")).toHaveCount(0);
    // Their own memberships, and no school-wide figures.
    await expect(page.getByText(BRANCH_NAMES[0])).toBeVisible();
    await expect(page.getByText("People with a role")).toHaveCount(0);
    if (!isMobile) await expect(breadcrumb(page)).toContainText("Teaching staff");
  });

  test("/branches shows a clear 'no access' page and loads NO branch data", async ({ page }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    await signInThroughUi(page, teacher);
    await page.goto("/branches");

    await expect(page.getByRole("alert").filter({ hasText: "You don't have access to this page" })).toBeVisible();
    for (const name of BRANCH_NAMES) await expect(page.getByText(name)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New branch" })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to overview" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("the API says no as well (the page is a courtesy; the API is the check)", async ({ page }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    await signInThroughUi(page, teacher);
    // Same-origin, like the page's own fetch — otherwise the CSRF guard would refuse it first and this
    // test would pass for the wrong reason.
    const res = await page.request.post("/api/v1/branches", {
      data: { name: `Nope ${Date.now()}` },
      headers: { origin: HTTP_URL },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });
});

test.describe("phone: bottom tab bar and the More sheet", () => {
  test.skip(({ isMobile }) => !isMobile, "the tab bar is the phone layout");

  const tabBar = (page: Page) => mainNav(page);
  const moreButton = (page: Page) => tabBar(page).getByRole("button", { name: "More" });

  test("a tab bar replaces the sidebar: Overview, Branches, More — and the current page is marked", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);

    await expect(tabBar(page)).toBeVisible();
    await expect(tabBar(page).getByRole("link")).toHaveCount(2); // built pages only; the rest live in More
    await expect(tabBar(page).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(moreButton(page)).toHaveAttribute("aria-haspopup", "dialog");
    await expect(moreButton(page)).toHaveAttribute("aria-expanded", "false");

    await tabBar(page).getByRole("link", { name: "Branches" }).click();
    await expect(page).toHaveURL(/\/branches$/);
    await expect(tabBar(page).getByRole("link", { name: "Branches" })).toHaveAttribute("aria-current", "page");
  });

  test("the tab bar never covers the end of a long page", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    // Make /branches long enough to scroll on a phone.
    const stamp = Date.now();
    await db.branch.createMany({
      data: Array.from({ length: 14 }, (_, i) => ({ name: `Shell scroll ${stamp}-${i}` })),
    });
    await signInThroughUi(page, admin);
    await page.goto("/branches");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
    const lastRowBottom = await page.locator("ul[aria-label='Branches'] > li").last().evaluate((el) => el.getBoundingClientRect().bottom);
    const barTop = await tabBar(page).evaluate((el) => el.getBoundingClientRect().top);
    expect(lastRowBottom).toBeLessThanOrEqual(barTop);
  });

  test("More opens a modal sheet: who you are, what's coming, Profile and Sign out", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, admin);

    await moreButton(page).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(moreButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(sheet).toContainText("Amina Yusuf");
    await expect(sheet).toContainText("Administrator");
    await expect(sheet.getByText("Users")).toBeVisible();
    await expect(sheet.getByText("Settings")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Amina Yusuf" })).toBeVisible(); // it is named
  });

  test("Escape, the Close button and a tap on the backdrop each close it, and focus returns to More", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);

    await moreButton(page).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(moreButton(page)).toBeFocused();
    await expect(moreButton(page)).toHaveAttribute("aria-expanded", "false");

    await moreButton(page).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(moreButton(page)).toBeFocused();

    await moreButton(page).click();
    await page.mouse.click(195, 60); // the dimmed area above the sheet
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(moreButton(page)).toBeFocused();
  });

  test("it traps focus while open (Tab never leaves the sheet) and the page behind is inert", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await moreButton(page).click();

    // Past the sheet's last control a browser either wraps to its first or hands focus to its own UI
    // (nothing in the page has focus). What it must NEVER do is land on the page behind the sheet.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return "browser";
        return document.querySelector("dialog")!.contains(active) ? "sheet" : "PAGE BEHIND";
      });
      expect(where, `after ${i + 1} Tab presses`).not.toBe("PAGE BEHIND");
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Profile in the sheet navigates and closes the sheet", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await moreButton(page).click();
    await page.getByRole("dialog").getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Sign out from the sheet ends the session", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    const token = (await page.context().cookies()).find((c) => c.name === "aleemaan.session-token")!.value;
    expect(await db.session.count({ where: { tokenHash: sha256Hex(token) } })).toBe(1);

    await moreButton(page).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await db.session.count({ where: { tokenHash: sha256Hex(token) } })).toBe(0);
  });

  test("a non-administrator's tab bar is just Overview and More", async ({ page }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    await signInThroughUi(page, teacher);
    await expect(tabBar(page).getByRole("link")).toHaveCount(1);
    await moreButton(page).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Settings")).toHaveCount(0);
    await expect(sheet.getByText("Users")).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Profile" })).toBeVisible();
  });
});
