import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

// Programs, slice P3 (task 0043, section 10): staff and their groups, the roll call, corrections, the summary, the week, and the switches, as a person sees and uses them, on a desktop
// and a phone, in both themes. What the API allows is tested in tests/api/program-attendance.spec.ts; here is what the screens offer, say and do, that nobody is shown a button they
// cannot use, and that every state is accessible and fits the width.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const [FIRST, SECOND] = [BRANCH_NAMES[0], BRANCH_NAMES[1]];
const DAY = 864e5;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

test.afterAll(async () => {
  await resetDatabase();
});

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(report, `accessibility violations on ${what}`).toEqual([]);
}

async function expectFits(page: Page, what: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal scrolling on ${what}`).toBeLessThanOrEqual(innerWidth);
}

/// An active program made straight in the database, running in the first branch (and the second when asked), with the groups "Juz A" > "Group 1" and "Juz B", and three pupils:
/// Amina and Binta in the first branch, Cara in the second. Nobody is in the program yet - `join` puts people in.
async function seedProgram(adminId: string, options: { both?: boolean } = {}) {
  const [first, second] = await Promise.all(BRANCH_NAMES.slice(0, 2).map((name) => db.branch.findFirstOrThrow({ where: { name } })));
  const program = await db.program.create({
    data: {
      name: "Quran memorisation",
      kind: "ONGOING",
      status: "ACTIVE",
      createdByUserId: adminId,
      branches: { create: options.both ? [{ branchId: first!.id }, { branchId: second!.id }] : [{ branchId: first!.id }] },
      levelLabels: {
        create: [
          { levelIndex: 0, name: "Juz" },
          { levelIndex: 1, name: "Group" },
        ],
      },
    },
  });
  const juzA = await db.programGroup.create({ data: { programId: program.id, levelIndex: 0, name: "Juz A", sortOrder: 0 } });
  const group1 = await db.programGroup.create({
    data: { programId: program.id, parentId: juzA.id, levelIndex: 1, name: "Group 1", sortOrder: 0 },
  });
  const juzB = await db.programGroup.create({ data: { programId: program.id, levelIndex: 0, name: "Juz B", sortOrder: 1 } });

  const sessionOf = (branchId: string) =>
    db.academicSession.create({
      data: { branchId, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
    });
  const [sessionA, sessionB] = await Promise.all([sessionOf(first!.id), sessionOf(second!.id)]);
  const classGroup = await db.classGroup.create({ data: { branchId: first!.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: first!.id, classGroupId: classGroup.id, name: "Gold" } });
  const pupil = async (branchId: string, sessionId: string, admissionNo: string, firstName: string, armId?: string) => {
    const student = await db.studentRecord.create({
      data: {
        branchId,
        firstName,
        lastName: "Musa",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2013-05-10"),
        admissionNo,
        guardianPhone: "+2348011110001",
      },
    });
    if (armId)
      await db.studentEnrollment.create({
        data: { studentId: student.id, branchId, sessionId, className: "JSS 1", arm: "Gold", classArmId: armId, status: "ACTIVE" },
      });
    return student;
  };
  const amina = await pupil(first!.id, sessionA.id, "2026/0001", "Amina", arm.id);
  const binta = await pupil(first!.id, sessionA.id, "2026/0002", "Binta", arm.id);
  const cara = await pupil(second!.id, sessionB.id, "2026/0003", "Cara");

  /// Puts a pupil in a group; they joined a month ago, so earlier days have rolls.
  const join = (student: { id: string }, branchId: string, groupId: string) =>
    db.programParticipant.create({
      data: {
        programId: program.id,
        kind: "STUDENT",
        studentId: student.id,
        branchId,
        groupId,
        joinedOn: new Date(`${day(-30)}T00:00:00Z`),
        createdByUserId: adminId,
      },
    });
  /// A mark made in the past, straight in the database: the session of a group on a day and one person's status in it.
  const markOn = async (offset: number, groupId: string, marks: [{ id: string }, string, string][], label = "") => {
    const session = await db.programSession.create({
      data: { programId: program.id, groupId, date: new Date(`${day(offset)}T00:00:00Z`), label, createdByUserId: adminId },
    });
    for (const [participant, status, branchId] of marks)
      await db.programAttendance.create({
        data: {
          sessionId: session.id,
          programId: program.id,
          participantId: participant.id,
          branchId,
          status: status as "PRESENT",
          markedByUserId: adminId,
        },
      });
    return session;
  };
  /// A member of staff of the first branch named to the program with a role and, for a teacher or a recorder, the groups they take attendance for.
  const name = async (userId: string, role: "SUPERVISOR" | "TEACHER" | "RECORDER", groupIds: string[] = []) => {
    const place = await db.programStaff.create({
      data: { programId: program.id, userId, branchId: first!.id, role, createdByUserId: adminId },
    });
    for (const groupId of groupIds)
      await db.programStaffGroup.create({ data: { programStaffId: place.id, groupId, programId: program.id, createdByUserId: adminId } });
    return place;
  };
  return { program, first: first!, second: second!, juzA, group1, juzB, amina, binta, cara, join, markOn, name };
}

const roll = (page: Page) => page.getByRole("list", { name: "Roll" });
const statusOf = (page: Page, person: string) => page.getByRole("group", { name: `Attendance of ${person}` });
const choose = (page: Page, person: string, status: string) => statusOf(page, person).getByRole("button", { name: status, exact: true });

async function openAttendance(page: Page, programId: string) {
  await page.goto(`/programs/${programId}`);
  await page.getByRole("tab", { name: "Attendance" }).click();
  await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
}

test.describe("a teacher", () => {
  test("takes the roll of a group and the groups inside it, corrects a mark and reads its history", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    await seed.join(seed.amina, seed.first.id, seed.group1.id);
    await seed.join(seed.binta, seed.first.id, seed.juzA.id);
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
    await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);

    await signInThroughUi(page, teacher);
    await openAttendance(page, seed.program.id);
    // Juz A's roll lists the people of Group 1 inside it too, once each.
    await expect(roll(page).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByText("not taken yet")).toBeVisible();
    await expect(page.getByText("Nothing to save.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save attendance" })).toBeDisabled();

    await page.getByRole("button", { name: "Mark everyone present" }).click();
    await expect(choose(page, "Amina Musa", "Present")).toHaveAttribute("aria-pressed", "true");
    await expect(choose(page, "Binta Musa", "Present")).toHaveAttribute("aria-pressed", "true");
    await choose(page, "Binta Musa", "Absent").click();
    await expect(choose(page, "Binta Musa", "Present")).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Add a note for Binta Musa" }).click();
    await page.getByLabel("Note for Binta Musa").fill("Sick, her mother called");
    await expect(page.getByText("2 to save.")).toBeVisible();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText("Saved: 2 marked, 0 corrected.")).toBeVisible();
    await expect(page.getByText("Marked by Hafsat Ali").first()).toBeVisible();
    await expect(page.getByText("Note: Sick, her mother called")).toBeVisible();
    await expect(page.getByText("2 marked", { exact: false }).first()).toBeVisible();
    expect(await db.programAttendance.count()).toBe(2);

    // a correction within the week needs no reason
    await choose(page, "Binta Musa", "Late").click();
    await expect(page.getByLabel("Why are you correcting a mark?")).toHaveCount(0);
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText("Saved: 0 marked, 1 corrected.")).toBeVisible();
    await expect(page.getByText("corrected 1 time")).toBeVisible();

    await page.getByRole("button", { name: "Attendance history of Binta Musa" }).click();
    const history = page.getByRole("dialog", { name: "Attendance of Binta Musa" });
    await expect(history.getByText(/changed Absent to Late/)).toBeVisible();
    await history.getByRole("button", { name: "Close" }).last().click();
    await expect(history).toHaveCount(0);
  });

  test("a suspended person is flagged and cannot be marked today, and an earlier day is not rewritten by it", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    await seed.join(seed.amina, seed.first.id, seed.group1.id);
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
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
    await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
    await signInThroughUi(page, teacher);
    await openAttendance(page, seed.program.id);

    const zainab = roll(page).getByRole("listitem").filter({ hasText: "Zainab Abubakar" });
    await expect(zainab.getByText("Suspended", { exact: true })).toBeVisible();
    for (const status of ["Present", "Late", "Absent", "Excused"]) await expect(choose(page, "Zainab Abubakar", status)).toBeDisabled();
    await expect(choose(page, "Amina Musa", "Present")).toBeEnabled();

    await page.getByLabel("Date", { exact: true }).fill(day(-3));
    // wait for the earlier day's roll, then: no flag and she can be marked
    await expect(choose(page, "Zainab Abubakar", "Present")).toBeEnabled();
    await expect(
      roll(page).getByRole("listitem").filter({ hasText: "Zainab Abubakar" }).getByText("Suspended", { exact: true }),
    ).toHaveCount(0);
  });

  test("cannot mark a day older than a week; the date picker stops at today", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    await seed.join(seed.amina, seed.first.id, seed.group1.id);
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
    await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
    await signInThroughUi(page, teacher);
    await openAttendance(page, seed.program.id);

    await expect(page.getByLabel("Date", { exact: true })).toHaveAttribute("max", day(0));
    await page.getByLabel("Date", { exact: true }).fill(day(-10));
    await expect(page.getByText(/You can take attendance from .* onward/)).toBeVisible();
    await expect(choose(page, "Amina Musa", "Present")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save attendance" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark everyone present" })).toHaveCount(0);

    await page.getByLabel("Date", { exact: true }).fill(day(-6));
    await expect(page.getByText(/You can take attendance from/)).toHaveCount(0);
    await expect(choose(page, "Amina Musa", "Present")).toBeEnabled();
  });

  test("two sessions on one day are told apart by a session name", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    await seed.join(seed.amina, seed.first.id, seed.group1.id);
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
    await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
    await signInThroughUi(page, teacher);
    await openAttendance(page, seed.program.id);

    await page.getByLabel("Session name").fill("Morning");
    await expect(page.getByText(/· Morning · not taken yet/)).toBeVisible();
    await choose(page, "Amina Musa", "Present").click();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText("Saved: 1 marked, 0 corrected.")).toBeVisible();

    await page.getByLabel("Session name").fill("After Asr");
    await expect(page.getByText(/· After Asr · not taken yet/)).toBeVisible();
    await expect(choose(page, "Amina Musa", "Present")).toHaveAttribute("aria-pressed", "false");
    await choose(page, "Amina Musa", "Absent").click();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText("Saved: 1 marked, 0 corrected.")).toBeVisible();
    expect(await db.programSession.count()).toBe(2);

    await page.getByRole("tab", { name: "This week" }).click();
    await expect(page.getByRole("list", { name: "Sessions this week" }).getByRole("listitem")).toHaveCount(2);
  });

  test("is told when someone else changed a mark while the roll was open, and nothing is lost", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    const aminaPlace = await seed.join(seed.amina, seed.first.id, seed.group1.id);
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
    await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
    const session = await seed.markOn(0, seed.juzA.id, [[aminaPlace, "PRESENT", seed.first.id]]);
    await signInThroughUi(page, teacher);
    await openAttendance(page, seed.program.id);
    await expect(choose(page, "Amina Musa", "Present")).toHaveAttribute("aria-pressed", "true");

    // someone else corrects her to Late in the meantime
    await db.programAttendance.updateMany({ where: { sessionId: session.id }, data: { status: "LATE", version: { increment: 1 } } });
    await choose(page, "Amina Musa", "Absent").click();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText(/was changed by someone else/)).toBeVisible();
    expect((await db.programAttendance.findFirstOrThrow()).status).toBe("LATE");
    await page.getByRole("button", { name: "Reload the roll" }).click();
    await expect(choose(page, "Amina Musa", "Late")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/was changed by someone else/)).toHaveCount(0);
  });

  test("with no group there is no Attendance tab; with a group the program lists only what a teacher may use", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
    await seed.name(teacher.id, "TEACHER");
    await signInThroughUi(page, teacher);
    await page.goto(`/programs/${seed.program.id}`);
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Attendance" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Settings" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(page.getByText("No groups yet: they see nothing.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Name a/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Choose the groups of/ })).toHaveCount(0);
  });
});

test.describe("an administrator", () => {
  test("corrects an old day only with a reason, and the history keeps the reason", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    const aminaPlace = await seed.join(seed.amina, seed.first.id, seed.group1.id);
    await seed.markOn(-10, seed.group1.id, [[aminaPlace, "PRESENT", seed.first.id]]);
    await signInThroughUi(page, sa);
    await openAttendance(page, seed.program.id);
    await page.getByLabel("Group", { exact: true }).selectOption({ label: "Juz A–Group 1" });
    await page.getByLabel("Date", { exact: true }).fill(day(-10));
    await expect(page.getByText(/older than a teacher can reach/)).toBeVisible();
    await expect(choose(page, "Amina Musa", "Present")).toHaveAttribute("aria-pressed", "true");

    await choose(page, "Amina Musa", "Absent").click();
    await expect(page.getByLabel("Why are you correcting a mark?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save attendance" })).toBeDisabled();
    await page.getByLabel("Why are you correcting a mark?").fill("Found in the register");
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText("Saved: 0 marked, 1 corrected.")).toBeVisible();

    await page.getByRole("button", { name: "Attendance history of Amina Musa" }).click();
    const history = page.getByRole("dialog", { name: "Attendance of Amina Musa" });
    await expect(history.getByText(/changed Present to Absent \(Found in the register\)/)).toBeVisible();
  });

  test("reads the summary with the low ones flagged, and the week with a way into each roll", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    const aminaPlace = await seed.join(seed.amina, seed.first.id, seed.group1.id);
    const bintaPlace = await seed.join(seed.binta, seed.first.id, seed.group1.id);
    await seed.markOn(-1, seed.group1.id, [
      [aminaPlace, "PRESENT", seed.first.id],
      [bintaPlace, "ABSENT", seed.first.id],
    ]);
    await seed.markOn(-2, seed.group1.id, [
      [aminaPlace, "ABSENT", seed.first.id],
      [bintaPlace, "ABSENT", seed.first.id],
    ]);
    await signInThroughUi(page, sa);
    await openAttendance(page, seed.program.id);

    await page.getByRole("tab", { name: "Summary" }).click();
    const list = page.getByRole("list", { name: "Attendance summary" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").first()).toContainText("Binta Musa");
    await expect(list.getByRole("listitem").first()).toContainText("0% · Low");
    await expect(list.getByRole("listitem").nth(1)).toContainText("Amina Musa");
    await expect(list.getByRole("listitem").nth(1)).toContainText("50% · Low");
    await expect(page.getByText(/overall 25% over 4 marks/)).toBeVisible();
    await page.getByLabel("From", { exact: true }).fill(day(-1));
    await expect(list.getByRole("listitem").nth(1)).toContainText("100%");
    await expect(list.getByRole("listitem").nth(1)).not.toContainText("Low");
    await page.getByLabel("From", { exact: true }).fill(day(0));
    await expect(page.getByText("The first date comes after the last.")).toHaveCount(0);

    await page.getByRole("tab", { name: "This week" }).click();
    const week = page.getByRole("list", { name: "Sessions this week" });
    await expect(week.getByRole("listitem")).toHaveCount(2);
    await expect(week.getByRole("listitem").first()).toContainText("2 marked");
    await week
      .getByRole("button", { name: /^Open the roll of Juz A–Group 1/ })
      .first()
      .click();
    await expect(page.getByRole("tab", { name: "Roll call" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(day(-1));
    await expect(choose(page, "Amina Musa", "Present")).toHaveAttribute("aria-pressed", "true");
  });

  test("names a teacher, gives them groups, and turns attendance off for the program and back on", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
    await signInThroughUi(page, sa);
    await page.goto(`/programs/${seed.program.id}`);
    await page.getByRole("tab", { name: "Staff" }).click();
    for (const heading of ["Program admins", "Supervisors", "Teachers", "Recorders"])
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();

    await page.getByRole("button", { name: "Name a teacher" }).click();
    const naming = page.getByRole("dialog", { name: "Name a teacher" });
    await naming.getByLabel("Member of staff").selectOption({ label: `Hafsat Ali (Teaching staff, ${FIRST})` });
    await naming.getByRole("button", { name: "Name teacher" }).click();
    await expect(page.getByText("Hafsat Ali is now a teacher.")).toBeVisible();
    await expect(page.getByText("No groups yet: they see nothing.")).toBeVisible();

    await page.getByRole("button", { name: "Choose the groups of Hafsat Ali" }).click();
    const groups = page.getByRole("dialog", { name: "Groups of Hafsat Ali" });
    await groups.getByLabel("Juz A", { exact: true }).check();
    await groups.getByRole("button", { name: "Save groups" }).click();
    await expect(page.getByText("The groups of Hafsat Ali were saved.")).toBeVisible();
    await expect(page.getByText("Takes attendance for Juz A")).toBeVisible();

    // the program's own switch
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByTestId("attendance-state")).toHaveText("On.");
    await expect(page.getByLabel("Flag a person under (%)")).toHaveValue("75");
    await page.getByLabel("Take attendance in this program").uncheck();
    await page.getByLabel("Flag a person under (%)").fill("60");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("The settings were saved.")).toBeVisible();
    await expect(page.getByTestId("attendance-state")).toContainText("switched off for this program");
    await expect(page.getByRole("tab", { name: "Attendance" })).toHaveCount(0);
    expect((await db.program.findFirstOrThrow()).lowAttendancePercent).toBe(60);

    await page.getByLabel("Take attendance in this program").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByTestId("attendance-state")).toHaveText("On.");
    await expect(page.getByRole("tab", { name: "Attendance" })).toBeVisible();
    await page.getByLabel("Flag a person under (%)").fill("101");
    await expect(page.getByText("Enter a whole number from 1 to 100.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  });

  test("the school's attendance switch is its own, beside the programs switch, and a branch can leave it alone", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id, { both: true });
    await signInThroughUi(page, sa);
    await page.goto("/settings");
    await page.getByRole("button", { name: "Programs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Attendance in programs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Programs in the school" })).toBeVisible();
    await expect(page.getByText("Attendance is on for the school", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Turn off program attendance for ${SECOND}` }).click();
    await expect(page.getByText(`${SECOND} no longer takes attendance in programs.`)).toBeVisible();
    // the programs switch is untouched
    await expect(page.getByText("On for the school", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Turn off programs for ${SECOND}` })).toBeVisible();

    await page.getByRole("button", { name: "Turn off attendance for the school" }).click();
    await expect(page.getByText("Attendance is off for the school", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Turn (off program attendance for|program attendance back on for)/ })).toHaveCount(0);
    await page.goto(`/programs/${seed.program.id}`);
    await expect(page.getByRole("tab", { name: "Attendance" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByTestId("attendance-state")).toContainText("switched off for the school");
  });
});

test.describe("who is shown what", () => {
  test("a branch administrator reads only their own branch's people on a roll and is offered no way to mark", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id, { both: true });
    await seed.join(seed.amina, seed.first.id, seed.juzA.id);
    await seed.join(seed.cara, seed.second.id, seed.juzA.id);
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" }));
    await openAttendance(page, seed.program.id);
    await expect(roll(page).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByText("Amina Musa")).toBeVisible();
    await expect(page.getByText("Cara Musa")).toHaveCount(0);
    await expect(page.getByText("You can read this roll but not change it.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save attendance" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark everyone present" })).toHaveCount(0);
    await expect(choose(page, "Amina Musa", "Present")).toBeDisabled();
    await expect(page.getByRole("tab", { name: "Settings" })).toHaveCount(0);
  });

  test("a supervisor reads every group and may only correct, always with a reason", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const seed = await seedProgram(sa.id);
    const aminaPlace = await seed.join(seed.amina, seed.first.id, seed.group1.id);
    await seed.join(seed.binta, seed.first.id, seed.group1.id);
    await seed.markOn(0, seed.group1.id, [[aminaPlace, "PRESENT", seed.first.id]]);
    const supervisor = await createUser({ role: Role.TEACHING_STAFF, name: "Musa Supervisor" });
    await seed.name(supervisor.id, "SUPERVISOR");
    await signInThroughUi(page, supervisor);
    await openAttendance(page, seed.program.id);
    await page.getByLabel("Group", { exact: true }).selectOption({ label: "Juz A–Group 1" });
    await expect(page.getByText(/You can correct a mark that exists, and must say why/)).toBeVisible();
    // Binta has no mark: a supervisor cannot add one; Amina's can be corrected
    await expect(choose(page, "Binta Musa", "Present")).toBeDisabled();
    await expect(choose(page, "Amina Musa", "Late")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Mark everyone present" })).toBeDisabled();
    await choose(page, "Amina Musa", "Late").click();
    await expect(page.getByLabel("Why are you correcting a mark?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save attendance" })).toBeDisabled();
    await page.getByLabel("Why are you correcting a mark?").fill("She came in at the end");
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expect(page.getByText("Saved: 0 marked, 1 corrected.")).toBeVisible();
  });
});

test.describe("accessible and fits the width, in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} theme: the roll, the summary, the week, a history, the staff tab, its dialog and the settings`, async ({
      page,
      context,
    }) => {
      const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
      const seed = await seedProgram(sa.id);
      const aminaPlace = await seed.join(seed.amina, seed.first.id, seed.group1.id);
      const bintaPlace = await seed.join(seed.binta, seed.first.id, seed.group1.id);
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
      await seed.markOn(-1, seed.group1.id, [
        [aminaPlace, "PRESENT", seed.first.id],
        [bintaPlace, "ABSENT", seed.first.id],
      ]);
      const teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Hafsat Ali" });
      await seed.name(teacher.id, "TEACHER", [seed.juzA.id]);
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await signInThroughUi(page, sa);
      await openAttendance(page, seed.program.id);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      await page.getByLabel("Group", { exact: true }).selectOption({ label: "Juz A–Group 1" });
      await expect(
        roll(page).getByRole("listitem").filter({ hasText: "Zainab Abubakar" }).getByText("Suspended", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Mark everyone present" }).click();
      await choose(page, "Binta Musa", "Absent").click();
      await page.getByRole("button", { name: "Add a note for Binta Musa" }).click();
      await expectAccessible(page, `${theme} roll`);
      await expectFits(page, `${theme} roll`);

      await page.getByRole("tab", { name: "Summary" }).click();
      await expect(page.getByRole("list", { name: "Attendance summary" })).toBeVisible();
      await expectAccessible(page, `${theme} summary`);
      await expectFits(page, `${theme} summary`);
      await page.getByRole("button", { name: "Attendance history of Binta Musa" }).click();
      await expect(page.getByRole("dialog", { name: "Attendance of Binta Musa" })).toBeVisible();
      await expectAccessible(page, `${theme} history`);
      await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();

      await page.getByRole("tab", { name: "This week" }).click();
      await expect(page.getByRole("list", { name: "Sessions this week" })).toBeVisible();
      await expectAccessible(page, `${theme} week`);
      await expectFits(page, `${theme} week`);

      await page.getByRole("tab", { name: "Staff", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Teachers" })).toBeVisible();
      await expectAccessible(page, `${theme} staff`);
      await expectFits(page, `${theme} staff`);
      await page.getByRole("button", { name: "Choose the groups of Hafsat Ali" }).click();
      await expect(page.getByRole("dialog", { name: "Groups of Hafsat Ali" })).toBeVisible();
      await expectAccessible(page, `${theme} groups dialog`);
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Name a teacher" }).click();
      await expect(page.getByRole("dialog", { name: "Name a teacher" })).toBeVisible();
      await expectAccessible(page, `${theme} name a teacher`);
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

      await page.getByRole("tab", { name: "Settings" }).click();
      await expect(page.getByLabel("Flag a person under (%)")).toBeVisible();
      await expectAccessible(page, `${theme} program settings`);
      await expectFits(page, `${theme} program settings`);
      await page.getByLabel("Flag a person under (%)").fill("0");
      await expectAccessible(page, `${theme} program settings with an error`);

      await page.goto("/settings");
      await page.getByRole("button", { name: "Programs", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Attendance in programs" })).toBeVisible();
      await expectAccessible(page, `${theme} school switches`);
      await expectFits(page, `${theme} school switches`);
    });
  }
});
