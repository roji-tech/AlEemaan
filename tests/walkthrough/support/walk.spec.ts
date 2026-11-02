import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Walk } from "./walk";
import { keyDelay, KEY_DELAY_MIN_MS, KEY_DELAY_MAX_MS } from "./pace";

const PAGE = "data:text/html,<title>t</title><label>Name <input id='a' value=''></label><button>Go</button>";
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "walk-spec-"));

test.describe("The walk helpers do what the walkthrough rules say", () => {
  test("a key press is 50 to 120 ms after the last, at both ends and always", () => {
    expect(keyDelay(() => 0)).toBe(KEY_DELAY_MIN_MS);
    expect(keyDelay(() => 0.9999999)).toBe(KEY_DELAY_MAX_MS);
    expect(KEY_DELAY_MIN_MS).toBe(50);
    expect(KEY_DELAY_MAX_MS).toBe(120);
    // Many draws, two assertions: each expect() is a reported step, so one per draw would take half a minute.
    const draws = Array.from({ length: 5000 }, () => keyDelay());
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(50);
    expect(Math.max(...draws)).toBeLessThanOrEqual(120);
    expect(draws.every(Number.isInteger)).toBe(true);
  });

  test("walk.type presses keys one by one at human speed and replaces what was there", async ({ page }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(PAGE);
    await page.locator("#a").evaluate((el: HTMLInputElement) => (el.value = "left over"));
    const pressed: string[] = [];
    await page.exposeFunction("recordKey", (key: string) => pressed.push(key));
    await page.evaluate(() =>
      document.addEventListener("keydown", (e) => {
        if (!e.ctrlKey && !e.metaKey) (window as unknown as { recordKey: (k: string) => void }).recordKey(e.key);
      }),
    );
    const started = Date.now();
    await walk.type(page.locator("#a"), "Amina");
    const took = Date.now() - started;
    await expect(page.locator("#a")).toHaveValue("Amina");
    expect(pressed.filter((k) => k.length === 1).join("")).toBe("Amina");
    expect(walk.typingMs()).toBeGreaterThanOrEqual(5 * 50);
    expect(walk.typingMs()).toBeLessThanOrEqual(5 * 120);
    expect(took).toBeGreaterThanOrEqual(5 * 50);
  });

  test("the typing budget fails a run that types too long", async ({ page }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(PAGE);
    await walk.type(page.locator("#a"), "abc");
    expect(() => walk.assertTypingBudget()).not.toThrow();
    expect(() => walk.assertTypingBudget(0)).toThrow(/over the budget/);
  });

  test("a page is loaded once per tab; a second tab has its own first load", async ({ page, context }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(PAGE);
    await expect(walk.goto(PAGE)).rejects.toThrow(/Forbidden/);
    const second = await context.newPage();
    const secondWalk = new Walk(second, tempDir());
    await secondWalk.init();
    await secondWalk.goto(PAGE);
    await expect(secondWalk.goto(PAGE)).rejects.toThrow(/Forbidden/);
  });

  test("a step must cover real rows of the coverage matrix, and writes its screenshot and timeline entry", async ({ page }) => {
    const dir = tempDir();
    const walk = new Walk(page, dir);
    await walk.init();
    await walk.goto(PAGE);
    const meta = { id: 1, title: "t", role: "Visitor" as const, caption: "c" };
    await expect(walk.step({ ...meta, covers: [] }, async () => {})).rejects.toThrow(/covers no coverage-matrix row/);
    await expect(walk.step({ ...meta, covers: ["NOPE-99"] }, async () => {})).rejects.toThrow(/not a row of the coverage matrix/);
    await walk.step({ ...meta, covers: ["SET-01"] }, async () => {});
    expect(fs.existsSync(path.join(dir, "step_001.png"))).toBe(true);
    expect(walk.getTimeline()).toHaveLength(1);
    expect(walk.getTimeline()[0]!.covers).toEqual(["SET-01"]);
    expect(walk.getTimeline()[0]!.endMs).toBeGreaterThan(walk.getTimeline()[0]!.startMs);
  });

  test("the caption bar and cursor are there on every page a click reaches, with no script error", async ({ page, context }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    // Registered after the walk's own routing, so it answers first: this stands in for the app.
    await context.route("http://localhost:3997/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: route.request().url().endsWith("/two")
          ? "<!doctype html><html lang='en'><head><title>two</title></head><body><main><h1>Two</h1></main></body></html>"
          : "<!doctype html><html lang='en'><head><title>one</title></head><body><main><h1>One</h1><a href='/two'>Go to two</a></main></body></html>",
      }),
    );
    await walk.goto("http://localhost:3997/one");
    await expect(page.locator("#walkthrough-overlay-root")).toHaveCount(1);
    await walk.click(page.getByRole("link", { name: "Go to two" }));
    await expect(page.getByRole("heading", { name: "Two" })).toBeVisible();
    // No step ran after the click: the bar must have been mounted by the page-load script itself.
    await expect(page.locator("#walkthrough-overlay-root")).toHaveCount(1);
    await expect(page.locator("#walkthrough-cursor")).toHaveCount(1);
    expect(walk.observers.observations.filter((o) => o.kind === "page-error")).toEqual([]);
  });

  test("finish() saves what the observers saw, and a strict run fails on a blocker", async ({ page }) => {
    const dir = tempDir();
    const walk = new Walk(page, dir);
    await walk.init();
    await walk.goto(PAGE);
    const file = path.join(dir, "observations.json");
    walk.finish(file, { strict: true });
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual([]);
    await page.evaluate(() => console.error("broken"));
    await expect.poll(() => walk.observers.blockers().length).toBe(1);
    expect(() => walk.finish(file, { strict: true })).toThrow(/1 blocking observation/);
    expect(() => walk.finish(file, { strict: false })).not.toThrow();
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))[0]).toMatchObject({ kind: "console-error", detail: "broken" });
  });

  test("the config allows no retries and no parallelism", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "../../../playwright.walkthrough.config.ts"), "utf-8");
    expect(config).toMatch(/\bretries:\s*0\b/);
    expect(config).toMatch(/\bworkers:\s*1\b/);
    expect(config).toMatch(/\bfullyParallel:\s*false\b/);
    expect(config).toMatch(/width:\s*1280,\s*height:\s*720/);
  });
});
