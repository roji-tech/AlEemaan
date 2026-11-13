import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, programPeople as q, programs as p, pupils, school } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C26 Program people (task 0033, section 6.26): who takes part in a program. The superadministrator adds a pupil by searching the school's records (the dialog stays open for the next one), a whole class after it says
// who would be added and who would be skipped, and a new person typed in (a child needs a birth date and a guardian; a namesake is asked about); moves a person, withdraws one with a reason and enrols them
// again; suspends, lifts, expels and reinstates a person who has no school record, each with a reason and a history; searches and filters the list and reads the counts on the Structure tab. A branch administrator sees
// only the people who are in the program through their own branch and is never offered Expel.

const chapter = "C26 Program people";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const people = (page: Page): Locator => page.getByRole("list", { name: "People in the program" });
const row = (page: Page, name: string): Locator => people(page).locator(":scope > li").filter({ hasText: name });
const anyDialog = (page: Page): Locator => page.getByRole("dialog");
const full = (person: { first: string; last: string }) => `${person.first} ${person.last}`;
const typedDay = (offset: number): string => {
  const day = new Date(Date.now() + offset * 86_400_000);
  return `${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}${day.getFullYear()}`;
};
const aisha = full(pupils.aisha);
const yusuf = full(pupils.yusuf);
const child = full(q.child);
const guardian = full(q.guardian);

