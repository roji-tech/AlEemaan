import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
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
const sidebar = (page: Page) => page.locator("#app-sidebar");
const shellRoot = (page: Page) => page.locator("[data-sidebar]");
const toggle = (page: Page) => sidebar(page).getByRole("button", { name: /^(Collapse|Expand) sidebar$/ });
const sectionButton = (page: Page, name: string) => mainNav(page).getByRole("button", { name });
const cookieValue = async (context: BrowserContext, name: string) => (await context.cookies()).find((c) => c.name === name)?.value;
const sidebarWidth = (page: Page) => sidebar(page).evaluate((el) => Math.round(el.getBoundingClientRect().width));
/// The left edge of the page beside the sidebar: the top bar spans it, whereas `#main` is centred in a max width and so moves by only half the change.
const mainLeft = (page: Page) =>
  page
    .locator("header")
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().left));
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(report, `accessibility violations on ${what}`).toEqual([]);
}

/// A mouse pointer arriving on an element from outside the window. Playwright's own hover moves a real mouse; this is for the case it cannot make: a finger.
const pointerArrives = (page: Page, selector: string, pointerType: "mouse" | "touch") =>
  page
    .locator(selector)
    .first()
    .evaluate(
      (el, type) => el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: type, relatedTarget: null })),
      pointerType,
    );

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

    // Every page in the list is built now (Settings since 0.5.2), so each is a real link and nothing is marked "coming soon".
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
    await expect(nav.getByText("coming soon")).toHaveCount(0);
    await expect(nav.getByText("Soon", { exact: true })).toHaveCount(0);

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

test.describe("desktop: the sidebar in sections", () => {
  test.skip(({ isMobile }) => isMobile, "the sidebar is the desktop layout");

  test("a school-wide administrator's sidebar: Overview on its own, then four sections, each holding its pages", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);

    const nav = mainNav(page);
    for (const name of ["Classroom", "Assessment", "Communication", "Administration"]) {
      await expect(sectionButton(page, name)).toHaveAttribute("aria-expanded", "true");
    }
    // Overview is not inside a section; the pages are inside theirs.
    await expect(nav.locator("ul ul").getByRole("link", { name: "Overview" })).toHaveCount(0);
    const classroom = nav.locator(`#${await sectionButton(page, "Classroom").getAttribute("aria-controls")}`);
    await expect(classroom.getByRole("link")).toHaveText(["Students", "Coursework", "Attendance", "Timetable", "Programs"]);
    const assessment = nav.locator(`#${await sectionButton(page, "Assessment").getAttribute("aria-controls")}`);
    await expect(assessment.getByRole("link")).toHaveText(["Results", "Question bank", "Forms"]);
    const administration = nav.locator(`#${await sectionButton(page, "Administration").getAttribute("aria-controls")}`);
    await expect(administration.getByRole("link")).toHaveText(["Branches", "Settings", "Academics", "Finance", "Approvals", "Users"]);
  });

  test("folding a section hides its pages from the screen and the keyboard; unfolding brings them back; the choice is remembered in a cookie", async ({
    page,
    context,
  }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    expect(await cookieValue(context, "sidebar-sections")).toBeUndefined();

    const button = sectionButton(page, "Classroom");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(mainNav(page).getByRole("link", { name: "Students" })).toBeHidden();
    await expect(mainNav(page).getByRole("link", { name: "Timetable" })).toBeHidden();
    await expect(mainNav(page).getByRole("link", { name: "Results" })).toBeVisible(); // the other sections are untouched
    expect(await cookieValue(context, "sidebar-sections")).toBe("classroom");

    // Folded pages are out of the tab order: Tab from the Classroom heading lands on the next section's heading, not on a hidden link.
    await button.focus();
    await page.keyboard.press("Tab");
    await expect(sectionButton(page, "Assessment")).toBeFocused();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(mainNav(page).getByRole("link", { name: "Students" })).toBeVisible();
    expect(await cookieValue(context, "sidebar-sections")).toBe("");
  });

  test("a folded section stays folded after a reload, on the very first paint (the server read the cookie)", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await sectionButton(page, "Assessment").click();
    await sectionButton(page, "Communication").click();

    await page.reload();
    await expect(sectionButton(page, "Assessment")).toHaveAttribute("aria-expanded", "false");
    await expect(sectionButton(page, "Communication")).toHaveAttribute("aria-expanded", "false");
    await expect(sectionButton(page, "Classroom")).toHaveAttribute("aria-expanded", "true");
    await expect(mainNav(page).getByRole("link", { name: "Forms" })).toBeHidden();
  });

  test("a hand-edited cookie can only pick states that exist: unknown names are ignored", async ({ page, context }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await context.addCookies([
      { name: "sidebar-sections", value: "administration,<b>x</b>,__proto__", url: HTTP_URL },
      { name: "sidebar", value: "sideways", url: HTTP_URL },
    ]);
    await page.reload();
    await expect(sectionButton(page, "Administration")).toHaveAttribute("aria-expanded", "false");
    await expect(sectionButton(page, "Classroom")).toHaveAttribute("aria-expanded", "true");
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "expanded");
  });

  test("arriving on a page inside a folded section opens that section, and a deliberate fold is still remembered", async ({
    page,
    context,
  }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await sectionButton(page, "Administration").click();
    await expect(sectionButton(page, "Administration")).toHaveAttribute("aria-expanded", "false");

    await page.goto("/users");
    await expect(sectionButton(page, "Administration")).toHaveAttribute("aria-expanded", "true");
    await expect(mainNav(page).getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(await cookieValue(context, "sidebar-sections")).toBe("administration"); // opening it for this page is not a new preference
  });

  test("a teacher's sidebar: Classroom and Assessment are sections; Announcements, alone in its section, is a plain link", async ({
    page,
  }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    await signInThroughUi(page, teacher);

    await expect(sectionButton(page, "Classroom")).toBeVisible();
    await expect(sectionButton(page, "Assessment")).toBeVisible();
    await expect(sectionButton(page, "Communication")).toHaveCount(0);
    await expect(sectionButton(page, "Administration")).toHaveCount(0);
    await expect(mainNav(page).getByRole("link", { name: "Announcements" })).toBeVisible();
    await expect(mainNav(page).getByRole("button")).toHaveCount(2);
    // It comes after the Assessment section, so a rule above it says it is not one of that section's pages.
    const ruleAbove = await mainNav(page)
      .getByRole("link", { name: "Announcements" })
      .locator("xpath=..")
      .evaluate((li) => getComputedStyle(li).borderTopWidth);
    expect(ruleAbove).toBe("1px");
  });
});

