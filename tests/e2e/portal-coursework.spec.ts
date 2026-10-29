import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { signInThroughUi } from "./helpers";
import { Gender } from "@prisma/client";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test("a pupil hands in work and takes a quiz in the portal", async ({ page }) => {
  const branch = await db.branch.findFirstOrThrow();
  const session = await db.academicSession.create({
    data: { branchId: branch.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: branch.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: branch.id, classGroupId: group.id, name: "Gold" } });
  const pupil = await db.studentRecord.create({
    data: {
      branchId: branch.id,
      firstName: "Amina",
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
      guardianPhone: "+2348011110001",
    },
  });
  await db.studentEnrollment.create({
    data: { studentId: pupil.id, branchId: branch.id, sessionId: session.id, className: "JSS 1", arm: "Gold", classArmId: arm.id, status: "ACTIVE" },
  });
  const subject = await db.subject.create({ data: { branchId: branch.id, name: "Civic", code: "CIV" } });
  await db.assignment.create({
    data: { branchId: branch.id, subjectId: subject.id, title: "Essay on honesty", status: "PUBLISHED", dueDate: new Date(Date.now() + 864e5) },
  });
  const quiz = await db.quiz.create({ data: { branchId: branch.id, subjectId: subject.id, title: "Week 1 quiz", status: "PUBLISHED", passingScore: 50 } });
  await db.quizQuestion.create({
    data: {
      branchId: branch.id,
      quizId: quiz.id,
      prompt: "What is 2+2?",
      questionType: "MULTIPLE_CHOICE",
      options: [
        { id: "A", text: "Three" },
        { id: "B", text: "Four" },
      ],
      correctAnswer: "B",
    },
  });

  await page.goto("/portal");
  await page.fill("#admissionNo", "2026/0001");
  await page.fill("#secret", "2013-05-10"); // the date of birth: the pupil signs in, who may hand in work and take quizzes
  await page.click("button:has-text('Access Student Portal')");
  await page.click("button[role='tab']:has-text('Coursework (LMS)')");

  // Hand in.
  await page.getByRole("button", { name: "Hand in: Essay on honesty" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);
  await dialog.getByLabel("Your answer").fill("Honesty is the best policy.");
  await dialog.getByRole("button", { name: "Hand in", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("SUBMITTED")).toBeVisible();
  expect(await db.assignmentSubmission.count({ where: { studentId: pupil.id } })).toBe(1);

  // Take the quiz: the right answer passes.
  await page.getByRole("button", { name: "Start: Week 1 quiz" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Four").check();
  await dialog.getByRole("button", { name: "Submit quiz" }).click();
  await expect(dialog.getByText("Passed")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("last score 100%")).toBeVisible();
});

test("a teacher sees the create button; a student is pointed to the portal instead", async ({ page }) => {
  const branch = await db.branch.findFirstOrThrow();
  const subject = await db.subject.create({ data: { branchId: branch.id, name: "Civic", code: "CIV" } });
  await db.assignment.create({ data: { branchId: branch.id, subjectId: subject.id, title: "Essay", status: "PUBLISHED" } });
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Tee Cher", superAdmin: false });
  await signInThroughUi(page, teacher);
  await page.goto("/lms");
  await expect(page.getByRole("button", { name: "+ Create Assignment" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hand in on the portal" })).toHaveCount(0);

  await page.context().clearCookies();
  const student = await createUser({ role: Role.STUDENT, name: "Stu Dent", superAdmin: false });
  await signInThroughUi(page, student);
  await page.goto("/lms");
  await expect(page.getByRole("button", { name: "+ Create Assignment" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Hand in on the portal" })).toBeVisible();
});
