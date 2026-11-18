import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, seedInstance } from "../support/db";
import { openMenu, signInThroughUi } from "./helpers";

// The list/grid kit on the Students list, the Branches list and a branch's people (task 0089): the page size each had before, the server-paged range, the choice of view remembered per
// list, and every button still there under its full name. The older specs of these screens (students-screen, branch-manage, branches-page, standing-and-payment-rules) hold the
// behaviour; this one holds what the kit adds.
let tag = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(() => {
  tag = `V${Date.now().toString(36).toUpperCase()}`;
});

const view = (page: Page) => page.getByRole("group", { name: "View" });
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("students: 25 to a page in the list, 24 in the grid, the page follows the first pupil on screen, the choice is remembered, every action is reachable", async ({
  page,
}) => {
  const admin = await createUser({ role: Role.ADMIN, superAdmin: false });
  try {
    await db.studentRecord.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        branchId: admin.branchId!,
        firstName: `${tag}P${String(i + 1).padStart(2, "0")}`,
        lastName: "Pupil",
        gender: "MALE" as const,
        admissionNo: `${tag}/${i + 1}`, // no date of birth: it is optional, and the row must not make one up
      })),
    });
    await signInThroughUi(page, admin);
    await page.goto("/students");
    await page.getByLabel("Search students").fill(tag);
    const list = page.getByRole("list", { name: "Students" });
    const pager = page.getByRole("navigation", { name: "Pages of students" });

    // The list is as long as it always was: 25 to a page, asked of the server as the limit.
    await expect(view(page).getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    await expect(pager).toContainText("Showing 1 to 25 of 30");
    await expect(list.getByRole("listitem")).toHaveCount(25);
    await pager.getByRole("button", { name: "Next" }).click();
    await expect(pager).toContainText("Showing 26 to 30 of 30");

    // Switching to the grid (24 to a page) keeps pupil 26 on screen: the page becomes the one that holds it.
    await view(page).getByRole("button", { name: "Grid view" }).click();
    await expect(pager).toContainText("Showing 25 to 30 of 30");
    await expect(list.getByRole("listitem")).toHaveCount(6);
    expect(await list.evaluate((el) => getComputedStyle(el).display)).toBe("grid");

    // One pupil, as a card: both everyday buttons and the Actions list, each under its full name; nothing is shown for a date of birth nobody gave.
    await page.getByLabel("Search students").fill(`${tag}P01`);
    const name = `${tag}P01 Pupil`;
    const card = list.getByRole("listitem");
    await expect(card).toHaveCount(1);
    await expect(card.getByText("No class yet")).toBeVisible();
    await expect(card.getByRole("term").filter({ hasText: /^Born$/ })).toHaveCount(0);
    // Task 0100: every action of the card is behind its one three-dots button, none beside it.
    await expect(card.getByRole("button")).toHaveCount(1);
    await card.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    for (const action of [`Edit ${name}`, `Archive ${name}`, `Standing history of ${name}`]) {
      await expect(page.getByRole("button", { name: action, exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");

    // Remembered for this list after a reload (and the other lists keep their own choice).
    await page.reload();
    await expect(view(page).getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
  } finally {
    await db.studentRecord.deleteMany({ where: { firstName: { startsWith: tag } } });
  }
});

test("branches: a list or a grid, remembered, with the link, the count and both buttons under their names, and no sideways scroll", async ({
  page,
}) => {
  const name = `${tag} A branch with a rather long name that must wrap inside its card and never push the page wider`;
  const branch = await db.branch.create({ data: { name } });
  try {
    await signInThroughUi(page, await createUser({ role: Role.ADMIN }));
    await page.goto("/branches");
    const list = page.getByRole("list", { name: "Branches" });
    await expect(view(page).getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    const card = () => list.getByRole("listitem").filter({ hasText: tag });

    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const choice of ["Grid view", "List view"]) {
        await view(page).getByRole("button", { name: choice }).click();
        await expect(view(page).getByRole("button", { name: choice })).toHaveAttribute("aria-pressed", "true");
        await expect(card().getByRole("link", { name: `${name}, open` })).toBeVisible();
        await openMenu(card(), `Actions for ${name}`);
        await expect(page.getByRole("button", { name: `Rename ${name}` })).toBeVisible();
        await expect(page.getByRole("button", { name: `Delete ${name}` })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(card().getByText("No members yet")).toBeVisible();
        expect(await sideways(page), `${choice} at ${width}px`).toBeLessThanOrEqual(0);
      }
    }

    await view(page).getByRole("button", { name: "Grid view" }).click();
    await page.reload();
    await expect(view(page).getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    expect(await list.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
    // The whole card opens the branch (a stretched link on the name).
    await card()
      .getByRole("link", { name: `${name}, open` })
      .click();
    await expect(page).toHaveURL(new RegExp(`/branches/${branch.id}$`));
  } finally {
    await db.branch.delete({ where: { id: branch.id } });
  }
});

test("a branch's people: ten to a page in the list, the range says where you are, the grid is the person's choice", async ({ page }) => {
  const branch = await db.branch.create({ data: { name: `${tag} Crowded` } });
  const ids: string[] = [];
  for (let i = 1; i <= 11; i++)
    ids.push((await createUser({ role: Role.TEACHING_STAFF, name: `Person ${String(i).padStart(2, "0")} ${tag}` })).id);
  await db.membership.updateMany({ where: { userId: { in: ids } }, data: { branchId: branch.id } });

  await signInThroughUi(page, await createUser({ role: Role.ADMIN }));
  await page.goto(`/branches/${branch.id}`);
  const card = page.getByRole("heading", { level: 2, name: "People in this branch" }).locator("xpath=../..");
  const list = card.getByRole("list", { name: "People in this branch" });
  const pager = page.getByRole("navigation", { name: "Pages of people" });
  await expect(list.getByRole("listitem")).toHaveCount(10);
  await expect(pager).toContainText("Showing 1 to 10 of 11");
  await pager.getByRole("button", { name: "Next" }).click();
  await expect(pager).toContainText("Showing 11 to 11 of 11");
  await expect(list.getByRole("listitem")).toHaveCount(1);

  // The grid holds 12 to a page, so all eleven fit, and the first of them (the one on screen) is among them.
  await card.getByRole("group", { name: "View" }).getByRole("button", { name: "Grid view" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(11);
  expect(await list.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
  await page.reload();
  await expect(card.getByRole("group", { name: "View" }).getByRole("button", { name: "Grid view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(list.getByRole("listitem").filter({ hasText: "Active" })).toHaveCount(11);
});
