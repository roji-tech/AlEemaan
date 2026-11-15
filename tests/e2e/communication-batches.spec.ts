import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// Task 0063: the line above the Communication tabs while the rest of a broadcast is sent in the background. The server's answers are replaced here (the real ones are tested in
// tests/integration/communication-batches.spec.ts and tests/api/communication-queue.spec.ts), so that each state is seen as the administrator sees it.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// the count carries `?branchId=`: a glob must match the whole URL, query string included
const QUEUE = "**/api/v1/communication/queue?*";
const NEXT = "**/api/v1/communication/queue/next";
const BROADCAST = "**/api/v1/communication/broadcast";

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ data, meta: {}, error: null }),
});

async function scan(page: Page, what: string) {
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      `accessibility violations on ${what} (${theme})`,
    ).toEqual([]);
  }
  await setTheme(page, "dark");
}

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async ({ page }) => {
  await resetDatabase();
  await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Batch Admin", superAdmin: false });
  await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
});

const bar = (page: Page) => page.getByRole("status").filter({ hasText: /Sending|All \d+ messages/ });

test("opening Communication with messages waiting carries on in the background, shows how far it got and says when all are sent", async ({
  page,
}) => {
  let calls = 0;
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 25 })));
  await page.route(NEXT, async (route) => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 400));
    const left = Math.max(0, 25 - calls * 10);
    await route.fulfill(json({ claimed: calls < 3 ? 10 : 5, sent: calls < 3 ? 10 : 5, failed: 0, remaining: left, firstError: null }));
  });
  await page.goto("/communication");
  await expect(bar(page)).toContainText("Sending messages: 0 of 25");
  await expect(page.getByRole("progressbar", { name: "Messages sent" })).toBeVisible();
  await scan(page, "the sending progress");
  await expect(bar(page)).toContainText("All 25 messages were sent.");
  await expect(page.getByRole("button", { name: "Dismiss" })).toBeVisible();
  await scan(page, "the finished line");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(bar(page)).toHaveCount(0);
  expect(calls).toBe(3);
});

test("nothing waiting: no line is shown", async ({ page }) => {
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 0 })));
  await page.goto("/communication");
  await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
});

test("a broadcast to many people sends the rest in the background and keeps the screen on the composer", async ({ page }) => {
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 0 })));
  await page.route(BROADCAST, (route) =>
    route.fulfill(json({ count: 25, sent: 10, failed: 0, queued: 15, firstError: null, dispatches: [] }, 201)),
  );
  await page.route(NEXT, async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill(json({ claimed: 15, sent: 15, failed: 0, remaining: 0, firstError: null }));
  });
  await page.goto("/communication");
  await page.getByLabel("Message Content").fill("School resumes on Monday.");
  await page.getByRole("button", { name: "Send Broadcast" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Sending to 25 recipients: 10 done so far, 15 still to go.");
  await expect(page.getByRole("tab", { name: "Broadcast Composer" })).toHaveAttribute("aria-selected", "true");
  await expect(bar(page)).toContainText("All 25 messages were sent.");
});

test("when the server cannot be reached the line says sending is paused, and Try again carries on", async ({ page }) => {
  let broken = true;
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 12 })));
  await page.route(NEXT, async (route) => {
    if (broken) return route.abort("failed");
    return route.fulfill(json({ claimed: 12, sent: 11, failed: 1, remaining: 0, firstError: "Phone is not valid." }));
  });
  await page.goto("/communication");
  await expect(bar(page)).toContainText("Sending is paused at 0 of 12: the server could not be reached", { timeout: 15_000 });
  await scan(page, "the paused line");
  broken = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(bar(page)).toContainText(
    "All 12 messages were handled: 11 sent, 1 failed. Phone is not valid. Details are in Message Logs & Dispatches.",
  );
  await scan(page, "the finished line with a failure");
});

test("when another screen is sending the rest, the line says so instead of blaming the server, and Try again checks again", async ({
  page,
}) => {
  // the server answers every call "nothing claimed, 8 still waiting": another screen holds the rows (task 0067 fixes the wording: it said the server could not be reached)
  let released = false;
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 8 })));
  await page.route(NEXT, async (route) => {
    if (!released) return route.fulfill(json({ claimed: 0, sent: 0, failed: 0, remaining: 8, firstError: null }));
    return route.fulfill(json({ claimed: 8, sent: 8, failed: 0, remaining: 0, firstError: null }));
  });
  await page.goto("/communication");
  await expect(bar(page)).toContainText("Sending is paused at 0 of 8: another screen is sending the rest", { timeout: 30_000 });
  await expect(bar(page)).not.toContainText("could not be reached");
  await scan(page, "the paused line while another screen sends");
  released = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(bar(page)).toContainText("All 8 messages were sent.");
});