test.describe("desktop: the sidebar folds to icons and opens when an icon is hovered", () => {
  test.skip(({ isMobile }) => isMobile, "the sidebar is the desktop layout");

  test("the toggle folds it to a rail, moves the page over, and is remembered", async ({ page, context }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, admin);

    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "expanded");
    expect(await sidebarWidth(page)).toBe(248);
    const wideLeft = await mainLeft(page);

    await toggle(page).click();
    await expect(toggle(page)).toHaveAccessibleName("Expand sidebar");
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "collapsed");
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    await expect.poll(() => mainLeft(page)).toBe(64); // the page took the space
    expect(wideLeft).toBe(248);
    expect(await cookieValue(context, "sidebar")).toBe("collapsed");

    // Icons only: no visible words, but every link keeps its name.
    const students = mainNav(page).getByRole("link", { name: "Students" });
    await expect(students).toBeVisible();
    expect((await students.boundingBox())!.width).toBeLessThanOrEqual(48);
    await expect(sidebar(page).getByText("AlEemaan", { exact: true })).not.toBeInViewport();
    await expect(sidebar(page).getByText("Amina Yusuf")).not.toBeInViewport();

    // Remembered: the first paint after a reload is already the rail.
    await page.reload();
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "collapsed");
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await toggle(page).click();
    await expect(toggle(page)).toHaveAccessibleName("Collapse sidebar");
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "expanded");
    await expect.poll(() => sidebarWidth(page)).toBe(248);
    expect(await cookieValue(context, "sidebar")).toBe("expanded");
  });

  test("the toggle is a round arrow on the sidebar's right edge near the top: left to fold, right to open; it is not covered by the top bar", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    const straddles = async () => {
      const box = (await toggle(page).boundingBox())!;
      const width = await sidebarWidth(page);
      return { overhangs: box.x < width && box.x + box.width > width, top: box.y, round: Math.abs(box.width - box.height) <= 1 };
    };

    let at = await straddles();
    expect(at.overhangs).toBe(true); // it sits on the edge, half in and half out
    expect(at.top).toBeLessThan(60); // in the top bar's row
    expect(at.round).toBe(true);

    await toggle(page).click(); // Playwright refuses a click that another element would receive: the top bar does not cover it
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    at = await straddles();
    expect(at.overhangs).toBe(true);
    // In the rail it must not run into the brand mark.
    const brandRight = (await sidebar(page).locator("[data-part=brand] > span").first().boundingBox())!;
    expect((await toggle(page).boundingBox())!.x).toBeGreaterThanOrEqual(brandRight.x + brandRight.width);
    await expect(toggle(page)).toHaveAccessibleName("Expand sidebar");
    await expect(sidebar(page).getByText("Collapse sidebar")).toHaveCount(0); // no row in the foot any more
  });

  test("hovering an icon opens it over the page (the page does not move); moving away closes it", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, admin);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    const restingLeft = await mainLeft(page);

    await mainNav(page).getByRole("link", { name: "Students" }).hover();
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
    await expect.poll(() => sidebarWidth(page)).toBe(248);
    await expect(sidebar(page).getByText("AlEemaan", { exact: true })).toBeInViewport();
    await expect(mainNav(page).getByText("Students", { exact: true })).toBeInViewport();
    expect(await mainLeft(page)).toBe(restingLeft); // an overlay: nothing under it moved
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "collapsed"); // and the pinned choice is unchanged

    await page.mouse.move(900, 400);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64);
  });

  test("hovering the person at the foot opens it too", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, admin);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await sidebar(page).locator("[data-part=foot]").getByText("Administrator").hover({ force: true });
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
  });

  test("hovering the toggle does nothing (nor the brand); the pointer has to be on an icon", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await toggle(page).hover();
    await page.waitForTimeout(500); // longer than any delay the sidebar has
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    expect(await sidebarWidth(page)).toBe(64);

    await sidebar(page).locator("[data-part=brand]").hover();
    await page.waitForTimeout(500);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    // And folding it with the pointer still on the toggle does not reopen it either.
    await toggle(page).click();
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await page.waitForTimeout(300);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
  });

  test("a finger does not open it by hovering; a mouse does", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await pointerArrives(page, "#app-sidebar nav a", "touch");
    await page.waitForTimeout(400);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await pointerArrives(page, "#app-sidebar nav a", "mouse");
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
  });

  test("the keyboard does what the hover does: focus in the icons opens it, Escape closes it, the toggle never opens it", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await toggle(page).focus();
    await page.waitForTimeout(300);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await mainNav(page).getByRole("link", { name: "Overview" }).focus();
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
    await page.keyboard.press("Escape");
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await toggle(page).focus(); // focus() on the link that already has it would not be a new arrival
    await mainNav(page).getByRole("link", { name: "Overview" }).focus();
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
    await page.getByRole("link", { name: "Skip to content" }).focus(); // focus leaves the sidebar
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
  });

  test("in the rail a section heading shows only its chevron and still folds the section", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64); // measure after the width change, not during it
    const classroom = sectionButton(page, "Classroom");
    await expect(classroom).toBeVisible();
    expect((await classroom.boundingBox())!.width).toBeLessThanOrEqual(48);
    await classroom.click();
    await expect(classroom).toHaveAttribute("aria-expanded", "false");
    await expect(mainNav(page).getByRole("link", { name: "Students" })).toBeHidden();
  });

  test("icons sit at the same place in the rail and when it is open (nothing jumps when the pointer arrives)", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await toggle(page).click();
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    const icon = mainNav(page).getByRole("link", { name: "Students" }).locator("svg");
    const resting = (await icon.boundingBox())!;

    await mainNav(page).getByRole("link", { name: "Students" }).hover();
    await expect.poll(() => sidebarWidth(page)).toBe(248);
    const open = (await icon.boundingBox())!;
    expect(Math.abs(open.x - resting.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(open.y - resting.y)).toBeLessThanOrEqual(1);
  });
});

