import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "../support/fixtures";

// Shared by the browser specs of programs (task 0043): the accessibility and width checks, and the way to reach a tab of a program.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectAccessible(page: Page, what: string) {
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

export async function expectFits(page: Page, what: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal scrolling on ${what}`).toBeLessThanOrEqual(innerWidth);
}

/// The tabs of the program's page (not the tabs inside a tab, which can share a name).
export const programTab = (page: Page, name: string) =>
  page.getByRole("tablist", { name: "Program sections" }).getByRole("tab", { name, exact: true });

export async function openProgramTab(page: Page, programId: string, name: string) {
  await page.goto(`/programs/${programId}`);
  await programTab(page, name).click();
}
