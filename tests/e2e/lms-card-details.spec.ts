import { test, expect } from "../support/fixtures";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";

// The assignment cards say how many pupils have handed in, and each "Speed Grader" button names its assignment, as every other button on the card does (task 0069). Before, the count
// was never shown (the card read a field the API does not send) and two cards had two buttons that both said only "Speed Grader".

test.afterAll(async () => {
  await resetDatabase();
});

test("each card shows its hand-ins and a Speed Grader button named after its assignment", async ({ page }) => {
  await resetDatabase();
  await seedInstance();
  const branch = await db.branch.findFirstOrThrow();
  const subject = await db.subject.create({ data: { branchId: branch.id, name: "Civic", code: "CIV" } });
  const essay = await db.assignment.create({ data: { branchId: branch.id, subjectId: subject.id, title: "Essay", status: "PUBLISHED" } });
  await db.assignment.create({ data: { branchId: branch.id, subjectId: subject.id, title: "Spelling test", status: "PUBLISHED" } });
  const pupil = await db.studentRecord.create({
    data: {
      branchId: branch.id,
      firstName: "Amina",
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
    },
  });
  await db.assignmentSubmission.create({
    data: { branchId: branch.id, assignmentId: essay.id, studentId: pupil.id, content: "done", status: "SUBMITTED" },
  });

  const admin = await createUser({ role: Role.ADMIN, name: "Card Admin", superAdmin: false });
  await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
  await page.goto("/lms");

  await expect(page.getByText("1 hand-in", { exact: true })).toBeVisible();
  await expect(page.getByText("0 hand-ins", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Speed Grader: Spelling test" })).toBeVisible();
  await page.getByRole("button", { name: "Speed Grader: Essay" }).click();
  await expect(page.getByRole("dialog", { name: "Speed Grader: Essay" })).toBeVisible();
});
