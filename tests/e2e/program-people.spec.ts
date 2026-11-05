import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Gender } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import { BRANCH_NAMES, Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { HTTP_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

// Programs, slice P2 (task 0043, section 9): the People tab as a person sees and uses it, on a desktop and a phone, in both themes. What the API allows is tested in
// tests/api/program-people.spec.ts; here is what the screens offer, say and do, that nobody is shown a button they cannot use, and that every state is accessible and fits the width.

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

/// A program made straight in the database (running in the first branch, and the second when asked), with the groups "Juz A" > "Group 1" and "Juz B", and three pupils: two in the
/// first branch's class JSS 1 Gold and one in the second branch.
async function seedProgram(adminId: string, options: { both?: boolean; status?: "ACTIVE" | "ARCHIVED" } = {}) {
  const [first, second] = await Promise.all(BRANCH_NAMES.slice(0, 2).map((name) => db.branch.findFirstOrThrow({ where: { name } })));
  const program = await db.program.create({
    data: {
      name: "Quran memorisation",
      kind: "ONGOING",
      status: options.status ?? "ACTIVE",
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
    if (armId) {
      await db.studentEnrollment.create({
        data: { studentId: student.id, branchId, sessionId, className: "JSS 1", arm: "Gold", classArmId: armId, status: "ACTIVE" },
      });
    }
    return student;
  };
  const amina = await pupil(first!.id, sessionA.id, "2026/0001", "Amina", arm.id);
  const binta = await pupil(first!.id, sessionA.id, "2026/0002", "Binta", arm.id);
  const cara = await pupil(second!.id, sessionB.id, "2026/0003", "Cara");
  return { program, first: first!, second: second!, juzA, group1, juzB, amina, binta, cara, arm };
}

const people = (page: Page) => page.getByRole("list", { name: "People in the program" });
const row = (page: Page, name: string) => people(page).getByRole("listitem").filter({ hasText: name }).first();
const dialog = (page: Page) => page.getByRole("dialog");

async function openPeople(page: Page, programId: string) {
  await page.goto(`/programs/${programId}`);
  await page.getByRole("tab", { name: "People" }).click();
}

test.describe("a super admin", () => {
  test("adds a pupil, a whole class and new people; moves, withdraws and re-enrols; suspends and expels someone who has no school record", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    const { program, group1 } = await seedProgram(admin.id);
    await signInThroughUi(page, admin);
    await openPeople(page, program.id);
    await expect(page.getByText("No one is in this program yet.")).toBeVisible();

    // A pupil, by search; the dialog stays open so several can be added in a row.
    await page.getByRole("button", { name: "Add people" }).click();
    const add = page.getByRole("dialog", { name: "Add people" });
    await add.getByLabel("Which group do they join?").selectOption({ label: "Juz A–Group 1" });
    await add.getByLabel("Search for a pupil").fill("Amina");
    await add.getByRole("button", { name: "Add Amina Musa" }).click();
    await expect(page.getByText("Amina Musa was added.")).toBeVisible();
    await expect(add.getByText("Already in this program")).toBeVisible();
    await expect(add.getByRole("button", { name: "Add Amina Musa" })).toBeDisabled();

    // A whole class: it says who would be added and who is skipped before anything happens.
    await add.getByLabel("Who are you adding?").selectOption({ label: "A whole class of pupils" });
    await add.getByLabel("Which class?").selectOption({ index: 0 });
    await add.getByRole("button", { name: "See who would be added" }).click();
    await expect(add.getByText("1 pupil will be added, 1 will be skipped.")).toBeVisible();
    await expect(add.getByRole("list", { name: "Skipped" }).getByText("Amina Musa: already in the program")).toBeVisible();
    await add.getByRole("button", { name: "Add 1 pupil" }).click();
    await expect(page.getByText("1 pupil was added from JSS 1 Gold.")).toBeVisible();

    // A new person: a child needs its birth date and a guardian; a namesake is asked about.
    await page.getByRole("button", { name: "Add people" }).click();
    const fresh = page.getByRole("dialog", { name: "Add people" });
    await fresh.getByLabel("Who are you adding?").selectOption({ label: "A new person (adult, guardian or child)" });
    await fresh.getByLabel("What kind of person?").selectOption({ label: "A small child" });
    await fresh.getByLabel("First name").fill("Zainab");
    await fresh.getByLabel("Last name").fill("Abubakar");
    await fresh.getByRole("button", { name: "Add person" }).click();
    await expect(fresh.getByText("A child needs a date of birth.")).toBeVisible();
    await fresh.getByLabel("Date of birth").fill("2020-03-04");
    await fresh.getByLabel("Guardian's name").fill("Hauwa Abubakar");
    await fresh.getByLabel("Guardian's phone").fill("08031234567");
    await fresh.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText("Zainab Abubakar was added.")).toBeVisible();
    await fresh.getByLabel("First name").fill("Zainab");
    await fresh.getByLabel("Last name").fill("Abubakar");
    await fresh.getByLabel("Date of birth").fill("2020-03-04");
    await fresh.getByLabel("Guardian's name").fill("Hauwa Abubakar");
    await fresh.getByLabel("Guardian's phone").fill("08031234567");
    await fresh.getByRole("button", { name: "Add person" }).click();
    await expect(fresh.getByText(/already in this program/)).toBeVisible();
    await expect(fresh.getByRole("button", { name: "Add person" })).toBeDisabled();
    await fresh.getByLabel("Yes, this is a different person").check();
    await expect(fresh.getByRole("button", { name: "Add person" })).toBeEnabled();
    await fresh.getByRole("button", { name: "Done" }).click();

    // The list: who, where, in what state.
    await expect(row(page, "Amina Musa")).toContainText("Juz A–Group 1");
    await expect(row(page, "Amina Musa")).toContainText("Taking part");
    await expect(row(page, "Zainab Abubakar")).toContainText("Child");
    await expect(page.getByText("3 people", { exact: true })).toBeVisible();

    // Move.
    await page.getByRole("button", { name: "Move Binta Musa" }).click();
    await dialog(page).getByLabel("New group").selectOption({ label: "Juz B" });
    await dialog(page).getByRole("button", { name: "Move", exact: true }).click();
    await expect(page.getByText("Binta Musa was moved.")).toBeVisible();
    await expect(row(page, "Binta Musa")).toContainText("Juz B");

    // Withdraw needs a reason, keeps the person in the list, and Re-enrol brings them back.
    await page.getByRole("button", { name: "Withdraw Binta Musa" }).click();
    await dialog(page).getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(dialog(page).getByText("Say why (at least 3 characters).")).toBeVisible();
    await dialog(page).getByLabel("Why are they leaving?").fill("Moved to another city");
    await dialog(page).getByRole("button", { name: "Withdraw", exact: true }).click();
    await expect(page.getByText("Binta Musa has left the program.")).toBeVisible();
    await expect(row(page, "Binta Musa")).toContainText("Left the program");
    await expect(page.getByRole("button", { name: "Move Binta Musa" })).toHaveCount(0);
    await page.getByRole("button", { name: "Re-enrol Binta Musa" }).click();
    await dialog(page).getByLabel("Why are they coming back?").fill("Came back after the break");
    await dialog(page).getByRole("button", { name: "Re-enrol", exact: true }).click();
    await expect(page.getByText("Binta Musa is back in the program.")).toBeVisible();
    await expect(row(page, "Binta Musa")).toContainText("Taking part");

    // Suspend a person typed in, with a last day; lift; expel (a super admin's); the history says all of it.
    await page.getByRole("button", { name: "Suspend Zainab Abubakar" }).click();
    await dialog(page).getByLabel("Why are you suspending them?").fill("Disturbing the class");
    await dialog(page).getByLabel("Last day of the suspension").fill(day(7));
    await dialog(page).getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(page.getByText("Zainab Abubakar is suspended.")).toBeVisible();
    await expect(row(page, "Zainab Abubakar")).toContainText("Suspended until");
    await page.getByRole("button", { name: "Lift suspension Zainab Abubakar" }).click();
    await dialog(page).getByLabel("Why are you lifting it?").fill("Apologised to the group");
    await dialog(page).getByRole("button", { name: "Lift suspension", exact: true }).click();
    await expect(row(page, "Zainab Abubakar")).toContainText("Taking part");
    await expect(page.getByRole("button", { name: "Expel Zainab Abubakar" })).toBeVisible();
    await page.getByRole("button", { name: "History of Zainab Abubakar" }).click();
    const history = dialog(page);
    await expect(history.getByRole("heading", { name: "History of Zainab Abubakar" })).toBeVisible();
    await expect(history.getByText("suspended them")).toBeVisible();
    await expect(history.getByText("Disturbing the class")).toBeVisible();
    await expect(history.getByText(/Amina Yusuf/).first()).toBeVisible();
    await history.getByRole("button", { name: "Close" }).last().click();

    // The structure tab counts them.
    await page.getByRole("tab", { name: "Structure" }).click();
    await expect(page.getByText(/Juz A.*· 1 person/).first()).toBeVisible();
    expect(group1).toBeTruthy();
  });

  test("a pupil's state is read from the school's record: suspended on the Students page shows here with where to change it", async ({
    page,
  }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    const { program, amina, juzA } = await seedProgram(admin.id);
    await db.programParticipant.create({
      data: {
        programId: program.id,
        kind: "STUDENT",
        studentId: amina.id,
        branchId: amina.branchId,
        groupId: juzA.id,
        joinedOn: new Date(),
        createdByUserId: admin.id,
      },
    });
    await signInThroughUi(page, admin);
    await openPeople(page, program.id);
    await expect(row(page, "Amina Musa")).toContainText("Taking part");
    await db.studentRecord.update({ where: { id: amina.id }, data: { standing: "SUSPENDED" } });
    await openPeople(page, program.id);
    await expect(row(page, "Amina Musa")).toContainText("Suspended");
    await expect(row(page, "Amina Musa")).toContainText("Change this on the Students page.");
    await expect(page.getByRole("button", { name: /Suspend|Lift suspension|Expel|Reinstate/ })).toHaveCount(0);
    // still can be moved and withdrawn: those are the program's own business
    await expect(page.getByRole("button", { name: "Move Amina Musa" })).toBeVisible();
    await db.studentRecord.update({ where: { id: amina.id }, data: { standing: "EXPELLED" } });
    await openPeople(page, program.id);
    await expect(row(page, "Amina Musa")).toContainText("Expelled");
    await db.studentRecord.update({ where: { id: amina.id }, data: { standing: "ACTIVE", archivedAt: new Date() } });
    await openPeople(page, program.id);
    await expect(row(page, "Amina Musa")).toContainText("Ended by the school");
  });

  test("the filters narrow the list and say when nothing matches", async ({ page }) => {
    const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
    const { program, amina, binta, juzA, juzB, first } = await seedProgram(admin.id);
    for (const [student, group] of [
      [amina, juzA],
      [binta, juzB],
    ] as const) {
      await db.programParticipant.create({
        data: {
          programId: program.id,
          kind: "STUDENT",
          studentId: student.id,
          branchId: first.id,
          groupId: group.id,
          joinedOn: new Date(),
          createdByUserId: admin.id,
        },
      });
    }
    await signInThroughUi(page, admin);
    await openPeople(page, program.id);
    await expect(page.getByText("2 people", { exact: true })).toBeVisible();
    await page.getByLabel("Search people").fill("binta");
    await expect(page.getByText("1 person", { exact: true })).toBeVisible();
    await expect(row(page, "Binta Musa")).toBeVisible();
    await page.getByLabel("Search people").fill("");
    await page.getByLabel("Group").selectOption({ label: "Juz A" });
    await expect(page.getByText("1 person", { exact: true })).toBeVisible();
    await expect(people(page).getByText("Amina Musa")).toBeVisible();
    await page.getByLabel("State").selectOption({ label: "Suspended" });
    await expect(page.getByText("No one matches.")).toBeVisible();
  });
});

test.describe("who is shown what", () => {
  test("a branch administrator sees only the people through their own branch and is never offered Expel", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const { program, amina, cara, juzA, first, second } = await seedProgram(sa.id, { both: true });
    for (const [student, branchId] of [
      [amina, first.id],
      [cara, second.id],
    ] as const) {
      await db.programParticipant.create({
        data: {
          programId: program.id,
          kind: "STUDENT",
          studentId: student.id,
          branchId,
          groupId: juzA.id,
          joinedOn: new Date(),
          createdByUserId: sa.id,
        },
      });
    }
    await db.programParticipant.create({
      data: {
        programId: program.id,
        kind: "ADULT",
        firstName: "Hauwa",
        lastName: "Bello",
        branchId: first.id,
        groupId: juzA.id,
        joinedOn: new Date(),
        createdByUserId: sa.id,
      },
    });
    await signInThroughUi(page, await createUser({ role: Role.ADMIN, superAdmin: false, name: "Branch Admin" }));
    await openPeople(page, program.id);
    await expect(page.getByText(`You see the people who are in the program through your own branch.`)).toBeVisible();
    await expect(row(page, "Amina Musa")).toBeVisible();
    await expect(row(page, "Hauwa Bello")).toBeVisible();
    await expect(page.getByText("Cara Musa")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Suspend Hauwa Bello" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expel Hauwa Bello" })).toHaveCount(0);
    // the branch filter lists only their branch
    await expect(page.getByLabel("Branch").getByRole("option")).toHaveText(["Every branch", FIRST]);
    expect(SECOND).toBeTruthy();
    // with the school's switch off there is no standing button at all
    await db.settingValue.create({ data: { scope: "GLOBAL", key: "standing.branchAdminMaySuspend", value: false, status: "APPROVED" } });
    await openPeople(page, program.id);
    await expect(page.getByRole("button", { name: "Suspend Hauwa Bello" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Move Hauwa Bello" })).toBeVisible();
  });

  test("a teacher who is not in the program is told it cannot be found", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const { program } = await seedProgram(sa.id);
    await signInThroughUi(page, await createUser({ role: Role.TEACHING_STAFF, name: "Hassan Teacher" }));
    await page.goto(`/programs/${program.id}`);
    await expect(page.getByText("We could not find that program.")).toBeVisible();
    await expect(page.getByRole("tab", { name: "People" })).toHaveCount(0);
  });

  test("an archived program shows its people and offers nothing to change", async ({ page }) => {
    const sa = await createUser({ role: Role.ADMIN, name: "Super Admin" });
    const { program, amina, juzA, first } = await seedProgram(sa.id, { status: "ARCHIVED" });
    await db.programParticipant.create({
      data: {
        programId: program.id,
        kind: "STUDENT",
        studentId: amina.id,
        branchId: first.id,
        groupId: juzA.id,
        joinedOn: new Date(),
        createdByUserId: sa.id,
      },
    });
    await signInThroughUi(page, sa);
    await openPeople(page, program.id);
    await expect(row(page, "Amina Musa")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add people" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Move|Withdraw|Edit|Suspend/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "History of Amina Musa" })).toBeVisible();
  });
});

test.describe("accessible and fits the width, in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} theme: the People tab, its dialogs and the counts on the structure tab`, async ({ page, context }) => {
      const admin = await createUser({ role: Role.ADMIN, name: "Amina Yusuf" });
      const { program, amina, binta, juzA, first } = await seedProgram(admin.id);
      await db.programParticipant.create({
        data: {
          programId: program.id,
          kind: "STUDENT",
          studentId: amina.id,
          branchId: first.id,
          groupId: juzA.id,
          joinedOn: new Date(),
          createdByUserId: admin.id,
        },
      });
      await db.programParticipant.create({
        data: {
          programId: program.id,
          kind: "CHILD",
          firstName: "Zainab",
          lastName: "Abubakar",
          dateOfBirth: new Date("2020-03-04"),
          guardianName: "Hauwa",
          guardianPhone: "08031234567",
          branchId: first.id,
          groupId: juzA.id,
          joinedOn: new Date(),
          createdByUserId: admin.id,
          standing: "SUSPENDED",
          standingUntil: new Date(`${day(5)}T00:00:00Z`),
        },
      });
      await db.programParticipant.create({
        data: {
          programId: program.id,
          kind: "STUDENT",
          studentId: binta.id,
          branchId: first.id,
          groupId: juzA.id,
          joinedOn: new Date(),
          endedOn: new Date(),
          status: "WITHDRAWN",
          endedReason: "Moved away",
          createdByUserId: admin.id,
        },
      });
      await context.addCookies([{ name: "theme", value: theme, url: HTTP_URL }]);
      await signInThroughUi(page, admin);
      await openPeople(page, program.id);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(row(page, "Zainab Abubakar")).toContainText("Suspended until");
      await expectAccessible(page, `${theme} people list`);
      await expectFits(page, `${theme} people list`);

      await page.getByRole("button", { name: "Add people" }).click();
      const add = page.getByRole("dialog", { name: "Add people" });
      await add.getByLabel("Search for a pupil").fill("Binta");
      await expect(add.getByRole("button", { name: "Add Binta Musa" })).toBeVisible();
      await expectAccessible(page, `${theme} add a pupil`);
      await add.getByLabel("Who are you adding?").selectOption({ label: "A whole class of pupils" });
      await add.getByRole("button", { name: "See who would be added" }).click();
      await expect(add.getByText(/will be added/)).toBeVisible();
      await expectAccessible(page, `${theme} add a class`);
      await add.getByLabel("Who are you adding?").selectOption({ label: "A new person (adult, guardian or child)" });
      await add.getByLabel("What kind of person?").selectOption({ label: "A small child" });
      await expectAccessible(page, `${theme} add a new person`);
      await add.getByRole("button", { name: "Done" }).click();

      for (const [button, name] of [
        ["Move Amina Musa", "move"],
        ["Withdraw Amina Musa", "withdraw"],
        ["Edit Zainab Abubakar", "edit"],
        ["Expel Zainab Abubakar", "expel"],
        ["Re-enrol Binta Musa", "re-enrol"],
        ["History of Amina Musa", "history"],
      ] as const) {
        await page.getByRole("button", { name: button }).click();
        await expect(dialog(page)).toBeVisible();
        await expectAccessible(page, `${theme} ${name} dialog`);
        await dialog(page)
          .getByRole("button", { name: /Cancel|Close/ })
          .last()
          .click();
      }

      await page.getByRole("tab", { name: "Structure" }).click();
      await expect(page.getByText(/· 2 people/).first()).toBeVisible();
      await expectAccessible(page, `${theme} structure with counts`);
      await expectFits(page, `${theme} structure with counts`);
    });
  }
});
