import type { Page, Locator } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { pace, keyDelay, TYPING_BUDGET_MINUTES } from "./pace";
import { getOverlayInitScript } from "./overlay";
import { Observers } from "./observers";
import rows from "../coverage/rows.json";

/// Every row id of the coverage matrix: a step may only claim a row that exists.
const KNOWN_ROWS = new Set<string>((rows as Array<{ id: string }>).map((row) => row.id));

/// The same seven names as the roles of the coverage matrix.
export type WalkRole = "Visitor" | "Superadmin" | "Branch administrator" | "Teacher" | "Non-teaching staff" | "Pupil" | "Guardian";

/// The badge colour class (overlay.ts) of each role.
const ROLE_CLASS: Record<WalkRole, string> = {
  Visitor: "visitor",
  Superadmin: "platform",
  "Branch administrator": "admin",
  Teacher: "teacher",
  "Non-teaching staff": "teacher",
  Pupil: "pupil",
  Guardian: "parent",
};

export interface StepMeta {
  id: number;
  title: string;
  role: WalkRole;
  caption: string;
  chapter?: string;
  /// The coverage-matrix rows this step proves (tests/walkthrough/coverage/rows.json). A step that proves nothing, or names a row that does not exist, is a bug in the journey.
  covers: string[];
}

export interface TimelineEntry extends StepMeta {
  startMs: number;
  endMs: number;
  screenshotPath: string;
}

export class Walk {
  private page: Page;
  private currentX: number = 200;
  private currentY: number = 200;
  private stepCount: number = 0;
  private gotoCount: number = 0;
  private recordingStartMs: number = 0;
  private timeline: TimelineEntry[] = [];
  private screenshotsDir: string;
  private currentRole: WalkRole = "Visitor";
  private typedMs: number = 0;
  /// Always on: console, page errors, failed requests, response statuses, requests that would leave the machine, and axe after every new page.
  readonly observers: Observers;

  constructor(page: Page, screenshotsDir: string = "out/walkthrough/screenshots") {
    this.page = page;
    this.screenshotsDir = screenshotsDir;
    this.observers = new Observers(page);
  }

  /**
   * Initializes overlay, cursor simulation, and sets recording start time.
   */
  async init(): Promise<void> {
    this.recordingStartMs = Date.now();
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }

    await this.observers.start(this.page.context());

