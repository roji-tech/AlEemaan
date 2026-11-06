import { test, expect } from "../support/fixtures";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { seedProgram, day } from "../support/programs-seed";
import { expectAccessible, expectFits, openProgramTab, programTab } from "./program-helpers";
import { signInThroughUi } from "./helpers";

// Programs, slice P3b (task 0043, section 8.11): assessments as a person sees and uses them, on a desktop and a phone, in both themes. What the API allows is tested in
// tests/api/program-assessments.spec.ts; here is what the screens offer, say and do, and that nobody is shown a button they cannot use.

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.afterAll(async () => {
  await resetDatabase();
});

/// A world with assessments switched on for the program, Amina and Binta in it, a teacher of Juz A, and one assessment out of 40 (open, for the whole program, today).
async function world(status: "DRAFT" | "OPEN" | "MARKED" | "PUBLISHED" = "OPEN", withScores = false) {
  const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
  const seed = await seedProgram(sa.id, { both: true });
  await db.program.update({ where: { id: seed.program.id }, data: { assessmentsEnabled: true } });
  const aminaPlace = await seed.join(seed.amina, seed.first.id, seed.group1.id);
  const bintaPlace = await seed.join(seed.binta, seed.first.id, seed.group1.id);
  const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
  await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
  const assessment = await db.programAssessment.create({
    data: {
      programId: seed.program.id,
      title: "Monthly test",
      kind: "Test",
      date: new Date(`${day(0)}T00:00:00Z`),
      maxScore: 40,
      passMark: 20,
      weight: 1,
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      createdByUserId: sa.id,
    },
  });
  if (withScores)
    for (const [place, score] of [
      [aminaPlace, 30],
      [bintaPlace, 15],
    ] as const)
      await db.programScore.create({
        data: {
          assessmentId: assessment.id,
          programId: seed.program.id,
          participantId: place.id,
          branchId: seed.first.id,
          score,
          markedByUserId: sa.id,
        },
      });
  return { sa, seed, teacher, assessment, aminaPlace, bintaPlace };
}

