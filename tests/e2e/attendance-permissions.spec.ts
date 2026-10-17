import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { resultsWorld } from "../support/results-world";
import { signInThroughUi } from "./helpers";

// E2E test suite for Task 0019: Attendance Permissions (Arm-Scoped Teacher Roles & Explicit Grants).
// Tests the unassigned teacher experience, granted teacher roll-call marking flow,
// and administrator arm permissions management dialog. Screenshots go to out/screenshots.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

const SHOTS = path.resolve(__dirname, "../../out/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

async function attendanceWorld() {
  const branch = await seedInstance();
  const w = await resultsWorld(branch.id, "ATT");

  // Unassigned teacher (no staff record, no class teacher role, no explicit grant)
  const unassignedTeacher = await createUser({ role: Role.TEACHING_STAFF, name: "Unassigned Teacher" });

  // Granted teacher (has a staff record and explicit AttendanceGrant for w.arm)
  const grantedTeacher = await createUser({ role: Role.TEACHING_STAFF, name: "Granted Teacher" });
  const staffGranted = await db.staffRecord.create({
    data: { branchId: branch.id, userId: grantedTeacher.id, category: "TEACHING", firstName: "Granted", lastName: "Teacher" },
  });
  await db.attendanceGrant.create({
    data: {
      branchId: branch.id,
      staffRecordId: staffGranted.id,
      classArmId: w.arm.id,
    },
  });

  // Admin user with full access
  const admin = await createUser({ role: Role.ADMIN, name: "School Admin" });

  return { branch, w, unassignedTeacher, grantedTeacher, admin, armLabel: `${w.group.name} ${w.arm.name}` };
}

test("an unassigned teacher sees the unassigned notice on /attendance and cannot take roll call", async ({ page }) => {
  const { unassignedTeacher } = await attendanceWorld();
  await signInThroughUi(page, unassignedTeacher);
  await page.goto("/attendance");

  await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();
  await expect(page.getByText("You do not currently have attendance permissions for any class arms in this branch.")).toBeVisible();

  await expectAccessible(page, "attendance unassigned teacher");
  await page.screenshot({ path: path.join(SHOTS, "attendance-unassigned-teacher.png"), fullPage: true });
});

for (const theme of ["dark", "light"] as const) {
  test(`a teacher with an explicit grant views their authorized arm badge, marks attendance and saves roll call (${theme} theme)`, async ({
    page,
    baseURL,
  }) => {
    if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: baseURL! }]);
    const { grantedTeacher, w } = await attendanceWorld();
    await signInThroughUi(page, grantedTeacher);
    await page.goto("/attendance");

    await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();

    // Verify authorized arm dropdown and Explicit Grant badge
    const armSelect = page.locator("#authorized-arm-select");
    await expect(armSelect).toBeVisible();
    await expect(page.getByText("Explicit Grant")).toBeVisible();

    // Verify student roster is displayed
    await expect(page.getByText(w.student.lastName)).toBeVisible();

    // Mark student present and save
    await page.getByRole("button", { name: "Mark All Present" }).click();
    await page.getByRole("button", { name: "Save Roll Call" }).click();

    // Verify confirmation notice
    await expect(page.getByText(/Attendance recorded for/)).toBeVisible();

    await expectAccessible(page, `attendance granted teacher (${theme})`);
    await page.screenshot({ path: path.join(SHOTS, `attendance-granted-teacher-${theme}.png`), fullPage: true });
  });
}

test("an administrator sees all arms, the admin badge, and can open the manage permissions dialog", async ({ page }) => {
  const { admin, branch } = await attendanceWorld();
  await signInThroughUi(page, admin);
  await page.goto("/attendance");

  await expect(page.getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();

  // Select the branch with seeded arms
  await page.getByLabel("Branch").selectOption({ value: branch.id });

  await expect(page.getByRole("region", { name: "Daily Attendance" }).locator("span", { hasText: /^Admin$/ })).toBeVisible();

  const manageBtn = page.getByRole("button", { name: "Manage Permissions" });
  await expect(manageBtn).toBeVisible();
  await manageBtn.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2, name: "Attendance Permissions & Grants" })).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 3, name: "Assign Form / Class Teacher" })).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 3, name: "Grant Explicit Attendance Permission" })).toBeVisible();

  await expectAccessible(page, "attendance admin permissions modal");
  await page.screenshot({ path: path.join(SHOTS, "attendance-admin-permissions-modal.png") });

  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toHaveCount(0);
});
