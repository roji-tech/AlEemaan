import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0104: the Install button. Chrome fires `beforeinstallprompt` once, soon after load; the page keeps it and calls its `prompt()` when asked. A real Chrome install cannot be driven
// from a test (that is the maintainer's phone), so the event is made here exactly as the browser makes it: a cancelable event with `prompt()` and `userChoice`.

test.beforeAll(async () => {
  await resetDatabase();
  await seedInstance();
});
test.afterAll(async () => {
  await resetDatabase();
});

/// Opens a page and waits until its scripts have run: the worker is registered by an effect after hydration, so once it is registered the install listener (attached when the same code loads)
/// is certainly there. Chrome fires its event seconds after load; a test that fired it at once would be firing it at nothing.
async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), {
      message: `the scripts of ${path} have run`,
    })
    .toBe(1);
}

/// What Chrome does: fires the event on the window, once the page's scripts are running.
async function chromeOffersInstall(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  await page.evaluate((choice) => {
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = () => {
      (window as unknown as { __prompted: number }).__prompted = ((window as unknown as { __prompted?: number }).__prompted ?? 0) + 1;
      return Promise.resolve();
    };
    event.userChoice = Promise.resolve({ outcome: choice });
    window.dispatchEvent(event);
  }, outcome);
}
const prompted = (page: Page) => page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted ?? 0);
const INSTALL = (page: Page) => page.getByRole("button", { name: "Install the app" });

test("the service worker is registered on the pages people install from, not only inside the signed-in app", async ({ page, isMobile }) => {
  test.skip(isMobile, "the desktop project drives the page");
  for (const path of ["/login", "/portal"]) {
    await page.goto(path);
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), {
        message: `a worker is registered on ${path}`,
      })
      .toBe(1);
  }
});

test("the sign-in page has no Install button until the browser offers one; then it calls the browser's prompt once and goes away", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the desktop project drives the page");
  await visit(page, "/login");
  await expect(INSTALL(page)).toHaveCount(0); // nothing offered, nothing shown: a button that does nothing is worse than none
  await chromeOffersInstall(page);
  await expect(INSTALL(page)).toBeVisible();
  await INSTALL(page).click();
  await expect.poll(() => prompted(page)).toBe(1);
  await expect(INSTALL(page)).toHaveCount(0); // a saved prompt is used once
});

test("the browser's own mini bar is replaced: the event is cancelled so the page decides when to ask", async ({ page, isMobile }) => {
  test.skip(isMobile, "the desktop project drives the page");
  await visit(page, "/login");
  const cancelled = await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(cancelled).toBe(true);
});

test("appinstalled takes the button away, and an app already running installed is never offered one", async ({ page, isMobile }) => {
  test.skip(isMobile, "the desktop project drives the page");
  await visit(page, "/login");
  await chromeOffersInstall(page);
  await expect(INSTALL(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(INSTALL(page)).toHaveCount(0);

  // Opened from the home screen: the display mode is standalone, so even a prompt offers nothing.
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes("display-mode: standalone")
        ? ({
            matches: true,
            media: query,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            onchange: null,
            dispatchEvent: () => false,
          } as unknown as MediaQueryList)
        : original(query);
  });
  await visit(page, "/login");
  await chromeOffersInstall(page);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(INSTALL(page)).toHaveCount(0);
});

test("the pupils' and parents' sign-in (/portal) offers it too", async ({ page, isMobile }) => {
  test.skip(isMobile, "the desktop project drives the page");
  await visit(page, "/portal");
  await expect(page.getByRole("button", { name: /Access Student Portal/ })).toBeVisible();
  await chromeOffersInstall(page);
  await expect(INSTALL(page)).toBeVisible();
});

test("signed in, it is in the account menu on a wide screen and in the More sheet on a phone", async ({ page, isMobile }) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Install Tester" });
  await signInThroughUi(page, admin);
  await visit(page, "/dashboard");
  await chromeOffersInstall(page);
  if (isMobile) {
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Install the app" })).toBeVisible();
  } else {
    await expect(INSTALL(page)).toHaveCount(0); // the account menu is closed: nothing is drawn yet
    await page
      .getByRole("button", { name: /Install Tester/ })
      .first()
      .click();
    await expect(INSTALL(page)).toBeVisible();
  }
});

test.describe("on an iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });

  test("there is no prompt to call, so the page says where the install is: Share, then Add to Home Screen", async ({ page, isMobile }) => {
    test.skip(isMobile, "the desktop project drives the page");
    await page.goto("/login");
    await expect(page.getByText(/To install on an iPhone or iPad/)).toBeVisible();
    await expect(page.getByText("Add to Home Screen")).toBeVisible();
    await expect(INSTALL(page)).toHaveCount(0);
  });
});
