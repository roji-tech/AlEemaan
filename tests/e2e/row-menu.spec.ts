import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0100, the maintainer's screenshots of 2026-11-18: the three-dots menu of a row, the rows themselves at the widths they were seen at (850 px squeezed a pupil's name into a column
// of letters while the row had room), the open list drawn UNDER the buttons of the next row, a dropdown in colours nobody could read, terms squeezed into a narrow column, and a dialog
// title where the name did not stand out. Every claim is measured in a real browser at a phone, the 850 px of the report and a desktop width.

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const SIZES = [
  { width: 360, height: 760 },
  { width: 850, height: 900 },
  { width: 1280, height: 800 },
];
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/// Is every button of an open list the topmost thing at its own centre (nothing from another row drawn over it), and is the whole list on the screen?
async function listIsUsable(menu: Locator) {
  return menu.evaluate((ul) => {
    const box = ul.getBoundingClientRect();
    const onScreen = box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight;
    // The list scrolls inside itself once it is longer than its cap (task 0122 added Fee lines and Access codes), so each button is scrolled into view before it is tested: what matters is that
    // nothing from another row is drawn over it when it is reached.
    const covered = [...ul.querySelectorAll("button")]
      .filter((button) => {
        button.scrollIntoView({ block: "nearest" });
        const r = button.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(top && button.contains(top));
      })
      .map((button) => button.textContent ?? "");
    return { onScreen, covered, items: ul.querySelectorAll("button").length };
  });
}

/// The list a three-dots button opened (its `aria-controls`).
const menuOf = async (page: Page, trigger: Locator) => page.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);

for (const size of SIZES) {
  test(`students at ${size.width} px: the name keeps its room, a row is one three-dots button, and its open list is on top of everything and on the screen`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "sized by the test itself");
    const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
    await db.studentRecord.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        branchId: admin.branchId!,
        firstName: "Abdulhakeem",
        lastName: `Abdulsalaam${i}`,
        gender: "MALE" as const,
        admissionNo: `2026/${String(i + 11).padStart(4, "0")}`,
      })),
    });
    await page.setViewportSize(size);
    await signInThroughUi(page, admin);
    await page.goto("/students");
    // Direct children only: an open menu's items are list items too, and "the last row" must never mean "the last menu item".
    const rows = page.getByRole("list", { name: "Students" }).locator(":scope > li");
    await expect(rows).toHaveCount(8);

    // Nothing scrolls sideways, and the name is not squeezed: a name this long fits on at most two lines, never a column of letters.
    expect(await sideways(page)).toBeLessThanOrEqual(0);
    const name = rows.first().locator("p").first();
    const box = (await name.boundingBox())!;
    expect(box.width, "the name's width").toBeGreaterThan(size.width >= 800 ? 220 : 150);
    expect(box.height, "the name wraps to at most two lines").toBeLessThan(60);

    // Every action of the row is behind ONE button; none is drawn beside it.
    await expect(rows.first().getByRole("button")).toHaveCount(1);
    const first = rows.first().getByRole("button", { name: /^Actions for / });
    await first.click();
    const menu = await menuOf(page, first);
    await expect(menu.getByRole("button", { name: /^Edit Abdulhakeem Abdulsalaam0$/ })).toBeVisible();
    await expect(menu.getByRole("button", { name: /^Archive / })).toBeVisible();
    const open = await listIsUsable(menu);
    expect(open.items).toBeGreaterThanOrEqual(4);
    expect(open.covered, "buttons of this list that something else is drawn over").toEqual([]);
    expect(open.onScreen, "the whole list is on the screen").toBe(true);

    // Keyboard: focus is in the list, Down moves, Escape closes and puts focus back on the three dots.
    await expect(menu.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("button").nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(first).toBeFocused();

    // The last row, scrolled to the bottom edge: the list opens upward when there is no room below, and is still on top and on the screen.
    const last = rows.last().getByRole("button", { name: /^Actions for / });
    await last.scrollIntoViewIfNeeded();
    await last.click();
    const lastMenu = await menuOf(page, last);
    const end = await listIsUsable(lastMenu);
    expect(end.covered).toEqual([]);
    expect(end.onScreen, "the last row's list is on the screen").toBe(true);
    await page.keyboard.press("Escape");

    // A dialog the menu opens: "Edit" in the quiet colour, the name apart from it; the accessible name is the same text as ever.
    await first.click();
    await clickAction(rows.first(), /^Edit Abdulhakeem Abdulsalaam0$/);
    const heading = page.getByRole("dialog").getByRole("heading", { name: "Edit Abdulhakeem Abdulsalaam0" });
    await expect(heading).toBeVisible();
    const colours = await heading.locator("span").evaluateAll((spans) => spans.map((s) => getComputedStyle(s).color));
    expect(colours).toHaveLength(2);
    expect(colours[0], "the action and the name are told apart").not.toBe(colours[1]);
  });
}

