import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { attendance as a, cast, programPeople as q, programs as p, pupils, school } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C27 Program attendance (task 0033, section 6.27): the roll of a program. The superadministrator names a teacher (who sees nothing until given groups), gives them groups and names a supervisor; a person typed in
// is suspended. The teacher takes the roll (one tap for everyone present; a suspended person is flagged and cannot be marked), corrects a mark and reads its history, keeps two sessions on one day apart by name, and
// cannot mark a day older than a week. The superadministrator corrects a mark with a reason that the history keeps, reads the summary and the week, turns attendance off for the program and back on, and
// does the same for a branch and the school in Settings. A branch administrator reads a roll and is offered no way to mark.

const chapter = "C27 Program attendance";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const roll = (page: Page): Locator => page.getByRole("list", { name: "Roll" });
const choose = (page: Page, person: string, status: string): Locator =>
  page.getByRole("group", { name: `Attendance of ${person}` }).getByRole("button", { name: status, exact: true });
const full = (person: { first: string; last: string }) => `${person.first} ${person.last}`;
const typedDay = (offset: number): string => {
  const day = new Date(Date.now() + offset * 86_400_000);
  return `${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}${day.getFullYear()}`;
};
const isoToday = (): string => new Date().toISOString().slice(0, 10);
/// A click lands wherever it lands on a wide date field, so after it the field is blurred and focused again: focus goes to its first segment (the month). Only the month and the day are typed (the first four
/// digits): typing the year passes through years like 0002 and 0020, each a date the page reacts to, and the digits that follow would land in the wrong segment. The year stays as it is.
async function typeDate(walk: Walk, page: Page, field: Locator, typed: string): Promise<void> {
  await walk.click(field);
  await field.blur();
  await field.focus();
  for (const digit of typed.slice(0, 4)) await page.keyboard.type(digit);
}
const english = school.branches.englishPrimary;
const arabic = school.branches.arabicPrimary;
const teacher = cast.teacher.name;
const yusuf = full(pupils.yusuf);
const child = full(q.child);
const guardian = full(q.guardian);

async function openAttendance(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Programs");
  await walk.click(page.getByRole("link", { name: p.hifz.name }));
  await walk.click(tab(page, "Attendance"));
  await expect(page.getByRole("heading", { name: "Attendance", exact: true })).toBeVisible();
}

