import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";

// Task 0132 on screen (Academics > Classes): a class with no arms offers "Use without arms"; afterwards it shows "none needed" and no arm chip, and Add arm still works (the default arm then shows beside the
// new one, so nobody's pupils vanish). Desktop and phone, axe.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility on ${what}`,
  ).toEqual([]);
}
test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

test("a class with no arms is used without arms: nothing to name, nothing shown as an arm; an arm can still be added", async ({ page }) => {
  const branch = await seedInstance();
  const sup = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Arm Boss" });
  await db.classGroup.create({ data: { branchId: branch.id, name: "Beginner" } });
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  const row = page.getByRole("listitem").filter({ hasText: "Beginner" }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole("list", { name: "Arms of Beginner" })).toHaveCount(0);

  await clickAction(row, "Use Beginner without arms");
  await expect(page.getByText("Beginner is now used without arms: its pupils go straight into the class.")).toBeVisible();
  await expect(row).toContainText("none needed");
  await expect(row.getByRole("list", { name: "Arms of Beginner" })).toHaveCount(0); // the default arm is not shown as an arm
  await expect(row.getByRole("button", { name: "Use Beginner without arms" })).toHaveCount(0);
  await expectAccessible(page, "the classes tab with a class used without arms");
  const arm = await db.classArm.findFirstOrThrow({ where: { classGroup: { name: "Beginner" } } });
  expect([arm.name, arm.isDefault]).toEqual(["_", true]);

  // an arm can still be added: both show, so the pupils of the default arm are not hidden
  await clickAction(row, "Add an arm to Beginner");
  await page.getByRole("dialog").getByLabel("Arm name").fill("A");
  await page.getByRole("dialog").getByRole("button", { name: "Add arm" }).click();
  await expect(page.getByText("Arm A added.")).toBeVisible();
  const arms = row.getByRole("list", { name: "Arms of Beginner" });
  await expect(arms.getByRole("listitem")).toHaveCount(2);
  await expect(arms).toContainText("Whole class");
  await expect(arms).not.toContainText("_");
});