test.describe("desktop: the signed-in person stays pinned at the foot", () => {
  test.skip(({ isMobile }) => isMobile, "the sidebar is the desktop layout");

  const foot = (page: Page) => sidebar(page).locator("[data-part=foot]");
  const bottomOf = (locator: ReturnType<typeof foot>) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().bottom));

  test("with a short list and plenty of room above it, the person is still at the bottom edge", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Zainab Bello" });
    await signInThroughUi(page, teacher);

    expect(await bottomOf(foot(page))).toBe(900);
    await expect(foot(page)).toContainText("Zainab Bello");
    const navBottom = await mainNav(page).evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
    expect(navBottom).toBeLessThan(700); // there really is empty room between the list and the person
  });

  test("folding every section does not lift it, and neither does folding the sidebar to the rail", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    for (const name of ["Classroom", "Assessment", "Communication", "Administration"]) await sectionButton(page, name).click();
    expect(await bottomOf(foot(page))).toBe(900);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    expect(await bottomOf(foot(page))).toBe(900);
  });

  test("in a short window the list scrolls and the person never leaves the screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);

    expect(await bottomOf(foot(page))).toBe(420);
    const scroller = mainNav(page).locator("xpath=..");
    const { scrollHeight, clientHeight } = await scroller.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    await expect(toggle(page)).toBeInViewport();
    await expect(foot(page).getByText("Administrator")).toBeInViewport();
    await mainNav(page).getByRole("link", { name: "Users" }).scrollIntoViewIfNeeded();
    await expect(mainNav(page).getByRole("link", { name: "Users" })).toBeInViewport();
  });
});