export async function c27ProgramAttendance(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 266,
      chapter,
      role: "Superadmin",
      title: "A teacher is named for the program; with no groups they see nothing yet",
      caption:
        "The superadministrator hands the program's running over: the teacher's place as program admin ends, and they are named a teacher instead. A teacher takes attendance only for the groups they are given, and until they are given any the page says they see nothing.",
      covers: ["PAT-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "Staff"));
      for (const heading of ["Program admins", "Supervisors", "Teachers", "Recorders"])
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `End ${teacher}'s place as program admin` }));
      await walk.click(page.getByRole("dialog").getByRole("button", { name: "End place" }));
      await walk.click(page.getByRole("button", { name: "Name a teacher" }));
      const naming = dialog(page, "Name a teacher");
      await walk.selectOption(naming.getByLabel("Member of staff"), `${teacher} (Teaching staff, ${english})`);
      await walk.click(naming.getByRole("button", { name: "Name teacher" }));
      await expect(page.getByText(`${teacher} is now a teacher.`)).toBeVisible();
      await expect(page.getByText("No groups yet: they see nothing.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 267,
      chapter,
      role: "Teacher",
      title: "A teacher with no group has no Attendance tab",
      caption:
        "Signed in, the teacher finds the program but not its Attendance, and the Staff tab says again that they have no groups. Nothing in the program offers them a button they cannot use.",
      covers: ["PAT-14"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await expect(tab(page, "Overview")).toBeVisible();
      await expect(tab(page, "Attendance")).toHaveCount(0);
      await expect(tab(page, "Settings")).toHaveCount(0);
      await walk.click(tab(page, "Staff"));
      await expect(page.getByText("No groups yet: they see nothing.")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Name a/ })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 268,
      chapter,
      role: "Superadmin",
      title: "The teacher is given the groups they take attendance for, and a supervisor is named",
      caption:
        "A teacher or a recorder is given groups; a supervisor reads every group and may only correct, always with a reason. Giving two groups to the teacher, and naming the member of the non-teaching staff as a supervisor.",
      covers: ["PAT-01", "PAT-02"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "Staff"));
      await walk.click(page.getByRole("button", { name: `Choose the groups of ${teacher}` }));
      const groups = dialog(page, `Groups of ${teacher}`);
      await walk.click(groups.getByLabel(p.hifz.top, { exact: true }));
      await walk.click(groups.getByLabel(p.hifz.second, { exact: true }));
      await walk.click(groups.getByRole("button", { name: "Save groups" }));
      await expect(page.getByText(`The groups of ${teacher} were saved.`)).toBeVisible();
      await expect(page.getByText(/Takes attendance for/)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Name a supervisor" }));
      const naming = dialog(page, "Name a supervisor");
      await walk.selectOption(naming.getByLabel("Member of staff"), `${cast.staff.name} (Non-teaching staff, ${english})`);
      await walk.click(naming.getByRole("button", { name: "Name supervisor" }));
      await expect(page.getByText(`${cast.staff.name} is now a supervisor.`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 269,
      chapter,
      role: "Superadmin",
      title: "A child is suspended before the roll is taken",
      caption:
        "The child who was added in the People tab is suspended for a week, with a reason, so that the roll shows what a suspension does to attendance.",
      covers: ["PPL-06"],
    },
    async () => {
      await walk.click(tab(page, "People"));
      await walk.click(page.getByRole("button", { name: `Suspend ${child}` }));
      await walk.type(page.getByRole("dialog").getByLabel("Why are you suspending them?"), q.suspendReason);
      await walk.type(page.getByRole("dialog").getByLabel("Last day of the suspension"), typedDay(7));
      await walk.click(page.getByRole("dialog").getByRole("button", { name: "Suspend", exact: true }));
      await expect(page.getByText(`${child} is suspended.`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 270,
      chapter,
      role: "Teacher",
      title: "A teacher takes the roll with one tap for everyone present, and a suspended person is flagged",
      caption:
        "The roll lists the people of the group. One tap marks everyone present; one person is then marked absent, with a note. The suspended child is flagged and cannot be marked. One save records it all, and each mark says who made it.",
      covers: ["PAT-03", "PAT-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openAttendance(walk, page);
      await walk.selectOption(page.getByLabel("Group", { exact: true }), p.hifz.second);
      await expect(page.getByText("not taken yet")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save attendance" })).toBeDisabled();
      const flagged = roll(page).getByRole("listitem").filter({ hasText: child });
      await expect(flagged.getByText("Suspended", { exact: true })).toBeVisible();
      for (const status of ["Present", "Late", "Absent", "Excused"]) await expect(choose(page, child, status)).toBeDisabled();
      await walk.click(page.getByRole("button", { name: "Mark everyone present" }));
      await expect(choose(page, yusuf, "Present")).toHaveAttribute("aria-pressed", "true");
      await walk.click(choose(page, yusuf, "Absent"));
      await walk.click(page.getByRole("button", { name: `Add a note for ${yusuf}` }));
      await walk.type(page.getByLabel(`Note for ${yusuf}`), a.note);
      await walk.click(page.getByRole("button", { name: "Save attendance" }));
      await expect(page.getByText(/Saved: \d+ marked, 0 corrected\./)).toBeVisible();
      await expect(page.getByText(`Marked by ${teacher}`).first()).toBeVisible();
      await expect(page.getByText(`Note: ${a.note}`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 271,
      chapter,
      role: "Teacher",
      title: "A mark is corrected within the week without a reason, and its history keeps what it replaced",
      caption:
        "A teacher can change a mark within the week without saying why; the roll says it was corrected once, and the history lists the change from what it was to what it is now.",
      covers: ["PAT-03"],
    },
    async () => {
      await walk.click(choose(page, yusuf, "Late"));
      await expect(page.getByLabel("Why are you correcting a mark?")).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: "Save attendance" }));
      await expect(page.getByText("Saved: 0 marked, 1 corrected.")).toBeVisible();
      await expect(page.getByText("corrected 1 time")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Attendance history of ${yusuf}` }));
      await expect(dialog(page, `Attendance of ${yusuf}`).getByText(/changed Absent to Late/)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 272,
      chapter,
      role: "Teacher",
      title: "Two sessions on one day are told apart by name, and a day older than a week cannot be marked",
      caption:
        "A second roll on the same day is given a session name. The date picker stops at today, and a day more than a week back says from when attendance can be taken, and offers no buttons to mark it.",
      covers: ["PAT-05", "PAT-08"],
    },
    async () => {
      await walk.click(dialog(page, `Attendance of ${yusuf}`).getByRole("button", { name: "Close" }).last());
      await walk.type(page.getByLabel("Session name"), a.session);
      await expect(page.getByText(new RegExp(`· ${a.session} · not taken yet`))).toBeVisible();
      await walk.click(choose(page, guardian, "Absent"));
      await walk.click(page.getByRole("button", { name: "Save attendance" }));
      await expect(page.getByText("Saved: 1 marked, 0 corrected.")).toBeVisible();
      await expect(page.getByLabel("Date", { exact: true })).toHaveAttribute("max", isoToday());
      await typeDate(walk, page, page.getByLabel("Date", { exact: true }), typedDay(-10));
      await expect(page.getByText(/You can take attendance from .* onward/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Save attendance" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Mark everyone present" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 273,
      chapter,
      role: "Non-teaching staff",
      title: "A supervisor reads every group and may only correct a mark, always with a reason, and the history keeps it",
      caption:
        "A supervisor cannot add a mark, only correct one that exists, and must say why: the save stays disabled until a reason is given. The history lists the change, who made it and the reason.",
      covers: ["PAT-07"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await openAttendance(walk, page);
      await walk.selectOption(page.getByLabel("Group", { exact: true }), p.hifz.second);
      await expect(page.getByText(/You can correct a mark that exists, and must say why/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Mark everyone present" })).toBeDisabled();
      await expect(choose(page, yusuf, "Late")).toHaveAttribute("aria-pressed", "true");
      await walk.click(choose(page, yusuf, "Excused"));
      await expect(page.getByLabel("Why are you correcting a mark?")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save attendance" })).toBeDisabled();
      await walk.type(page.getByLabel("Why are you correcting a mark?"), a.reason);
      await walk.click(page.getByRole("button", { name: "Save attendance" }));
      await expect(page.getByText("Saved: 0 marked, 1 corrected.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Attendance history of ${yusuf}` }));
      await expect(dialog(page, `Attendance of ${yusuf}`).getByText(new RegExp(`changed Late to Excused \\(${a.reason}\\)`))).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 274,
      chapter,
      role: "Superadmin",
      title: "The summary flags the people whose attendance is low, and this week lists the sessions held",
      caption:
        "The summary gives each person's percentage over the days chosen and flags those under the program's limit. This week lists the sessions held, each with a way into its roll.",
      covers: ["PAT-10", "PAT-11"],
    },
    async () => {
      await walk.click(dialog(page, `Attendance of ${yusuf}`).getByRole("button", { name: "Close" }).last());
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openAttendance(walk, page);
      await walk.click(tab(page, "Summary"));
      const summary = page.getByRole("list", { name: "Attendance summary" });
      await expect(summary.getByRole("listitem").first()).toContainText("%");
      await expect(summary.getByText(/Low/).first()).toBeVisible();
      await walk.click(tab(page, "This week"));
      const week = page.getByRole("list", { name: "Sessions this week" });
      await expect(week.getByRole("listitem").first()).toContainText("marked");
      await walk.click(week.getByRole("button", { name: new RegExp(`^Open the roll of ${p.hifz.second}`) }).first());
      await expect(tab(page, "Roll call")).toHaveAttribute("aria-selected", "true");
    },
  );

  await walk.step(
    {
      id: 275,
      chapter,
      role: "Superadmin",
      title: "Attendance is turned off for the program and back on, and the limit it flags under is checked",
      caption:
        "The program's own Settings has the attendance switch and the percentage a person is flagged under. Off, the Attendance tab goes; on again, it returns. A number out of range is refused beside the field.",
      covers: ["PAT-12"],
    },
    async () => {
      await walk.click(tab(page, "Settings"));
      await expect(page.getByTestId("attendance-state")).toHaveText("On.");
      await walk.click(page.getByLabel("Take attendance in this program"));
      await walk.type(page.getByLabel("Flag a person under (%)"), a.flagTyped);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText("The settings were saved.")).toBeVisible();
      await expect(page.getByTestId("attendance-state")).toContainText("switched off for this program");
      await expect(tab(page, "Attendance")).toHaveCount(0);
      await walk.click(page.getByLabel("Take attendance in this program"));
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByTestId("attendance-state")).toHaveText("On.");
      await walk.type(page.getByLabel("Flag a person under (%)"), a.flagBad);
      await expect(page.getByText("Enter a whole number from 1 to 100.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
      await walk.type(page.getByLabel("Flag a person under (%)"), a.flagKept);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText("The settings were saved.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 276,
      chapter,
      role: "Superadmin",
      title: "The school and each branch have an attendance switch of their own, beside the programs switch",
      caption:
        "In Settings the attendance of programs has its own switch for the school and for each branch; turning it off for a branch leaves the programs switch alone. Off for the school, no program takes attendance and what was recorded can only be read.",
      covers: ["PAT-13"],
    },
    async () => {
      await openPage(walk, page, "Settings");
      await walk.click(page.getByRole("button", { name: "Programs", exact: true }));
      await expect(page.getByRole("heading", { name: "Attendance in programs" })).toBeVisible();
      await expect(page.getByText("Attendance is on for the school", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Turn off program attendance for ${arabic}` }));
      await expect(page.getByText(`${arabic} no longer takes attendance in programs.`)).toBeVisible();
      await expect(page.getByRole("button", { name: `Turn off programs for ${arabic}` })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Turn program attendance back on for ${arabic}` }));
      await expect(page.getByText(`${arabic} takes attendance in programs again.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn off attendance for the school" }));
      await expect(page.getByText("Attendance is off for the school", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn on attendance for the school" }));
      await expect(page.getByText("Attendance is on for the school", { exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 277,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator reads the roll of their own branch's people and is offered no way to mark",
      caption:
        "The branch administrator sees only the people of their own branch on a roll, is told that they can read it but not change it, and has no Save, no Mark everyone present, and no Settings.",
      covers: ["PAT-09"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openAttendance(walk, page);
      await walk.selectOption(page.getByLabel("Group", { exact: true }), p.hifz.second);
      await expect(page.getByText("You can read this roll but not change it.")).toBeVisible();
      await expect(roll(page).getByRole("listitem").filter({ hasText: yusuf })).toBeVisible();
      await expect(page.getByText(child)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save attendance" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Mark everyone present" })).toHaveCount(0);
      await expect(choose(page, yusuf, "Present")).toBeDisabled();
      await expect(tab(page, "Settings")).toHaveCount(0);
    },
  );
}
