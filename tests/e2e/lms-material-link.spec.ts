import { test, expect } from "../support/fixtures";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";

// The link typed in "Add Material" is saved, shown on the card and shown to the pupil in the portal (task 0065). It used to be dropped: the dialog posted `url`, the route takes `attachments`.

const LINK = "https://school.example/notes/honesty.pdf";

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test("a teacher adds a material with a link: the card opens it, the row holds it, and the pupil sees it in the portal", async ({
  page,
}) => {
  const branch = await db.branch.findFirstOrThrow();
  await db.subject.create({ data: { branchId: branch.id, name: "Civic", code: "CIV" } });
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
    data: {
      studentId: pupil.id,
      branchId: branch.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm.id,
      status: "ACTIVE",
    },
  });

  const admin = await createUser({ role: Role.ADMIN, name: "Coursework Admin", superAdmin: false });
  await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
  await page.goto("/lms");
  await page.getByRole("tab", { name: /Study Materials & Notes/ }).click();
  await page.getByRole("button", { name: "+ Add Material" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Learning Material" });
  await dialog.getByLabel("Material Title").fill("Reading notes: honesty");
  await dialog.getByLabel("Resource Link or Document URL").fill(LINK);
  await dialog.getByLabel("Short Summary / Description").fill("Short notes for the week.");
  await dialog.getByRole("button", { name: "Publish Material" }).click();
  await expect(dialog).toBeHidden();

  // the card opens the link
  await expect(page.getByRole("link", { name: "Open Reading notes: honesty ↗" })).toHaveAttribute("href", LINK);
  await expect(page.getByText("In-app resource")).toHaveCount(0);

  // the row holds it
  const row = await db.learningMaterial.findFirstOrThrow({ where: { title: "Reading notes: honesty" } });
  expect(row.attachments).toEqual([{ title: "Reading notes: honesty", url: LINK }]);

  // a material with no link says it is read in the app
  await page.getByRole("button", { name: "+ Add Material" }).click();
  await dialog.getByLabel("Material Title").fill("Notes without a link");
  await dialog.getByRole("button", { name: "Publish Material" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("In-app resource")).toBeVisible();

  // the pupil sees the link in the portal
  await page.context().clearCookies();
  await page.goto("/portal");
  await page.fill("#admissionNo", "2026/0001");
  await page.fill("#secret", "2013-05-10");
  await page.click("button:has-text('Access Student Portal')");
  await page.click("button[role='tab']:has-text('Coursework (LMS)')");
  await expect(page.getByRole("link", { name: "Open Reading notes: honesty ↗" })).toHaveAttribute("href", LINK);
});