test.describe("desktop: the sidebar is accessible and fits, in both themes, open and folded", () => {
  test.skip(({ isMobile }) => isMobile, "the sidebar is the desktop layout");

  for (const theme of ["dark", "light"] as const) {
    for (const state of ["open", "rail", "peek"] as const) {
      test(`${theme} theme, ${state}: no axe violations, no horizontal scrolling`, async ({ page, context }) => {
        const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
        await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
        await signInThroughUi(page, admin);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        if (state !== "open") await toggle(page).click();
        if (state === "peek") {
          await mainNav(page).getByRole("link", { name: "Students" }).hover();
          await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
        }
        await expect.poll(() => sidebarWidth(page)).toBe(state === "rail" ? 64 : 248);
        await expectAccessible(page, `${theme}/${state}`);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      });
    }
  }

  test("a folded section is accessible too", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await sectionButton(page, "Classroom").click();
    await expectAccessible(page, "a folded section");
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
    await expect(panel.getByRole("link", { name: "Video guide" })).toHaveAttribute("href", "/video-guide");
    await expect(panel.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings"); // a superadministrator: Settings is a real link, not a "Soon" tag
    await expect(panel.getByText("Soon", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("a branch administrator's menu has no Settings entry: the page is the superadministrator's, and the sidebar does not offer it either", async ({
    page,
  }) => {
    const branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false });
    await signInThroughUi(page, branchAdmin);

    const button = accountMenuButton(page);
    await button.click();
    const panel = page.locator(`#${await button.getAttribute("aria-controls")}`);
    await expect(panel.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(panel.getByText("Settings")).toHaveCount(0);
    await expect(panel.getByText("Soon", { exact: true })).toHaveCount(0);
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

  test("Video guide leads to the video guide page, and the menu is closed when you get there", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    await signInThroughUi(page, admin);
    await accountMenuButton(page).click();
    await page.getByRole("link", { name: "Video guide" }).click();

    await expect(page).toHaveURL(/\/video-guide$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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

    // Not a page load: a client-side navigation to a page whose layout is already on screen (Users: a tab on a phone as well as in the sidebar).
    await mainNav(page).getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Secondary (English)")).toHaveCount(0); // and no branch data was ever shown
  });
});

test.describe("someone who is not an administrator", () => {
  test("sees only what is theirs: Overview and Results in the navigation, their own branches, no Settings", async ({ page, isMobile }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Zainab Bello" });
    await signInThroughUi(page, teacher);

    await expect(page.getByRole("heading", { level: 1, name: "Welcome, Zainab" })).toBeVisible();
    // The sidebar lists every page a teacher may open (marks, attendance, coursework, timetable, programs, students, announcements, question bank, forms); the phone's tab bar keeps only
    // Overview and Results and the rest live in the More sheet.
    await expect(mainNav(page).getByRole("link")).toHaveCount(isMobile ? 2 : 10);
    await expect(mainNav(page).getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Results" })).toBeVisible();
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

  test("a tab bar replaces the sidebar: Overview, Academics, Results, Users, More (Branches and Settings are in More) — and the current page is marked", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);

    await expect(tabBar(page)).toBeVisible();
    await expect(tabBar(page).getByRole("link")).toHaveCount(4); // the built pages that fit; Branches and Settings live in the More sheet so the bar is not cramped
    await expect(tabBar(page).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(moreButton(page)).toHaveAttribute("aria-haspopup", "dialog");
    await expect(moreButton(page)).toHaveAttribute("aria-expanded", "false");

    await tabBar(page).getByRole("link", { name: "Results" }).click();
    await expect(page).toHaveURL(/\/results$/);
    await expect(tabBar(page).getByRole("link", { name: "Results" })).toHaveAttribute("aria-current", "page");
    await expect(tabBar(page).getByRole("link", { name: "Branches" })).toHaveCount(0);
    await moreButton(page).click();
    await page.getByRole("dialog").getByRole("link", { name: "Branches" }).click(); // rarely used on a phone: one tap further, in the More sheet
    await expect(page).toHaveURL(/\/branches$/);

    await expect(tabBar(page).getByRole("link", { name: "Settings" })).toHaveCount(0);
    await moreButton(page).click();
    await page.getByRole("dialog").getByRole("link", { name: "Settings" }).click(); // Settings is one tap further, in the More sheet
    await expect(page).toHaveURL(/\/settings$/);
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
    const lastRowBottom = await page
      .locator("ul[aria-label='Branches'] > li")
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom);
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
    await expect(sheet.getByText("Users")).toHaveCount(0); // built: it is a tab, not a "Soon" row in the sheet
    await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible(); // built, so a real link in the sheet (not a "Soon" row)
    await expect(sheet.getByText("Soon", { exact: true })).toHaveCount(0);
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
    const panel = await page.getByRole("dialog").locator("> div").boundingBox(); // where the sheet starts depends on how many entries the role has
    expect(panel!.y).toBeGreaterThan(8); // there is always a dimmed strip above the sheet to tap
    await page.mouse.click(195, panel!.y / 2);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(moreButton(page)).toBeFocused();
  });

  test("on a short phone the sheet stays on the screen, scrolls, and keeps Close and Sign out reachable", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);

    await moreButton(page).click();
    const sheet = page.getByRole("dialog");
    const panel = sheet.locator("> div");
    const box = await panel.boundingBox();
    expect(box!.y).toBeGreaterThan(8); // a dimmed strip is left above it
    expect(box!.y + box!.height).toBeLessThanOrEqual(640);
    await expect(sheet.getByRole("button", { name: "Close" })).toBeInViewport();
    const signOut = sheet.getByRole("button", { name: "Sign out" });
    await signOut.scrollIntoViewIfNeeded();
    await expect(signOut).toBeInViewport();
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

  test("the More sheet groups its pages under the same section headings as the desktop sidebar; there is no sidebar on a phone", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN });
    await signInThroughUi(page, admin);
    await expect(page.locator("#app-sidebar")).toBeHidden();

    await moreButton(page).click();
    const sheet = page.getByRole("dialog");
    for (const name of ["Classroom", "Assessment", "Communication", "Administration"]) {
      await expect(sheet.getByRole("heading", { level: 3, name })).toBeVisible();
    }
    await expect(sheet.getByRole("button", { name: "Classroom" })).toHaveCount(0); // a sheet is short-lived: its headings do not fold
    const classroom = sheet.getByRole("heading", { name: "Classroom" }).locator("xpath=..");
    await expect(classroom.getByRole("link")).toHaveText(["Students", "Coursework", "Attendance", "Timetable", "Programs"]);
  });

  test("a teacher's sheet: Classroom and Assessment have headings; Announcements, alone, has none", async ({ page }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    await signInThroughUi(page, teacher);
    await moreButton(page).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 3 })).toHaveText(["Classroom", "Assessment"]);
    await expect(sheet.getByRole("link", { name: "Announcements" })).toBeVisible();
  });

  test("a teacher's tab bar is Overview, Results and More; an administrator-only page is not in it", async ({ page }) => {
    const teacher = await createUser({ role: Role.TEACHING_STAFF });
    await signInThroughUi(page, teacher);
    await expect(tabBar(page).getByRole("link")).toHaveCount(2); // Overview and Results
    await moreButton(page).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Settings")).toHaveCount(0);
    await expect(sheet.getByText("Users")).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Profile" })).toBeVisible();
  });
});