const openSheet = async (page: import("@playwright/test").Page, title = "Monthly test") => {
  await page.getByRole("button", { name: `Open ${title}` }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();
};

test.describe("a super admin", () => {
  test("makes an assessment as a draft, opens it for scores, and sees its status", async ({ page }) => {
    const { sa, seed } = await world("OPEN");
    await db.programAssessment.deleteMany();
    await signInThroughUi(page, sa);
    await openProgramTab(page, seed.program.id, "Assessments");
    await expect(page.getByText("There is no assessment to show yet.")).toBeVisible();
    await page.getByRole("button", { name: "New assessment" }).click();
    const dialog = page.getByRole("dialog", { name: "New assessment" });
    await dialog.getByLabel("Title").fill("Recitation check");
    await dialog.getByLabel("Kind").fill("Recitation");
    await dialog.getByLabel("Out of").fill("20");
    await dialog.getByLabel("Pass mark").fill("10");
    await dialog.getByLabel("Juz A", { exact: true }).check();
    await dialog.getByRole("button", { name: "Make assessment" }).click();
    await expect(page.getByText("The assessment was made as a draft.")).toBeVisible();
    const row = page.getByRole("list", { name: "Assessments" }).getByRole("listitem").filter({ hasText: "Recitation check" });
    await expect(row).toContainText("Draft");
    await expect(row).toContainText("out of 20 · pass mark 10");
    await expect(row).toContainText("Juz A");
    await openSheet(page, "Recitation check");
    await page.getByRole("button", { name: "Open for scores" }).click();
    await expect(page.getByText("The assessment is open for scores.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open for scores" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark as complete" })).toBeVisible();
    // a field that cannot be right is said next to it
    await page.getByRole("button", { name: "Back to the assessments" }).click();
    await page.getByRole("button", { name: "New assessment" }).click();
    const again = page.getByRole("dialog", { name: "New assessment" });
    await again.getByLabel("Title").fill("Too big");
    await again.getByLabel("Out of").fill("5000");
    await again.getByRole("button", { name: "Make assessment" }).click();
    await expect(again.getByText(/at most 1000|can be at most/)).toBeVisible();
  });

  test("marks, publishes and then corrects a published score only with a reason; reads the results with the grades", async ({ page }) => {
    const { sa, seed, assessment } = await world("OPEN", true);
    await db.program.update({
      where: { id: seed.program.id },
      data: {
        gradeBands: [
          { name: "Fail", from: 0 },
          { name: "Good", from: 60 },
        ],
      },
    });
    await signInThroughUi(page, sa);
    await openProgramTab(page, seed.program.id, "Assessments");
    await openSheet(page);
    await expect(page.getByText("2 to score · 2 entered")).toBeVisible();
    await page.getByRole("button", { name: "Mark as complete" }).click();
    await expect(page.getByText("The assessment is marked complete.")).toBeVisible();
    await page.getByRole("button", { name: "Publish results" }).click();
    const ask = page.getByRole("dialog", { name: "Publish results?" });
    await expect(ask).toContainText("Only a program admin can change a score after that");
    await ask.getByRole("button", { name: "Publish results" }).click();
    await expect(page.getByText("The results are published.")).toBeVisible();

    // a published score needs a reason
    await page.getByLabel("Score for Binta Musa").fill("25");
    await expect(page.getByLabel("Why is a published score being changed?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save scores" })).toBeDisabled();
    await page.getByLabel("Why is a published score being changed?").fill("Recounted the paper");
    await page.getByRole("button", { name: "Save scores" }).click();
    await expect(page.getByText("Saved: 0 entered, 1 changed.")).toBeVisible();
    await page.getByRole("button", { name: "Score history of Binta Musa" }).click();
    const history = page.getByRole("dialog", { name: "Score history of Binta Musa" });
    await expect(history.getByText(/changed 15 to 25 \(Recounted the paper\)/)).toBeVisible();
    await history.getByRole("button", { name: "Close" }).last().click();

    await page.getByRole("button", { name: "Back to the assessments" }).click();
    await page.getByRole("tab", { name: "Results" }).click();
    const results = page.getByRole("list", { name: "Results" });
    await expect(results.getByRole("listitem").filter({ hasText: "Amina Musa" })).toContainText("75% · Good");
    await expect(results.getByRole("listitem").filter({ hasText: "Binta Musa" })).toContainText("62.5% · Good");
    expect(assessment.id).toBeTruthy();
  });

  test("turns assessments on for the program and gives it grades in Settings; the tab appears", async ({ page }) => {
    const { sa, seed } = await world("OPEN");
    await db.program.update({ where: { id: seed.program.id }, data: { assessmentsEnabled: false } });
    await signInThroughUi(page, sa);
    await page.goto(`/programs/${seed.program.id}`);
    await expect(programTab(page, "Assessments")).toHaveCount(0);
    await programTab(page, "Settings").click();
    await expect(page.getByTestId("assessments-state")).toContainText("switched off for this program");
    await page.getByLabel("Use assessments in this program").check();
    await page.getByRole("button", { name: "Add a grade" }).click();
    await page.getByLabel("Grade 1 name").fill("Fail");
    await page.getByLabel("Grade 1 from (%)").fill("0");
    await expect(page.getByRole("button", { name: "Save settings" })).toBeEnabled();
    await page.getByRole("button", { name: "Add a grade" }).click();
    await page.getByLabel("Grade 2 name").fill("Fail");
    await page.getByLabel("Grade 2 from (%)").fill("50");
    await expect(page.getByText("Each grade needs a different name.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
    await page.getByLabel("Grade 2 name").fill("Pass");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("The settings were saved.")).toBeVisible();
    await expect(programTab(page, "Assessments")).toBeVisible();
    expect((await db.program.findFirstOrThrow()).gradeBands).toEqual([
      { name: "Fail", from: 0 },
      { name: "Pass", from: 50 },
    ]);
  });
});

test.describe("a teacher", () => {
  test("enters scores and results for the people of their groups, corrects one, and reads its history", async ({ page }) => {
    const { teacher, seed } = await world("OPEN");
    await signInThroughUi(page, teacher);
    await openProgramTab(page, seed.program.id, "Assessments");
    await expect(page.getByRole("button", { name: "New assessment" })).toHaveCount(0);
    await openSheet(page);
    await expect(page.getByRole("button", { name: "Mark as complete" })).toHaveCount(0);
    await expect(page.getByText("Nothing to save.")).toBeVisible();

    await page.getByLabel("Score for Amina Musa").fill("41");
    await expect(page.getByText("A score can't be above the maximum of 40.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save scores" })).toBeDisabled();
    await page.getByLabel("Score for Amina Musa").fill("30,5");
    await page.getByLabel("Result for Binta Musa").selectOption({ label: "Absent" });
    await expect(page.getByLabel("Score for Binta Musa")).toBeDisabled();
    await page.getByRole("button", { name: "Add a comment for Amina Musa" }).click();
    await page.getByLabel("Comment for Amina Musa").fill("Good recitation");
    await expect(page.getByText("2 to save.")).toBeVisible();
    await page.getByRole("button", { name: "Save scores" }).click();
    await expect(page.getByText("Saved: 2 entered, 0 changed.")).toBeVisible();
    await expect(page.getByText("30.5 · 76.3% · Passed · entered by Hafsat Ali")).toBeVisible();
    await expect(page.getByText("Comment: Good recitation")).toBeVisible();
    await expect(page.getByText("2 to score · 2 entered")).toBeVisible();

    await page.getByLabel("Score for Amina Musa").fill("32");
    await page.getByRole("button", { name: "Save scores" }).click();
    await expect(page.getByText("Saved: 0 entered, 1 changed.")).toBeVisible();
    await expect(page.getByText("changed 1 time")).toBeVisible();
    await page.getByRole("button", { name: "Score history of Amina Musa" }).click();
    const history = page.getByRole("dialog", { name: "Score history of Amina Musa" });
    await expect(history.getByText(/changed 30.5 to 32/)).toBeVisible();
    await expect(history.getByText(/entered 30.5/)).toBeVisible();
  });

  test("a suspended person is not sitting; a draft is invisible; once marked the sheet is read only", async ({ page }) => {
    const { teacher, seed, assessment, sa } = await world("OPEN");
    await db.programParticipant.create({
      data: {
        programId: seed.program.id,
        kind: "CHILD",
        firstName: "Zainab",
        lastName: "Abubakar",
        dateOfBirth: new Date("2020-03-04"),
        guardianName: "Hauwa",
        guardianPhone: "08031234567",
        branchId: seed.first.id,
        groupId: seed.group1.id,
        joinedOn: new Date(`${day(-30)}T00:00:00Z`),
        createdByUserId: sa.id,
        standing: "SUSPENDED",
        standingUntil: new Date(`${day(5)}T00:00:00Z`),
      },
    });
    await signInThroughUi(page, teacher);
    await openProgramTab(page, seed.program.id, "Assessments");
    await expect(page.getByRole("list", { name: "Assessments" }).getByRole("listitem")).toHaveCount(1);
    await openSheet(page);
    await expect(page.getByText("Not sitting (suspended)")).toBeVisible();
    await expect(page.getByLabel("Score for Zainab Abubakar")).toHaveCount(0);
    await expect(page.getByLabel("Score for Amina Musa")).toBeVisible();
    await page.getByRole("button", { name: "Back to the assessments" }).click();

    await db.programAssessment.create({
      data: {
        programId: seed.program.id,
        title: "Hidden draft",
        date: new Date(`${day(0)}T00:00:00Z`),
        maxScore: 10,
        createdByUserId: sa.id,
      },
    });
    await page.reload();
    await programTab(page, "Assessments").click();
    await expect(page.getByText("Hidden draft")).toHaveCount(0);
    await db.programAssessment.update({ where: { id: assessment.id }, data: { status: "MARKED" } });
    await page.reload();
    await programTab(page, "Assessments").click();
    await openSheet(page);
    await expect(page.getByRole("button", { name: "Save scores" })).toHaveCount(0);
    await expect(page.getByLabel("Score for Amina Musa")).toHaveCount(0);
  });

  test("with no group there is no Assessments tab", async ({ page }) => {
    const { seed } = await world("OPEN");
    const loner = await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" });
    await seed.name(loner.id, "TEACHER");
    await signInThroughUi(page, loner);
    await page.goto(`/programs/${seed.program.id}`);
    await expect(programTab(page, "Overview")).toBeVisible();
    await expect(programTab(page, "Assessments")).toHaveCount(0);
  });
});

test.describe("who is shown what", () => {
  test("a branch administrator reads the sheet of their own branch's people and cannot enter anything", async ({ page }) => {
    const { seed } = await world("OPEN", true);
    await db.programParticipant.create({
      data: {
        programId: seed.program.id,
        kind: "STUDENT",
        studentId: seed.cara.id,
        branchId: seed.second.id,
        groupId: seed.group1.id,
        joinedOn: new Date(`${day(-30)}T00:00:00Z`),
        createdByUserId: seed.program.createdByUserId,
      },
    });
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" }));
    await openProgramTab(page, seed.program.id, "Assessments");
    await openSheet(page);
    await expect(page.getByText("Amina Musa")).toBeVisible();
    await expect(page.getByText("Cara Musa")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save scores" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark as complete" })).toHaveCount(0);
    await expect(page.getByLabel("Score for Amina Musa")).toHaveCount(0);
    await expect(programTab(page, "Settings")).toHaveCount(0);
  });
});

