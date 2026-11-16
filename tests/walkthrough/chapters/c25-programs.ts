import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, programs as p, school } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C25 Programs (task 0033, section 6.25): learning that is not a normal class. The superadministrator starts a program that never ends, in two branches, with its own level names (nothing filled in is explained
// first), and a program for a set period with a branch of its own (a branch name already taken is refused); reads and edits its details (a bad date is explained beside its field); builds the structure of
// groups inside groups, renames, moves, archives and restores them, and cannot take away a level that is in use; activates, archives (the page turns read only) and restores a program; adds and removes a branch
// (the program's own branch cannot be removed); names two members of staff as program admins and ends one place. The named program admin changes the structure but cannot name admins; a branch administrator
// reads and changes nothing; a member of staff with no place is told so and finds nothing at the program's address. The school's programs switch is turned off for a branch and for the school and back on.

const chapter = "C25 Programs";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const groups = (page: Page): Locator => page.getByRole("list", { name: "Groups of the program" });
const english = school.branches.englishPrimary;
const arabic = school.branches.arabicPrimary;

export async function c25Programs(walk: Walk, page: Page): Promise<void> {
  let hifzPath = "";

  await walk.step(
    {
      id: 246,
      chapter,
      role: "Superadmin",
      title: "Programs: a new program is refused until it has a name, and says so beside the field",
      caption:
        "Programs is in the sidebar's Classroom section. A program is learning that is not a normal class: memorising, a short course. The superadministrator starts one; with nothing filled in the form says what is missing and starts nothing.",
      covers: ["PRG-01", "PRG-05"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Programs");
      await expect(page.getByText("No programs yet")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New program" }));
      const create = dialog(page, "New program");
      await walk.click(create.getByRole("button", { name: "Create program" }));
      await expect(create.getByText("Please check the fields marked below.")).toBeVisible();
      await expect(create.getByText("The program name is required")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 247,
      chapter,
      role: "Superadmin",
      title: "A program that never ends, in two branches, with its own names for its levels",
      caption:
        "This program has no end date. It runs in two branches, and its levels are named as the teachers speak: a Juz holds Groups. It starts as a draft, which nobody but the administrators can see.",
      covers: ["PRG-02"],
    },
    async () => {
      const create = dialog(page, "New program");
      await walk.type(create.getByLabel("Program name"), p.hifz.name);
      await walk.click(create.getByLabel(english, { exact: true }));
      await walk.click(create.getByLabel(arabic, { exact: true }));
      await walk.type(create.getByLabel("Level 1", { exact: true }), p.hifz.levels[0]);
      await walk.click(create.getByRole("button", { name: "Add a level" }));
      await walk.type(create.getByLabel("Level 2", { exact: true }), p.hifz.levels[1]);
      await walk.click(create.getByRole("button", { name: "Create program" }));
      await expect(page.getByRole("heading", { level: 1, name: p.hifz.name })).toBeVisible();
      await expect(page.getByText("Draft", { exact: true })).toBeVisible();
      await expect(page.getByText("Never ends", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Branches" })).toBeVisible();
      hifzPath = new URL(page.url()).pathname;
    },
  );

  await walk.step(
    {
      id: 248,
      chapter,
      role: "Superadmin",
      title: "A program for a set period works out its last day, and can have a branch of its own",
      caption:
        "A course of six months is given its first day and a length, and the last day is worked out. It can also be given a branch of its own, created with it; a name that another branch already has is refused and said so.",
      covers: ["PRG-03", "PRG-04", "PRG-05"],
    },
    async () => {
      await walk.click(page.getByRole("link", { name: "All programs" }));
      await walk.click(page.getByRole("button", { name: "New program" }));
      const create = dialog(page, "New program");
      await walk.type(create.getByLabel("Program name"), p.course.name);
      await walk.selectOption(create.getByLabel("Kind"), "For a set period");
      await walk.type(create.getByLabel("Starts on"), p.course.startsTyped);
      await walk.selectOption(create.getByLabel("Runs for"), "6 months");
      await walk.click(create.getByLabel("Give it a branch of its own"));
      await walk.type(create.getByLabel("Name of its own branch"), p.course.ownBranchTaken);
      await walk.click(create.getByRole("button", { name: "Create program" }));
      await expect(create.getByText(/already/i).first()).toBeVisible();
      await walk.type(create.getByLabel("Name of its own branch"), p.course.ownBranch);
      await walk.click(create.getByRole("button", { name: "Create program" }));
      await expect(page.getByRole("heading", { level: 1, name: p.course.name })).toBeVisible();
      await expect(page.getByText(new RegExp(`${p.course.startsText} to `)).first()).toBeVisible();
      await expect(page.getByText("Its own branch")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 249,
      chapter,
      role: "Superadmin",
      title: "The program's details and history, and editing them: a bad date is explained beside its field",
      caption:
        "The Overview shows the program's details, its branches and its history in words. Editing the details checks the dates: an end date before the start is refused beside the field. A real change is kept and the history says who made it.",
      covers: ["PRG-06", "PRG-07"],
    },
    async () => {
      await expect(page.getByRole("region", { name: "History" }).getByText(`${cast.superadmin.name} created the program`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Edit details" }));
      const edit = dialog(page, "Edit details");
      await walk.type(edit.getByLabel("Ends on (the last day)"), p.course.badEndTyped);
      await walk.click(edit.getByRole("button", { name: "Save" }));
      await expect(edit.getByText("The end date must be after the start date.")).toBeVisible();
      await walk.type(edit.getByLabel("Ends on (the last day)"), p.course.endTyped);
      await walk.type(edit.getByLabel("Program name"), p.course.renamed);
      await walk.click(edit.getByRole("button", { name: "Save" }));
      await expect(page.getByRole("heading", { level: 1, name: p.course.renamed })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 250,
      chapter,
      role: "Superadmin",
      title: "The structure: groups, and groups inside groups, each shown inside the one above",
      caption:
        "The Structure tab holds the levels and the groups. A Juz is added first, then a Group inside it. A group of the last level has nothing below it, so no button offers one.",
      covers: ["PRG-10"],
    },
    async () => {
      await walk.click(page.getByRole("link", { name: "All programs" }));
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "Structure"));
      await expect(page.getByText("No groups yet")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Add ${p.hifz.levels[0]}`, exact: true }));
      await walk.type(dialog(page, `Add a ${p.hifz.levels[0]}`).getByLabel(`${p.hifz.levels[0]} name`), p.hifz.top);
      await walk.click(dialog(page, `Add a ${p.hifz.levels[0]}`).getByRole("button", { name: "Add" }));
      await expect(groups(page).getByText(p.hifz.top)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Add a ${p.hifz.levels[1]} inside ${p.hifz.top}` }));
      await walk.type(dialog(page, `Add a ${p.hifz.levels[1]} inside ${p.hifz.top}`).getByLabel(`${p.hifz.levels[1]} name`), p.hifz.child);
      await walk.click(dialog(page, `Add a ${p.hifz.levels[1]} inside ${p.hifz.top}`).getByRole("button", { name: "Add" }));
      await expect(page.getByRole("list", { name: `Inside ${p.hifz.top}` }).getByText(p.hifz.child)).toBeVisible();
      await expect(page.getByRole("button", { name: new RegExp(`Add a .* inside ${p.hifz.child}`) })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 251,
      chapter,
      role: "Superadmin",
      title: "Groups are renamed, reordered, archived and restored; the same name twice is refused; a level in use cannot go",
      caption:
        "The same name twice in one place is refused in the dialog, which stays open. A group is renamed, moved up, archived (it leaves the list) and restored. A level name cannot be taken away while groups of that level exist.",
      covers: ["PRG-11", "PRG-12"],
    },
    async () => {
      const levelOne = p.hifz.levels[0];
      await walk.click(page.getByRole("button", { name: `Add ${levelOne}`, exact: true }));
      const again = dialog(page, `Add a ${levelOne}`);
      await walk.type(again.getByLabel(`${levelOne} name`), p.hifz.top.toLowerCase());
      await walk.click(again.getByRole("button", { name: "Add" }));
      await expect(again.getByText("There is already a group with this name here.")).toBeVisible();
      await walk.type(again.getByLabel(`${levelOne} name`), p.hifz.second);
      await walk.click(again.getByRole("button", { name: "Add" }));
      const topLevel = groups(page).locator(":scope > li > div > p");
      await expect(topLevel).toHaveText([new RegExp(p.hifz.top), new RegExp(p.hifz.second)]);
      await walk.click(page.getByRole("button", { name: `Move ${p.hifz.second} up` }));
      await expect(topLevel).toHaveText([new RegExp(p.hifz.second), new RegExp(p.hifz.top)]);
      await walk.click(page.getByRole("button", { name: `Rename ${p.hifz.child}` }));
      await walk.type(dialog(page, `Rename ${p.hifz.child}`).getByLabel("Group name"), p.hifz.renamed);
      await walk.click(dialog(page, `Rename ${p.hifz.child}`).getByRole("button", { name: "Save" }));
      await expect(page.getByText(p.hifz.renamed).first()).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Archive ${p.hifz.renamed}` }));
      await expect(groups(page).getByText(p.hifz.renamed)).toHaveCount(0);
      await walk.click(page.getByLabel(/Show archived/));
      await walk.click(page.getByRole("button", { name: `Restore ${p.hifz.renamed}` }));
      await expect(page.getByRole("button", { name: `Archive ${p.hifz.renamed}` })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Change level names" }));
      const levels = dialog(page, "Level names");
      await walk.click(levels.getByRole("button", { name: "Remove level 2" }));
      await walk.click(levels.getByRole("button", { name: "Save" }));
      await expect(levels.getByRole("alert").filter({ hasText: /groups/i })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 252,
      chapter,
      role: "Superadmin",
      title: "A draft is activated, archived after a confirmation (it turns read only) and restored",
      caption:
        "A program starts as a draft and is activated when it is ready. Archiving asks first; an archived program can only be read, with no Edit details and no way to add a group. Restoring brings it back as a draft, and it is activated again.",
      covers: ["PRG-08"],
    },
    async () => {
      await walk.click(levelsCancel(page));
      await walk.click(tab(page, "Overview"));
      await walk.click(page.getByRole("button", { name: "Activate" }));
      await expect(page.getByText("The program is active.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Archive", exact: true }));
      const sure = dialog(page, "Archive this program?");
      await walk.click(sure.getByRole("button", { name: "Cancel" }));
      await walk.click(page.getByRole("button", { name: "Archive", exact: true }));
      await walk.click(sure.getByRole("button", { name: "Archive program" }));
      await expect(page.getByText("This program is archived and can only be read.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit details" })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: "Restore" }));
      await expect(page.getByText("The program is back as a draft.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Activate" }));
      await expect(page.getByText("The program is active.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 253,
      chapter,
      role: "Superadmin",
      title: "A branch is added to a program and removed; the program's own branch cannot be removed",
      caption:
        "A program can run in more branches later and stop running in one. A branch that was created with the program is its own and has no Remove button.",
      covers: ["PRG-09"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Add a branch" }));
      await walk.selectOption(dialog(page, "Add a branch").getByLabel("Branch"), school.branches.added);
      await walk.click(dialog(page, "Add a branch").getByRole("button", { name: "Add branch" }));
      await expect(page.getByText("The branch was added.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Remove ${school.branches.added} from the program` }));
      await walk.click(page.getByRole("dialog").getByRole("button", { name: "Remove branch" }));
      await expect(page.getByText("The branch was removed.")).toBeVisible();
      await walk.click(page.getByRole("link", { name: "All programs" }));
      await walk.click(page.getByRole("link", { name: p.course.renamed }));
      await expect(page.getByText("Its own branch")).toBeVisible();
      await expect(page.getByRole("button", { name: `Remove ${p.course.ownBranch} from the program` })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 254,
      chapter,
      role: "Superadmin",
      title: "Program admins are named from the staff of the program's branches, and a place can be ended",
      caption:
        "Only the superadministrator names the people who run a program, and only from the staff of its branches. Ending a place asks for a confirmation; the person is no longer an admin of the program.",
      covers: ["PRG-13"],
    },
    async () => {
      await walk.click(page.getByRole("link", { name: "All programs" }));
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "Staff"));
      await expect(page.getByText("No program admin has been named")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Name a program admin" }));
      const name = dialog(page, "Name a program admin");
      await walk.selectOption(name.getByLabel("Member of staff"), `${cast.staff.name} (Non-teaching staff, ${english})`);
      await walk.click(name.getByRole("button", { name: "Name program admin" }));
      await expect(page.getByText(`${cast.staff.name} now runs the program.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `End ${cast.staff.name}'s place as program admin` }));
      await walk.click(page.getByRole("dialog").getByRole("button", { name: "End place" }));
      await expect(page.getByText("No program admin has been named")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Name a program admin" }));
      await walk.selectOption(
        dialog(page, "Name a program admin").getByLabel("Member of staff"),
        `${cast.teacher.name} (Teaching staff, ${english})`,
      );
      await walk.click(dialog(page, "Name a program admin").getByRole("button", { name: "Name program admin" }));
      await expect(page.getByText(`${cast.teacher.name} now runs the program.`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 255,
      chapter,
      role: "Teacher",
      title: "A named program admin finds the program and changes its structure, but names no admins",
      caption:
        "A teacher who has been named an admin of the program finds it on their Programs page and can build its structure. Naming admins and adding branches stay with the superadministrator.",
      covers: ["PRG-14"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "Structure"));
      await walk.click(page.getByRole("button", { name: `Add ${p.hifz.levels[0]}`, exact: true }));
      await walk.type(dialog(page, `Add a ${p.hifz.levels[0]}`).getByLabel(`${p.hifz.levels[0]} name`), "Juz C");
      await walk.click(dialog(page, `Add a ${p.hifz.levels[0]}`).getByRole("button", { name: "Add" }));
      await expect(groups(page).getByText("Juz C")).toBeVisible();
      await walk.click(tab(page, "Staff"));
      await expect(page.getByRole("button", { name: "Name a program admin" })).toHaveCount(0);
      await walk.click(tab(page, "Overview"));
      await expect(page.getByRole("button", { name: "Add a branch" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 256,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator reads the programs of their branch and is offered nothing to change",
      caption:
        "The branch administrator sees the programs that run in their branch. There is no New program, no Edit details, no Activate or Archive, no Rename or Move, and no way to name an admin: reading is all they are given.",
      covers: ["PRG-15"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Programs");
      await expect(page.getByRole("button", { name: "New program" })).toHaveCount(0);
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      for (const name of ["Edit details", "Activate", "Archive", "Add a branch", "Restore"])
        await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
      await walk.click(tab(page, "Structure"));
      await expect(groups(page).getByText(p.hifz.top)).toBeVisible();
      await expect(page.getByRole("button", { name: /^(Rename|Archive|Move)/ })).toHaveCount(0);
      await walk.click(tab(page, "Staff"));
      await expect(page.getByRole("button", { name: "Name a program admin" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 257,
      chapter,
      role: "Non-teaching staff",
      title: "A member of staff with no place in a program is told so, and its address says only that it was not found",
      caption:
        "Someone with no place in any program is told they are not part of one, and sees none. Typing the address of a real program gives the same answer as an address that does not exist, so nothing says which programs there are.",
      covers: ["PRG-01", "PRG-16", "PPL-11"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await openPage(walk, page, "Programs");
      await expect(page.getByText("You are not part of any program yet.")).toBeVisible();
      await expect(page.getByRole("link", { name: p.hifz.name })).toHaveCount(0);
      const typed = await walk.typedAddress(`${new URL(page.url()).origin}${hifzPath}`);
      await expect(typed.getByText("We could not find that program.")).toBeVisible();
      await expect(typed.getByText(p.hifz.name)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 258,
      chapter,
      role: "Superadmin",
      title: "Programs can be switched off for a branch, and for the whole school, and back on",
      caption:
        "In Settings the school decides whether programs exist at all, and a branch can turn them off for itself but never back on over the school's choice. Turned off for the school, Programs says so and offers no New program, and a link leads to Settings to turn them on.",
      covers: ["PRG-17"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Settings");
      await walk.click(page.getByRole("button", { name: "Programs", exact: true }));
      await expect(page.getByText("On for the school", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Turn off programs for ${english}` }));
      await expect(page.getByText(`${english} no longer takes part in programs.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Turn programs back on for ${english}` }));
      await expect(page.getByText(`${english} takes part in programs again.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn off for the school" }));
      await expect(page.getByText("Off for the school", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Turn (off programs for|programs back on for)/ })).toHaveCount(0);
      await walk.click(page.getByRole("link", { name: "Programs", exact: true }).first());
      await expect(page.getByText("Programs are switched off for the school.")).toBeVisible();
      await expect(page.getByRole("button", { name: "New program" })).toHaveCount(0);
      await walk.click(page.getByRole("link", { name: /Switch them on in Settings/ }));
      await walk.click(page.getByRole("button", { name: "Programs", exact: true }));
      await walk.click(page.getByRole("button", { name: "Turn on for the school" }));
      await expect(page.getByText("Programs are on for the school.")).toBeVisible();
    },
  );
}

const levelsCancel = (page: Page): Locator => dialog(page, "Level names").getByRole("button", { name: "Cancel" });
