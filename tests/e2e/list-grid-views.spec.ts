import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The list/grid kit on Academics (task 0089): the toggle, the remembered choice, the pager, the tab strip and its margin, and no sideways scroll at any width from a small phone to a wide
// desktop, in both views. Further lists are covered by their own specs and by the width sweep in tests/e2e/responsive-lists.spec.ts as they adopt the kit.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const WIDTHS = [320, 360, 390, 600, 768, 820, 1024, 1280];
const classes = (page: Page) => page.getByRole("list", { name: "Classes" });
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function seed(page: Page, count: number) {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  await db.classGroup.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      branchId: admin.branchId!,
      name: `Class ${String(i + 1).padStart(2, "0")}`,
      sortOrder: i + 1,
    })),
  });
  await db.subject.create({ data: { branchId: admin.branchId!, name: "Mathematics" } });
  await signInThroughUi(page, admin);
  await page.goto("/academics");
  await expect(classes(page)).toBeVisible();
}

test("the view toggle switches Classes between cards and rows, and the choice is remembered per list", async ({ page }) => {
  await seed(page, 14);
  const toggle = page.getByRole("group", { name: "View" });
  await expect(toggle.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true"); // Classes opens as cards
  await expect(classes(page).getByRole("listitem")).toHaveCount(12); // a grid page is 12
  const grid = await classes(page).evaluate((el) => getComputedStyle(el).display);
  expect(grid).toBe("grid");

  await toggle.getByRole("button", { name: "List view" }).click();
  await expect(toggle.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  await expect(classes(page).getByRole("listitem")).toHaveCount(10); // a list page is 10
  expect(await classes(page).evaluate((el) => getComputedStyle(el).display)).toBe("block");

  await page.reload(); // remembered
  await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // another list has its own choice: Subjects opens as rows whatever Classes was set to
  await page.getByRole("tab", { name: "Subjects", exact: true }).click();
  await expect(page.getByRole("group", { name: "View" }).getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the pager: the range, the page numbers, and a change of size keeps the first item on screen", async ({ page, isMobile }) => {
  await seed(page, 30);
  const pager = page.getByRole("navigation", { name: "Pages of classes" });
  await expect(pager).toContainText("Showing 1 to 12 of 30");
  if (isMobile) {
    // Below `sm` the numbered pages are not drawn: a phone has Previous, "Page 1 of 3" and Next.
    await expect(pager).toContainText("Page 1 of 3");
    await pager.getByRole("button", { name: "Next", exact: true }).click();
  } else {
    await pager.getByRole("button", { name: "Go to page 2" }).click();
  }
  await expect(pager).toContainText("Showing 13 to 24 of 30");
  if (!isMobile) await expect(pager.getByRole("button", { name: "Go to page 2" })).toHaveAttribute("aria-current", "page");
  await pager.getByLabel("Per page").selectOption("24");
  await expect(pager).toContainText("Showing 1 to 24 of 30"); // item 13 is still on screen (page 1 of 24 holds it)
  await expect(classes(page).getByRole("listitem").filter({ hasText: "Class 13" })).toHaveCount(1);
});

test("a card keeps every button with its full name, and the facts are numbers with labels", async ({ page }) => {
  await seed(page, 1);
  const card = classes(page).getByRole("listitem").first();
  for (const name of ["Add an arm to Class 01", "Subjects of Class 01", "Rename Class 01", "Archive Class 01"]) {
    await expect(card.getByRole("button", { name })).toBeVisible();
  }
  await expect(card.getByRole("term").filter({ hasText: /^arms$/ })).toBeVisible();
  await expectAccessible(page, "the classes as cards");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "List view" }).click();
  await expectAccessible(page, "the classes as rows");
});

test("the tab strip has a margin above it and keeps every label on one line", async ({ page }) => {
  await seed(page, 2);
  const strip = page.getByRole("tablist", { name: "Academics sections" });
  const header = page.getByText("Classes, subjects, how marks are built and graded").first(); // the text just above the tabs
  const gap = (await strip.boundingBox())!.y - ((await header.boundingBox())!.y + (await header.boundingBox())!.height);
  expect(gap, "space between the page heading's text and the tabs").toBeGreaterThanOrEqual(16);
  for (const tab of await page.getByRole("tab").all()) {
    expect((await tab.boundingBox())!.height, "a tab label does not wrap").toBeLessThan(60);
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

for (const width of WIDTHS) {
  test(`Academics fits ${width}px in both views, on the Classes and Subjects tabs`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, 14);
    const toggle = page.getByRole("group", { name: "View" });
    for (const view of ["Grid view", "List view"]) {
      await toggle.getByRole("button", { name: view }).click();
      await expect(toggle.getByRole("button", { name: view })).toHaveAttribute("aria-pressed", "true");
      expect(await sideways(page), `classes, ${view}`).toBeLessThanOrEqual(0);
    }
    await page.getByRole("tab", { name: "Subjects", exact: true }).click();
    await expect(page.getByRole("list", { name: "Subjects" })).toBeVisible();
    expect(await sideways(page), "subjects").toBeLessThanOrEqual(0);
    await page.getByRole("tab", { name: "Classes", exact: true }).click();
    await toggle.getByRole("button", { name: "Grid view" }).click();
    if (width >= 600) {
      // a tablet has room for more than one card across (container queries, not breakpoints)
      const tops = await classes(page)
        .getByRole("listitem")
        .evaluateAll((items) => items.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(new Set(tops).size, `cards in one row at ${width}px`).toBeLessThan(tops.length);
    }
  });
}