test("a session at three widths: its terms are cards across the whole width, each with one three-dots button; nothing scrolls sideways", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "sized by the test itself");
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  const make = (ordinal: number, label: string, start: string, end: string, current: boolean) => ({
    branchId: admin.branchId!,
    kind: "TERM" as const,
    ordinal,
    label,
    startDate: new Date(start),
    endDate: new Date(end),
    isCurrent: current,
  });
  await db.academicSession.create({
    data: {
      branchId: admin.branchId!,
      label: "2026/2027",
      startDate: new Date("2026-09-13"),
      endDate: new Date("2027-07-31"),
      status: "ACTIVE",
      periods: {
        create: [
          make(1, "1st Term", "2026-09-13", "2026-12-28", true),
          make(2, "2nd Term", "2026-12-29", "2027-04-14", false),
          make(3, "3rd Term", "2027-04-15", "2027-07-31", false),
        ],
      },
    },
  });
  await signInThroughUi(page, admin);
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.goto("/academics?tab=sessions");
    const terms = page.getByRole("list", { name: "Terms of 2026/2027" });
    await expect(terms.locator(":scope > li")).toHaveCount(3);
    expect(await sideways(page), `${size.width}px scrolls sideways`).toBeLessThanOrEqual(0);
    const widths = await terms.locator(":scope > li").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));
    for (const width of widths)
      expect(width, `a term card at ${size.width}px is not squeezed`).toBeGreaterThan(Math.min(size.width - 80, 220));
    await expect(page.getByRole("button", { name: "Actions for the 2nd Term of 2026/2027", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Actions for 2026/2027", exact: true })).toBeVisible();
  }
});

test("the branch dropdown is ours: readable colours, the branch you are on ticked, the list on the screen, a pick switches the page, Escape closes", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "sized by the test itself");
  const superAdmin = await createUser({ role: Role.ADMIN, superAdmin: true });
  await signInThroughUi(page, superAdmin);
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.goto("/students");
    const trigger = page.getByRole("button", { name: "Switch branch" });
    await trigger.click();
    const menu = await menuOf(page, trigger);
    const branches = menu.getByRole("button");
    expect(await branches.count()).toBeGreaterThanOrEqual(2);
    await expect(menu.locator('[aria-current="true"]')).toHaveCount(1);
    const state = await listIsUsable(menu);
    expect(state.covered).toEqual([]);
    expect(state.onScreen, `the list is on the screen at ${size.width}px`).toBe(true);
    // Text on the list's own background: at least the 4.5 : 1 of WCAG AA (any CSS colour syntax, read back through a canvas).
    const contrast = await menu.evaluate((ul) => {
      const toRgb = (css: string) => {
        const c = document.createElement("canvas").getContext("2d")!;
        c.fillStyle = "#000";
        c.fillStyle = css;
        c.fillRect(0, 0, 1, 1);
        const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
        return [r!, g!, b!];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const background = toRgb(getComputedStyle(ul).backgroundColor);
      return [...ul.querySelectorAll("button")].map((button) => {
        const [hi, lo] = [lum(toRgb(getComputedStyle(button).color)), lum(background)].sort((a, b) => b - a);
        return (hi! + 0.05) / (lo! + 0.05);
      });
    });
    for (const ratio of contrast) expect(ratio, `contrast of a branch name at ${size.width}px`).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
  // Picking another branch changes the page.
  await page.setViewportSize(SIZES[2]!);
  await page.goto("/students");
  const before = await page.getByTestId("current-branch").textContent();
  const trigger = page.getByRole("button", { name: "Switch branch" });
  await trigger.click();
  const menu = await menuOf(page, trigger);
  await menu.getByRole("button").filter({ hasNotText: before! }).first().click();
  await expect(page.getByTestId("current-branch")).not.toHaveText(before!);
});

