import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// "The same period on several days" in a real browser (Slice UI1): three days are scheduled in one step, a second attempt that clashes on one day schedules
// nothing and says so. Axe (WCAG 2.2 A/AA) on the dialog in both themes.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
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

for (const theme of ["dark", "light"] as const) {
  test(`timetable: one period on three days in one step, and a clash schedules nothing (${theme} theme)`, async ({ page, baseURL }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const branch = await seedInstance();
    const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
    await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
    await db.subject.create({ data: { branchId: branch.id, name: "Mathematics", code: "MTH" } });
    await db.staffRecord.create({ data: { branchId: branch.id, firstName: "Amina", lastName: "Bello", category: "TEACHING" } });
    const admin = await createUser({ role: Role.ADMIN, name: "Admin User", superAdmin: false });
    await signInThroughUi(page, admin);
    await page.goto("/timetable");

    await page.getByRole("button", { name: "Same period, several days" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Schedule periods" })).toBeDisabled(); // no day ticked yet
    await expectAccessible(page, `batch dialog (${theme})`);
    for (const day of ["Monday", "Tuesday", "Wednesday"]) await dialog.getByLabel(day).check();
    await dialog.getByRole("button", { name: "Schedule 3 periods" }).click();
    await expect(dialog).not.toBeVisible();
    expect(await db.timetableSlot.count({ where: { branchId: branch.id } })).toBe(3);

    await page.getByRole("button", { name: "Same period, several days" }).click();
    await dialog.getByLabel("Wednesday").check();
    await dialog.getByLabel("Thursday").check();
    await dialog.getByRole("button", { name: "Schedule 2 periods" }).click();
    await expect(dialog.getByText(/Nothing was scheduled/)).toBeVisible();
    expect(await db.timetableSlot.count({ where: { branchId: branch.id } })).toBe(3); // all or none
  });
}
