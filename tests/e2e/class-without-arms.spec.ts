import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { clickAction, signInThroughUi } from "./helpers";
import { INFO_TIPS } from "@/components/ui/info-tips";

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

test("a new class can be made without arms from the dialog's switch (task 0135)", async ({ page }) => {
  const branch = await seedInstance();
  const sup = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Arm Boss" });
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  await page.getByRole("button", { name: "New class" }).click();
  const dialog = page.getByRole("dialog", { name: "New class" });
  await dialog.getByLabel("Class name").fill("Whole School");
  await expectAccessible(page, "the new class dialog with the no-arms switch");
  // the explanation is the info icon beside the switch (not text under it)
  await dialog.locator('[data-info-tip="classes.noArms"]').click();
  await expect(page.getByRole("tooltip")).toHaveText(INFO_TIPS["classes.noArms"]);
  await expect(page.getByRole("tooltip")).toContainText("like JSS 2 rather than JSS 2A and JSS 2B");
  await page.keyboard.press("Escape"); // the tip closes first, the dialog stays
  await expect(dialog).toBeVisible();
  await dialog.getByRole("switch", { name: "This class has no arms" }).click();
  await expect(dialog.getByRole("switch", { name: "This class has no arms" })).toBeChecked();
  await dialog.getByRole("button", { name: "Create class" }).click();
  await expect(page.getByText("Whole School created.")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "Whole School" }).first();
  await expect(row).toContainText("none needed");
  await expect(row.getByRole("list", { name: "Arms of Whole School" })).toHaveCount(0);
  expect((await db.classArm.findFirstOrThrow({ where: { classGroup: { name: "Whole School" } } })).isDefault).toBe(true);

  // without the switch the class has no arm yet and offers "Use without arms"
  await page.getByRole("button", { name: "New class" }).click();
  await page.getByRole("dialog", { name: "New class" }).getByLabel("Class name").fill("Plain Class");
  await page.getByRole("dialog", { name: "New class" }).getByRole("button", { name: "Create class" }).click();
  await expect(page.getByText("Plain Class created.")).toBeVisible();
  expect(await db.classArm.count({ where: { classGroup: { name: "Plain Class" } } })).toBe(0);
});

test("a class that has one arm is converted to no arms after a confirmation, and keeps its class teacher (task 0135)", async ({ page }) => {
  const branch = await seedInstance();
  const sup = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Arm Boss" });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "Advanced" } });
  const staff = await db.staffRecord.create({ data: { branchId: branch.id, category: "TEACHING", firstName: "Aliyu", lastName: "Imam" } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "C", classTeacherId: staff.id } });
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  const row = page.getByRole("listitem").filter({ hasText: "Advanced" }).first();
  await expect(row.getByRole("list", { name: "Arms of Advanced" })).toContainText("C");
  await clickAction(row, "Use Advanced without arms");
  const dialog = page.getByRole("dialog", { name: "Use Advanced without arms?" });
  await expect(dialog).toContainText("stay exactly where they are");
  await expectAccessible(page, "the convert to no arms dialog");
  await dialog.getByRole("button", { name: "Use without arms" }).click();
  await expect(page.getByText("Advanced is now used without arms")).toBeVisible();
  await expect(row).toContainText("none needed");
  await expect(row.getByRole("list", { name: "Arms of Advanced" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Class teacher of Advanced: Aliyu Imam. Change" })).toBeVisible();
  const after = await db.classArm.findUniqueOrThrow({ where: { id: arm.id } });
  expect([after.name, after.isDefault, after.classTeacherId]).toEqual(["_", true, staff.id]);
});

test("a class nothing is connected to is deleted from its menu after a confirmation (task 0135)", async ({ page }) => {
  const branch = await seedInstance();
  const sup = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Arm Boss" });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "TEST" } });
  await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "_", isDefault: true } });
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  const row = page.getByRole("listitem").filter({ hasText: "TEST" }).first();
  await clickAction(row, "Delete TEST");
  const dialog = page.getByRole("dialog", { name: "Delete TEST?" });
  await expectAccessible(page, "the delete class dialog");
  await dialog.getByRole("button", { name: "Delete TEST for good" }).click();
  await expect(page.getByText("TEST deleted.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "TEST" })).toHaveCount(0);
  expect(await db.classGroup.count({ where: { id: group.id } })).toBe(0);
});

test("an empty arm is deleted from its Edit dialog after a confirmation (task 0136)", async ({ page }) => {
  const branch = await seedInstance();
  const sup = await createUser({ role: Role.ADMIN, superAdmin: true, name: "Arm Boss" });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "Nursery 1" } });
  const arms = await Promise.all(
    ["A", "B"].map((name) => db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name } })),
  );
  await signInThroughUi(page, sup);
  await page.goto(`/academics?tab=classes&branch=${branch.id}`);
  const row = page.getByRole("listitem").filter({ hasText: "Nursery 1" }).first();
  await row.getByRole("button", { name: "Edit arm B of Nursery 1" }).click();
  const edit = page.getByRole("dialog", { name: "Edit arm B" });
  await expectAccessible(page, "the edit arm dialog with Delete");
  await edit.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete B of Nursery 1?" });
  await expectAccessible(page, "the delete arm dialog");
  await dialog.getByRole("button", { name: "Delete Nursery 1 B for good" }).click();
  await expect(page.getByText("Nursery 1 B deleted.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Edit arm B of Nursery 1" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Edit arm A of Nursery 1" })).toBeVisible();
  expect(await db.classArm.count({ where: { id: arms[1].id } })).toBe(0);
  expect(await db.classArm.count({ where: { id: arms[0].id } })).toBe(1);
});