test("Add pupils in bulk: the branch can be switched in the dialog until rows are loaded, and the dialog follows", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "sized by the test itself");
  const superAdmin = await createUser({ role: Role.ADMIN, superAdmin: true });
  await signInThroughUi(page, superAdmin);
  await page.goto("/students");
  const first = await page.getByTestId("current-branch").first().textContent();
  await page.getByRole("button", { name: "Add many" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`Into ${first}.`)).toBeVisible();
  const trigger = dialog.getByRole("button", { name: "Switch branch" });
  await trigger.click();
  const menu = await menuOf(page, trigger);
  await menu.getByRole("button").filter({ hasNotText: first! }).first().click();
  await expect(dialog.getByText(`Into ${first}.`)).toHaveCount(0);
  await expect(dialog.getByText(/^Into .+\. Nothing is saved/)).toBeVisible();
  // Once the grid has rows the branch is fixed again: no switch.
  await dialog.getByRole("button", { name: "Type or paste rows instead" }).click();
  await expect(dialog.getByRole("button", { name: "Switch branch" })).toHaveCount(0);
});

// ---- Task 0105: cards that read at a glance ----

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// The browser's own calendar day (the page reads "today" as the viewer's local day), not the UTC date: they differ for an hour or two every night in a time zone east of Greenwich.
const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
async function violations(page: Page, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG);
  const results = await (within ? builder.include(within) : builder).analyze();
  return results.violations.map(
    (v) =>
      `${v.id} [${v.impact}]: ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
}

for (const theme of ["dark", "light"] as const) {
  test(`a session card (${theme}): the timeline says where the year stands, each term wears the colour of its state, and nothing fails contrast`, async ({
    page,
    isMobile,
    baseURL,
  }) => {
    test.skip(isMobile, "sized by the test itself");
    await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
    const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
    // Dates relative to today so the test never goes stale: the first term is over, the second is the current one, the third is to come.
    const make = (ordinal: number, label: string, from: number, to: number, current: boolean) => ({
      branchId: admin.branchId!,
      kind: "TERM" as const,
      ordinal,
      label,
      startDate: new Date(isoDay(from)),
      endDate: new Date(isoDay(to)),
      isCurrent: current,
    });
    const session = await db.academicSession.create({
      data: {
        branchId: admin.branchId!,
        label: "2026/2027",
        startDate: new Date(isoDay(-120)),
        endDate: new Date(isoDay(150)),
        status: "ACTIVE",
        periods: {
          create: [make(1, "1st Term", -120, -31, false), make(2, "2nd Term", -30, 59, true), make(3, "3rd Term", 60, 150, false)],
        },
      },
      include: { periods: true },
    });
    const second = session.periods.find((p) => p.ordinal === 2)!;
    await db.academicBreak.create({
      data: {
        branchId: admin.branchId!,
        periodId: second.id,
        label: "Mid-term break",
        startDate: new Date(isoDay(10)),
        endDate: new Date(isoDay(14)),
      },
    });
    await signInThroughUi(page, admin);

    for (const size of [SIZES[0]!, SIZES[1]!, SIZES[2]!]) {
      await page.setViewportSize(size);
      await page.goto("/academics?tab=sessions");
      const terms = page.getByRole("list", { name: "Terms of 2026/2027" });
      await expect(terms.locator(":scope > li")).toHaveCount(3);

      // The one sentence: the current term, today's day of it, and the days left, in words.
      await expect(page.getByText(/^2nd Term, day 31 of 90, 59 days left\.$/)).toBeVisible();

      // One bar: three segments and the progress laid over the current one (four shapes), drawn as SVG (no inline style, which the page's content policy refuses).
      await expect(page.locator("svg.h-2\\.5 rect")).toHaveCount(4);

      // Each term says its state in words, and the three states are three different colours.
      const chip = (term: string, word: string) => terms.locator(":scope > li").filter({ hasText: term }).getByText(word, { exact: true });
      await expect(chip("1st Term", "Ended")).toBeVisible();
      await expect(chip("2nd Term", "Current")).toBeVisible();
      await expect(chip("3rd Term", "Upcoming")).toBeVisible();
      const colours = await Promise.all(
        [chip("1st Term", "Ended"), chip("2nd Term", "Current"), chip("3rd Term", "Upcoming")].map((c) =>
          c.evaluate((el) => `${getComputedStyle(el).color}|${getComputedStyle(el).backgroundColor}`),
        ),
      );
      expect(new Set(colours).size, "Ended, Current and Upcoming are drawn in three different colours").toBe(3);

      // The break is its own block in the warning tone, with its own three dots.
      const breaks = page.getByRole("list", { name: "Breaks in the 2nd Term of 2026/2027" });
      await expect(breaks.getByText("Mid-term break")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Actions for Mid-term break in the 2nd Term of 2026/2027", exact: true }),
      ).toBeVisible();

      expect(await sideways(page), `${size.width}px scrolls sideways`).toBeLessThanOrEqual(0);
      expect(await violations(page), `accessibility of the session card at ${size.width}px (${theme})`).toEqual([]);
    }
  });

  test(`a class card (${theme}): arms, subjects and pupils are tinted chips, an arm is one 44 px button, the menu's items carry their own colour, and nothing fails contrast`, async ({
    page,
    isMobile,
    baseURL,
  }) => {
    test.skip(isMobile, "sized by the test itself");
    await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
    const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
    const group = await db.classGroup.create({ data: { branchId: admin.branchId!, name: "Nursery 1" } });
    for (const arm of ["A", "B"]) await db.classArm.create({ data: { branchId: admin.branchId!, classGroupId: group.id, name: arm } });
    await signInThroughUi(page, admin);
    await page.setViewportSize(SIZES[0]!);
    await page.goto("/academics?tab=classes");
    await page.getByRole("button", { name: "List view" }).click();
    const card = page.getByRole("list", { name: "Classes" }).locator(":scope > li").first();
    await expect(card).toBeVisible();

    // Each arm is ONE button, as tall as a finger, named as it always was; the three numbers are three colours.
    const arm = card.getByRole("button", { name: "Edit arm A of Nursery 1", exact: true });
    expect((await arm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const stat = (word: string) => card.locator("dl > div").filter({ hasText: word }).first();
    const tones = await Promise.all(
      [stat("arm"), stat("subject"), stat("pupil")].map((d) =>
        d
          .locator("span")
          .first()
          .evaluate((el) => getComputedStyle(el).color),
      ),
    );
    expect(new Set(tones).size, "arms, subjects and pupils are three different colours").toBe(3);

    // The menu: Edit and Archive each have a tinted tile with an icon, in different colours.
    const trigger = card.getByRole("button", { name: /^Actions for / });
    await trigger.click();
    const menu = await menuOf(page, trigger);
    const tile = (name: RegExp) => menu.getByRole("button", { name }).locator("span[aria-hidden]").first();
    await expect(tile(/^Rename Nursery 1$/)).toBeVisible();
    await expect(tile(/^Archive Nursery 1$/)).toBeVisible();
    const backgrounds = await Promise.all(
      [tile(/^Rename Nursery 1$/), tile(/^Archive Nursery 1$/), tile(/^Add an arm to Nursery 1$/)].map((t) =>
        t.evaluate((el) => getComputedStyle(el).backgroundColor),
      ),
    );
    expect(new Set(backgrounds).size, "Edit, Archive and Add are three different tile colours").toBe(3);
    expect(
      await violations(page, `[id="${await trigger.getAttribute("aria-controls")}"]`),
      `accessibility of an open menu (${theme})`,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    expect(await violations(page), `accessibility of the class card (${theme})`).toEqual([]);
  });
}