export async function c26ProgramPeople(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 259,
      chapter,
      role: "Superadmin",
      title: "A pupil is added to the program by searching the school's records",
      caption:
        "The People tab lists who is in the program. A pupil is found by searching the school's own records: the record is linked, never typed again. The dialog stays open so that several can be added in a row, and a pupil who is already in is marked and cannot be added twice.",
      covers: ["PPL-01", "PPL-02"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "People"));
      await expect(page.getByText("No one is in this program yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add people" }));
      const add = dialog(page, "Add people");
      await walk.selectOption(add.getByLabel("Which group do they join?"), q.group);
      await walk.type(add.getByLabel("Search for a pupil"), pupils.aisha.first);
      await walk.click(add.getByRole("button", { name: `Add ${aisha}` }));
      await expect(page.getByText(`${aisha} was added.`)).toBeVisible();
      await expect(add.getByText("Already in this program")).toBeVisible();
      await expect(add.getByRole("button", { name: `Add ${aisha}` })).toBeDisabled();
    },
  );

  await walk.step(
    {
      id: 260,
      chapter,
      role: "Superadmin",
      title: "A whole class is added in one step, after it says who would be added and who would be skipped",
      caption:
        "Choosing a whole class first shows what would happen: the pupils who would be added, and those who would be skipped because they are already in. Only then is the class added.",
      covers: ["PPL-03"],
    },
    async () => {
      const add = dialog(page, "Add people");
      await walk.selectOption(add.getByLabel("Who are you adding?"), "A whole class of pupils");
      // an option reads "Primary 1 A (Primary (English), 2 pupils)": the count is the school's, so the option is found by its beginning
      const classes = add.getByLabel("Which class?");
      await expect(classes.locator("option")).not.toHaveCount(0);
      const options = await classes.locator("option").allTextContents();
      await walk.selectOption(classes, options.find((text) => text.startsWith(`${q.className} (`)) ?? q.className);
      await walk.click(add.getByRole("button", { name: "See who would be added" }));
      await expect(add.getByText("1 pupil will be added, 1 will be skipped.")).toBeVisible();
      await expect(add.getByRole("list", { name: "Skipped" }).getByText(`${aisha}: already in the program`)).toBeVisible();
      await walk.click(add.getByRole("button", { name: "Add 1 pupil" }));
      await expect(page.getByText(/1 pupil was added from /)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 261,
      chapter,
      role: "Superadmin",
      title: "A new person is typed in: a child needs a birth date and a guardian, and a namesake is asked about",
      caption:
        "Someone with no school record can still take part: an adult, a guardian or a child. A child needs a date of birth and a guardian's name and phone. Typing the name of someone already in the program asks whether it is a different person before it adds anyone.",
      covers: ["PPL-04"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Add people" }));
      const add = dialog(page, "Add people");
      await walk.selectOption(add.getByLabel("Who are you adding?"), "A new person (adult, guardian or child)");
      await walk.selectOption(add.getByLabel("What kind of person?"), "A small child");
      await walk.type(add.getByLabel("First name"), q.child.first);
      await walk.type(add.getByLabel("Last name"), q.child.last);
      await walk.click(add.getByRole("button", { name: "Add person" }));
      await expect(add.getByText("A child needs a date of birth.")).toBeVisible();
      await walk.type(add.getByLabel("Date of birth"), q.child.dobTyped);
      await walk.type(add.getByLabel("Guardian's name"), q.child.guardian);
      await walk.type(add.getByLabel("Guardian's phone"), q.child.phone);
      await walk.selectOption(add.getByLabel("Through which branch?"), school.branches.arabicPrimary);
      await walk.click(add.getByRole("button", { name: "Add person" }));
      await expect(page.getByText(`${child} was added.`)).toBeVisible();
      await walk.type(add.getByLabel("First name"), q.child.first);
      await walk.type(add.getByLabel("Last name"), q.child.last);
      await walk.type(add.getByLabel("Date of birth"), q.child.dobTyped);
      await walk.type(add.getByLabel("Guardian's name"), q.child.guardian);
      await walk.type(add.getByLabel("Guardian's phone"), q.child.phone);
      await walk.click(add.getByRole("button", { name: "Add person" }));
      await expect(add.getByText(/already in this program/)).toBeVisible();
      await expect(add.getByRole("button", { name: "Add person" })).toBeDisabled();
      await walk.click(add.getByLabel("Yes, this is a different person"));
      await expect(add.getByRole("button", { name: "Add person" })).toBeEnabled();
    },
  );

  await walk.step(
    {
      id: 262,
      chapter,
      role: "Superadmin",
      title: "A parent is added too; the list says who, where and in what state; a place is moved, ended with a reason, and opened again",
      caption:
        "Each person is listed with their group and their state. A place is moved to another group. Withdrawing asks why and keeps the person in the list as having left; re-enrolling asks why too and brings them back.",
      covers: ["PPL-01", "PPL-05"],
    },
    async () => {
      await walk.click(dialog(page, "Add people").getByRole("button", { name: "Done" }));
      await walk.click(page.getByRole("button", { name: "Add people" }));
      const parent = dialog(page, "Add people");
      await walk.selectOption(parent.getByLabel("Who are you adding?"), "A new person (adult, guardian or child)");
      await walk.selectOption(parent.getByLabel("What kind of person?"), "A parent or guardian");
      await walk.type(parent.getByLabel("First name"), q.guardian.first);
      await walk.type(parent.getByLabel("Last name"), q.guardian.last);
      await walk.selectOption(parent.getByLabel("Through which branch?"), school.branches.englishPrimary);
      await walk.click(parent.getByRole("button", { name: "Add person" }));
      await expect(page.getByText(`${guardian} was added.`)).toBeVisible();
      await walk.click(parent.getByRole("button", { name: "Done" }));
      await expect(row(page, aisha)).toContainText(q.group);
      await expect(row(page, aisha)).toContainText("Taking part");
      await expect(row(page, child)).toContainText("Child");
      await walk.click(page.getByRole("button", { name: `Move ${yusuf}` }));
      await walk.selectOption(anyDialog(page).getByLabel("New group"), q.otherGroup);
      await walk.click(anyDialog(page).getByRole("button", { name: "Move", exact: true }));
      await expect(page.getByText(`${yusuf} was moved.`)).toBeVisible();
      await expect(row(page, yusuf)).toContainText(q.otherGroup);
      await walk.click(page.getByRole("button", { name: `Withdraw ${yusuf}` }));
      await walk.click(anyDialog(page).getByRole("button", { name: "Withdraw", exact: true }));
      await expect(anyDialog(page).getByText("Say why (at least 3 characters).")).toBeVisible();
      await walk.type(anyDialog(page).getByLabel("Why are they leaving?"), q.leaveReason);
      await walk.click(anyDialog(page).getByRole("button", { name: "Withdraw", exact: true }));
      await expect(page.getByText(`${yusuf} has left the program.`)).toBeVisible();
      await expect(row(page, yusuf)).toContainText("Left the program");
      await walk.click(page.getByRole("button", { name: `Re-enrol ${yusuf}` }));
      await walk.type(anyDialog(page).getByLabel("Why are they coming back?"), q.backReason);
      await walk.click(anyDialog(page).getByRole("button", { name: "Re-enrol", exact: true }));
      await expect(page.getByText(`${yusuf} is back in the program.`)).toBeVisible();
      await expect(row(page, yusuf)).toContainText("Taking part");
    },
  );

  await walk.step(
    {
      id: 263,
      chapter,
      role: "Superadmin",
      title: "Someone with no school record is suspended, lifted, expelled and reinstated, and the history says all of it",
      caption:
        "A person typed in has no school record, so the program keeps their standing. Suspending asks why and for a last day; lifting, expelling and reinstating each ask why. Each is kept in the person's history, in words.",
      covers: ["PPL-06"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Suspend ${child}` }));
      await walk.type(anyDialog(page).getByLabel("Why are you suspending them?"), q.suspendReason);
      await walk.type(anyDialog(page).getByLabel("Last day of the suspension"), typedDay(7));
      await walk.click(anyDialog(page).getByRole("button", { name: "Suspend", exact: true }));
      await expect(page.getByText(`${child} is suspended.`)).toBeVisible();
      await expect(row(page, child)).toContainText("Suspended until");
      await walk.click(page.getByRole("button", { name: `Lift suspension ${child}` }));
      await walk.type(anyDialog(page).getByLabel("Why are you lifting it?"), q.liftReason);
      await walk.click(anyDialog(page).getByRole("button", { name: "Lift suspension", exact: true }));
      await expect(row(page, child)).toContainText("Taking part");
      await walk.click(page.getByRole("button", { name: `Expel ${child}` }));
      await walk.type(anyDialog(page).getByLabel("Why are you expelling them?"), q.expelReason);
      await walk.click(anyDialog(page).getByRole("button", { name: "Expel", exact: true }));
      await expect(row(page, child)).toContainText("Expelled");
      await walk.click(page.getByRole("button", { name: `Reinstate ${child}` }));
      await walk.type(anyDialog(page).getByLabel("Why are you reinstating them?"), q.reinstateReason);
      await walk.click(anyDialog(page).getByRole("button", { name: "Reinstate", exact: true }));
      await expect(row(page, child)).toContainText("Taking part");
      await walk.click(page.getByRole("button", { name: `History of ${child}` }));
      const history = anyDialog(page);
      await expect(history.getByRole("heading", { name: `History of ${child}` })).toBeVisible();
      await expect(history.getByText(q.suspendReason)).toBeVisible();
      await expect(history.getByText(q.expelReason)).toBeVisible();
      await expect(history.getByText(new RegExp(cast.superadmin.name)).first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 264,
      chapter,
      role: "Superadmin",
      title: "The list is searched and filtered, says when nothing matches, and the Structure tab counts the people",
      caption:
        "The list is searched by name and filtered by group, branch, kind and state; when nothing matches it says so. The Structure tab shows how many people each group holds.",
      covers: ["PPL-09", "PPL-10"],
    },
    async () => {
      await walk.click(anyDialog(page).getByRole("button", { name: "Close" }).last());
      await walk.type(page.getByLabel("Search people"), pupils.yusuf.first);
      await expect(page.getByText("1 person", { exact: true })).toBeVisible();
      await expect(row(page, yusuf)).toBeVisible();
      await walk.type(page.getByLabel("Search people"), "");
      await walk.selectOption(page.getByLabel("Group", { exact: true }), q.otherGroup);
      await expect(row(page, yusuf)).toBeVisible();
      await expect(row(page, aisha)).toHaveCount(0);
      await walk.selectOption(page.getByLabel("State", { exact: true }), "Suspended");
      await expect(page.getByText("No one matches.")).toBeVisible();
      await walk.selectOption(page.getByLabel("State", { exact: true }), "");
      await walk.selectOption(page.getByLabel("Group", { exact: true }), "");
      await walk.click(tab(page, "Structure"));
      await expect(page.getByText(/· \d+ pe(rson|ople)/).first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 265,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator sees only the people who are in the program through their own branch, and is never offered Expel",
      caption:
        "The program runs in two branches. A branch administrator is told that they see the people through their own branch; the child who joined through the other branch is not listed, the branch filter offers only their own, and Suspend is offered but Expel never is.",
      covers: ["PPL-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "People"));
      await expect(page.getByText("You see the people who are in the program through your own branch.")).toBeVisible();
      await expect(row(page, aisha)).toBeVisible();
      await expect(page.getByText(child)).toHaveCount(0);
      await expect(row(page, guardian)).toBeVisible();
      await expect(page.getByRole("button", { name: `Suspend ${guardian}` })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Expel / })).toHaveCount(0);
      await expect(page.getByLabel("Branch", { exact: true }).getByRole("option")).toHaveText([
        "Every branch",
        school.branches.englishPrimary,
      ]);
    },
  );
}
