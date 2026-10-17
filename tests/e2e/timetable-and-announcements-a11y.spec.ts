import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  if (results.violations.length > 0) {
    console.log(
      "AXE VIOLATIONS ON " + what + ":",
      JSON.stringify(
        results.violations.map((v) => ({
          id: v.id,
          help: v.help,
          nodes: v.nodes.map((n) => ({ html: n.html, failureSummary: n.failureSummary })),
        })),
        null,
        2,
      ),
    );
  }
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

test.describe("Slice P3 — Timetable & Announcements Accessibility & Navigation", () => {
  test("renders Timetable canvas, opens period scheduler modal, and passes WCAG 2.2 AA audits", async ({ page }) => {
    const branch = await seedInstance();
    const admin = await createUser({ role: Role.ADMIN, name: "Admin User", superAdmin: false });

    // Seed academic data
    const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
    const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } });
    const subject = await db.subject.create({ data: { branchId: branch.id, name: "Mathematics", code: "MTH" } });
    const staff = await db.staffRecord.create({
      data: { branchId: branch.id, firstName: "Amina", lastName: "Bello", category: "TEACHING" },
    });

    // Seed a slot
    await db.timetableSlot.create({
      data: {
        branchId: branch.id,
        classArmId: arm.id,
        subjectId: subject.id,
        staffRecordId: staff.id,
        dayOfWeek: 1,
        startTime: "08:00",
        endTime: "09:00",
        room: "Lab 1",
      },
    });

    await signInThroughUi(page, admin);
    await page.goto("/timetable");

    await expect(page.getByRole("heading", { name: "Timetable & Scheduling" })).toBeVisible();
    await expect(page.getByText("Mathematics")).toBeVisible();

    // Check accessibility of Timetable canvas
    await expectAccessible(page, "Timetable Canvas");

    // Open Schedule Period modal
    await page.getByRole("button", { name: "+ Schedule Period" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schedule New Timetable Slot" })).toBeVisible();

    // Check accessibility of modal dialog
    await expectAccessible(page, "Schedule New Timetable Slot Dialog");

    // Close modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("renders Announcements feed, opens composer modal, and passes WCAG 2.2 AA audits", async ({ page }) => {
    const branch = await seedInstance();
    const admin = await createUser({ role: Role.ADMIN, name: "Admin User", superAdmin: true });

    // Seed an announcement
    await db.announcement.create({
      data: {
        branchId: branch.id,
        title: "Welcome to New Term",
        body: "Classes resume on Monday prompt at 8:00 AM.",
        authorUserId: admin.id,
        isPinned: true,
      },
    });

    await signInThroughUi(page, admin);
    await page.goto("/announcements");

    await expect(page.getByRole("heading", { name: "Announcements & Broadcasts" })).toBeVisible();
    await expect(page.getByText("Welcome to New Term")).toBeVisible();

    // Check accessibility of announcements feed
    await expectAccessible(page, "Announcements Feed");

    // Open Post Announcement modal
    await page.getByRole("button", { name: "+ Post Announcement" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create New Broadcast Announcement" })).toBeVisible();

    // Check accessibility of composer modal
    await expectAccessible(page, "Announcement Composer Modal");

    // Close modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
