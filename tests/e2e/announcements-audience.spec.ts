import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// The announcement composer offers the branch's class arms as an audience (Slice UI1). The screen used to ask for a route that does not exist (GET /academics/arms),
// so the list was always empty and an announcement could never be aimed at one class.

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test("announcements: a class arm can be chosen as the audience", async ({ page }) => {
  const branch = await seedInstance();
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
  const admin = await createUser({ role: Role.ADMIN, name: "Admin User", superAdmin: false });
  await signInThroughUi(page, admin);
  await page.goto("/announcements");
  await page.getByRole("button", { name: /Post Announcement/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Class Arm (Optional)").getByRole("option", { name: "JSS 1 A" })).toBeAttached();
  await dialog.getByLabel(/Title/).fill("Maths test on Monday");
  await dialog
    .getByLabel(/Message|Body|Content/i)
    .first()
    .fill("Bring your calculators.");
  await dialog.getByLabel("Class Arm (Optional)").selectOption({ label: "JSS 1 A" });
  await dialog
    .getByRole("button", { name: /Post|Publish|Send/i })
    .last()
    .click();
  await expect(page.getByText("Maths test on Monday")).toBeVisible();
  expect((await db.announcement.findFirstOrThrow({ where: { title: "Maths test on Monday" } })).classArmId).toBe(arm.id);
});
