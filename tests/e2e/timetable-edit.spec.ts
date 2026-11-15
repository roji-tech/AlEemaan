import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";
import type { Page } from "@playwright/test";

// Task 0057: the dialog that edits a period was mounted once and its fields start from `useState(initialSlot?.x ?? default)`, which runs only on the first render. So "edit a period" opened
// the form with the FIRST subject, the FIRST teacher, the first arm and 09:00, and pressing Update with only the room changed overwrote the period with them. Found by the product
// walkthrough (a Mathematics period became English Language with another teacher). The period is seeded so that every value differs from the form's defaults.

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

async function seededPeriod() {
  const branch = await seedInstance();
  const admin = await createUser({ role: Role.ADMIN, name: "Admin User", superAdmin: false });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
  await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "A" } }); // the first arm: what the form defaults to
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "B" } });
  await db.subject.create({ data: { branchId: branch.id, name: "English Language", code: "ENG" } }); // the first subject
  const subject = await db.subject.create({ data: { branchId: branch.id, name: "Mathematics", code: "MTH" } });
  await db.staffRecord.create({ data: { branchId: branch.id, firstName: "Amina", lastName: "Bello", category: "TEACHING" } }); // the first teacher
  const teacher = await db.staffRecord.create({
    data: { branchId: branch.id, firstName: "Tunde", lastName: "Cole", category: "TEACHING" },
  });
  const slot = await db.timetableSlot.create({
    data: {
      branchId: branch.id,
      classArmId: arm.id,
      subjectId: subject.id,
      staffRecordId: teacher.id,
      dayOfWeek: 2,
      startTime: "10:00",
      endTime: "10:40",
      room: "Room 1",
    },
  });
  return { admin, arm, subject, teacher, slot };
}

async function openPeriod(page: Page, admin: Awaited<ReturnType<typeof seededPeriod>>["admin"]) {
  await signInThroughUi(page, admin);
  await page.goto("/timetable");
  await expect(page.getByRole("heading", { name: "Timetable & Scheduling" })).toBeVisible();
  await page.getByRole("button").filter({ hasText: "Mathematics" }).click();
  return page.getByRole("dialog", { name: "Edit Timetable Slot" });
}

test("editing a period opens it with its own arm, subject, teacher, times and room", async ({ page }) => {
  const { admin, arm, subject, teacher } = await seededPeriod();
  const dialog = await openPeriod(page, admin);
  await expect(dialog.getByLabel("Class Arm", { exact: true })).toHaveValue(arm.id);
  await expect(dialog.getByLabel("Subject")).toHaveValue(subject.id);
  await expect(dialog.getByLabel("Teacher")).toHaveValue(teacher.id);
  await expect(dialog.getByLabel("Start Time (HH:MM)")).toHaveValue("10:00");
  await expect(dialog.getByLabel("End Time (HH:MM)")).toHaveValue("10:40");
  await expect(dialog.getByLabel("Room / Lab / Location (Optional)")).toHaveValue("Room 1");
});

test("changing only the room of a period leaves everything else about it as it was", async ({ page }) => {
  const { admin, arm, subject, teacher, slot } = await seededPeriod();
  const dialog = await openPeriod(page, admin);
  await dialog.getByLabel("Room / Lab / Location (Optional)").fill("Room 2");
  await dialog.getByRole("button", { name: "Update Slot", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await db.timetableSlot.findUniqueOrThrow({ where: { id: slot.id } })).room).toBe("Room 2");
  const stored = await db.timetableSlot.findUniqueOrThrow({ where: { id: slot.id } });
  expect({
    arm: stored.classArmId,
    subject: stored.subjectId,
    teacher: stored.staffRecordId,
    day: stored.dayOfWeek,
    start: stored.startTime,
    end: stored.endTime,
  }).toEqual({
    arm: arm.id,
    subject: subject.id,
    teacher: teacher.id,
    day: 2,
    start: "10:00",
    end: "10:40",
  });
});