    // Re-inject overlay automatically across navigations
    await this.page.addInitScript(getOverlayInitScript());
    await this.injectOverlayNow();
  }

  private async injectOverlayNow(): Promise<void> {
    try {
      await this.page.evaluate((script) => {
        const fn = new Function(script);
        fn();
      }, getOverlayInitScript());
    } catch {
      // In case navigation is in flight
    }
  }

  /**
   * Safe single-landing navigation guard. Throws if called more than once.
   */
  async goto(url: string): Promise<void> {
    if (this.gotoCount > 0) {
      throw new Error(
        `Forbidden: page.goto called ${this.gotoCount + 1} times. All subsequent pages must be reached exclusively via user clicks and links.`,
      );
    }
    this.gotoCount++;
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.injectOverlayNow();
  }

  /**
   * Glides the simulated cursor smoothly to the specified screen coordinates.
   */
  async glideTo(targetX: number, targetY: number): Promise<void> {
    const startX = this.currentX;
    const startY = this.currentY;
    const steps = pace.glideSteps;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Smooth easeInOutQuad interpolation
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const x = Math.round(startX + (targetX - startX) * ease);
      const y = Math.round(startY + (targetY - startY) * ease);

      await this.page.evaluate(
        ({ cx, cy }) => {
          const cursor = document.getElementById("walkthrough-cursor");
          if (cursor) {
            cursor.style.transform = `translate(${cx}px, ${cy}px)`;
          }
        },
        { cx: x, cy: y },
      );
      await this.page.mouse.move(x, y);
      await new Promise((r) => setTimeout(r, 12));
    }

    this.currentX = targetX;
    this.currentY = targetY;
  }

  /**
   * Realistic human-paced click with visible cursor glide, hover pause, click ripple, and settle pause.
   */
  async click(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Cannot click element: bounding box is null.`);
    }

    const targetX = Math.round(box.x + box.width / 2);
    const targetY = Math.round(box.y + box.height / 2);

    await this.glideTo(targetX, targetY);
    await new Promise((r) => setTimeout(r, pace.beforeClick));

    // Inject visual click ripple
    await this.page.evaluate(
      ({ rx, ry }) => {
        const ripple = document.createElement("div");
        ripple.className = "wt-ripple";
        ripple.style.left = `${rx}px`;
        ripple.style.top = `${ry}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 400);
      },
      { rx: targetX, ry: targetY },
    );

    await locator.click();
    await new Promise((r) => setTimeout(r, pace.afterClick));
  }

  /**
   * Human-paced typing: glides cursor, clicks the field, clears it the way a person does (select all, delete) and presses one key at a time, 50 to 120 ms apart.
   */
  async type(locator: Locator, text: string): Promise<void> {
    await this.click(locator);
    await this.page.keyboard.press("ControlOrMeta+A");
    await this.page.keyboard.press("Backspace");
    for (const character of text) {
      await this.page.keyboard.type(character);
      const delay = keyDelay();
      this.typedMs += delay;
      await new Promise((r) => setTimeout(r, delay));
    }
    await new Promise((r) => setTimeout(r, pace.afterClick));
  }

  /// Milliseconds spent between key presses so far (the typing budget counts it).
  typingMs(): number {
    return this.typedMs;
  }

  /// Fails the run when the typing alone is longer than a pass may contain: shorten the fixture text.
  assertTypingBudget(maxMinutes: number = TYPING_BUDGET_MINUTES): void {
    const minutes = this.typedMs / 60_000;
    if (minutes > maxMinutes)
      throw new Error(`Typing took ${minutes.toFixed(1)} minutes, over the budget of ${maxMinutes}. Shorten the fixture text.`);
  }

  /**
   * Selects an option from a <select> element with proper cursor glide and pacing.
   */
  async selectOption(locator: Locator, value: string): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (box) {
      await this.glideTo(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
      await new Promise((r) => setTimeout(r, pace.beforeClick));
    }
    await locator.selectOption(value);
    await new Promise((r) => setTimeout(r, pace.afterClick));
  }

  /**
   * Executes a formal walkthrough step: updates the in-page overlay, records timestamps,
   * runs the action, settles DOM, captures screenshot, and dwells.
   */
  async step(meta: StepMeta, action: () => Promise<void>): Promise<void> {
    if (!Array.isArray(meta.covers) || meta.covers.length === 0)
      throw new Error(`Step ${meta.id} ("${meta.title}") covers no coverage-matrix row.`);
    for (const id of meta.covers) {
      if (!KNOWN_ROWS.has(id))
        throw new Error(`Step ${meta.id} ("${meta.title}") covers "${id}", which is not a row of the coverage matrix.`);
    }
    this.stepCount = meta.id;
    this.currentRole = meta.role;
    this.observers.setStep(meta.id);
    const startMs = Date.now() - this.recordingStartMs;

    const roleSlug = ROLE_CLASS[meta.role];
    const stepLabel = `Step ${String(meta.id).padStart(2, "0")}`;

    // Update overlay in DOM
    await this.injectOverlayNow();
    await this.page.evaluate(
      ({ step, role, title, caption, slug }) => {
        const stepEl = document.getElementById("wt-step");
        const roleEl = document.getElementById("wt-role");
        const titleEl = document.getElementById("wt-title");
        const captionEl = document.getElementById("wt-caption");

        if (stepEl) stepEl.textContent = step;
        if (roleEl) {
          roleEl.textContent = role;
          roleEl.className = `wt-role-badge wt-role-${slug}`;
        }
        if (titleEl) titleEl.textContent = title;
        if (captionEl) captionEl.textContent = caption;
      },
      {
        step: stepLabel,
        role: meta.role,
        title: meta.title,
        caption: meta.caption,
        slug: roleSlug,
      },
    );

    // Execute user action
    await action();

    // Settle pause
    await new Promise((r) => setTimeout(r, pace.settle));

    // A page reached for the first time is scanned for accessibility before the screenshot (the scan changes nothing on the page).
    await this.observers.axeOnNewRoute();

    // Capture step screenshot
    const screenshotName = `step_${String(meta.id).padStart(3, "0")}.png`;
    const screenshotPath = path.join(this.screenshotsDir, screenshotName);
    await this.page.screenshot({ path: screenshotPath });

    // Dwell pause to comfortably frame caption
    await new Promise((r) => setTimeout(r, pace.dwell));

    const endMs = Date.now() - this.recordingStartMs;

    this.timeline.push({
      ...meta,
      startMs,
      endMs,
      screenshotPath,
    });
  }

  /**
   * Writes the recorded timeline metadata to timeline.json
   */
  saveTimeline(outputPath: string = "out/walkthrough/timeline.json"): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(this.timeline, null, 2), "utf-8");
  }

  /// Writes what the observers saw, and in a strict run (the final one) fails on any blocker. A recon run passes strict: false and reads the file.
  finish(observationsPath: string, options: { strict: boolean }): void {
    this.observers.save(observationsPath);
    this.assertTypingBudget();
    const blockers = this.observers.blockers();
    if (options.strict && blockers.length > 0) {
      const first = blockers
        .slice(0, 5)
        .map((o) => `step ${o.step} ${o.route}: ${o.kind} ${o.detail}`)
        .join("\n  ");
      throw new Error(`${blockers.length} blocking observation(s); the first:\n  ${first}`);
    }
  }

  getTimeline(): TimelineEntry[] {
    return this.timeline;
  }
}