test.describe("accessible and fits the width, in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} theme: the list, a dialog, the score sheet, its history and the results`, async ({ page, context }) => {
      const { sa, seed } = await world("OPEN", true);
      await db.program.update({
        where: { id: seed.program.id },
        data: {
          gradeBands: [
            { name: "Fail", from: 0 },
            { name: "Good", from: 60 },
          ],
        },
      });
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await signInThroughUi(page, sa);
      await openProgramTab(page, seed.program.id, "Assessments");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectAccessible(page, `${theme} list`);
      await expectFits(page, `${theme} list`);
      await page.getByRole("button", { name: "New assessment" }).click();
      await expect(page.getByRole("dialog", { name: "New assessment" })).toBeVisible();
      await expectAccessible(page, `${theme} new assessment`);
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await openSheet(page);
      await page.getByRole("button", { name: "Add a comment for Amina Musa" }).click();
      await page.getByLabel("Score for Binta Musa").fill("99");
      await expectAccessible(page, `${theme} sheet`);
      await expectFits(page, `${theme} sheet`);
      await page.getByLabel("Score for Binta Musa").fill("20");
      await page.getByRole("button", { name: "Score history of Amina Musa" }).click();
      await expect(page.getByRole("dialog", { name: "Score history of Amina Musa" })).toBeVisible();
      await expectAccessible(page, `${theme} history`);
      await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();
      await page.getByRole("button", { name: "Back to the assessments" }).click();
      await db.programAssessment.updateMany({ data: { status: "PUBLISHED", publishedAt: new Date() } }); // the results list only holds what has been published
      await page.getByRole("tab", { name: "Results" }).click();
      await expect(page.getByRole("list", { name: "Results" })).toBeVisible();
      await expectAccessible(page, `${theme} results`);
      await expectFits(page, `${theme} results`);
    });
  }
});
