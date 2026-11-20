import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0125 on screen: New or returning for many pupils at once (the count before the change, then the change), and the pupil row menu where every item, Guardians, Scholarships,
// Fee lines and Access codes included, now has an icon. Desktop and phone, axe on the dialog.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await resetDatabase();
});

async function setUp(page: Page) {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Status Admin" });
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-01-01"), endDate: new Date("2027-12-31"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "Basic 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
  const ids: string[] = [];
  for (const name of ["Alpha", "Bravo"]) {
    const p = await db.studentRecord.create({
      data: {
        branchId: branch.id,
        firstName: name,
        lastName: "Rows",
        gender: "MALE",
        admissionNo: `E2E/BA/${name}/${Date.now() % 100000}`,
      },
    });
    await db.studentEnrollment.create({
      data: {
        studentId: p.id,
        branchId: branch.id,
        sessionId: session.id,
        className: group.name,
        arm: "A",
        classArmId: arm.id,
        status: "ACTIVE",
      },
    });
    ids.push(p.id);
  }
  await signInThroughUi(page, admin);
  return { branch, ids };
}

test("many pupils are marked Returning at once: the count first, then the change; every pupil menu item has an icon", async ({ page }) => {
  const { branch, ids } = await setUp(page);
  await page.goto(`/students?branch=${branch.id}`);
  await page.getByRole("button", { name: "New or returning" }).click();
  const dialog = page.getByRole("dialog", { name: "New or returning, for many pupils" });
  await expect(dialog.getByRole("status")).toHaveText("2 pupils in this choice; 2 would change.");
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  expect((await db.studentRecord.findUniqueOrThrow({ where: { id: ids[0] } })).feeAdmission).toBeNull();

  await dialog.getByRole("button", { name: "Change 2" }).click();
  await expect(page.getByText("2 pupils are now counted as returning.")).toBeVisible();
  expect((await db.studentRecord.findMany({ where: { id: { in: ids } } })).map((p) => p.feeAdmission)).toEqual(["RETURNING", "RETURNING"]);

  await page.getByRole("button", { name: "New or returning" }).click();
  await expect(page.getByRole("dialog", { name: "New or returning, for many pupils" }).getByRole("status")).toHaveText(
    "0 pupils in this choice; 0 would change.",
  );
  await expect(page.getByRole("button", { name: "Nothing to change" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Actions for Alpha Rows" }).click();
  for (const label of ["Guardians", "Scholarships", "Fee lines", "Access codes"]) {
    const item = page.getByRole("button", { name: `${label} of Alpha Rows` });
    await expect(item, label).toBeVisible();
    await expect(item.locator("svg"), `${label} has an icon`).toHaveCount(1);
  }
});
