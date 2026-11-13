import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, programAssessments as m, programPeople as q, programs as p, pupils, school } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C28 Program assessments (task 0033, section 6.28): tests and recitation checks inside a program. The superadministrator turns assessments on for the program and gives it grades (two grades with one name are refused),
// makes an assessment as a draft for a group (a score limit that cannot be right is refused beside the field) and opens it for scores. The teacher enters scores and results for the people of their groups (a score
// above the maximum is refused, an absent person has no score field, a suspended person is not sitting), saves them in one go, corrects one and reads its history. The superadministrator marks the assessment complete and
// publishes it after a confirmation, corrects a published score only with a reason, and reads each person's average and grade. After marking the teacher can only read; a branch administrator reads the sheet of their own
// branch's people and cannot enter anything. The school's and a branch's switch for assessments sit in Settings beside the others.

const chapter = "C28 Program assessments";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const full = (person: { first: string; last: string }) => `${person.first} ${person.last}`;
const english = school.branches.englishPrimary;
const arabic = school.branches.arabicPrimary;
const teacher = cast.teacher.name;
const yusuf = full(pupils.yusuf);
const child = full(q.child);
const guardian = full(q.guardian);
const assessments = (page: Page): Locator => page.getByRole("list", { name: "Assessments" });

async function openAssessments(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Programs");
  await walk.click(page.getByRole("link", { name: p.hifz.name }));
  await walk.click(tab(page, "Assessments"));
}

async function openSheet(walk: Walk, page: Page): Promise<void> {
  await walk.click(page.getByRole("button", { name: `Open ${m.title}` }));
  await expect(page.getByRole("heading", { name: new RegExp(m.title) })).toBeVisible();
}

export async function c28ProgramAssessments(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 278,
      chapter,
      role: "Superadmin",
      title: "Assessments are turned on for the program and given grades; two grades with one name are refused",
      caption:
        "A program uses assessments only when it is switched on in its Settings. The grades say what a percentage is called: Fail from 0, Pass from 50. Two grades cannot share a name, and the page says so before it will save.",
      covers: ["PAS-09"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await expect(tab(page, "Assessments")).toHaveCount(0);
      await walk.click(tab(page, "Settings"));
      await expect(page.getByTestId("assessments-state")).toContainText("switched off for this program");
      await walk.click(page.getByLabel("Use assessments in this program"));
      await walk.click(page.getByRole("button", { name: "Add a grade" }));
      await walk.type(page.getByLabel("Grade 1 name"), m.grades[0].name);
      await walk.type(page.getByLabel("Grade 1 from (%)"), m.grades[0].from);
      await walk.click(page.getByRole("button", { name: "Add a grade" }));
      await walk.type(page.getByLabel("Grade 2 name"), m.duplicateName);
      await walk.type(page.getByLabel("Grade 2 from (%)"), m.grades[1].from);
      await expect(page.getByText("Each grade needs a different name.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
      await walk.type(page.getByLabel("Grade 2 name"), m.grades[1].name);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText("The settings were saved.")).toBeVisible();
      await expect(tab(page, "Assessments")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 279,
      chapter,
      role: "Superadmin",
      title: "An assessment is made as a draft for a group, a limit that cannot be right is refused, and it is opened for scores",
      caption:
        "An assessment has a title, a kind, what it is out of and a pass mark, and the groups who sit it. It starts as a draft that teachers cannot see. A maximum of five thousand is refused beside the field; opening it for scores lets the teachers enter them.",
      covers: ["PAS-01"],
    },
    async () => {
      await walk.click(tab(page, "Assessments"));
      await expect(page.getByText("There is no assessment to show yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New assessment" }));
      const make = dialog(page, "New assessment");
      await walk.type(make.getByLabel("Title"), m.title);
      await walk.type(make.getByLabel("Kind"), m.kind);
      await walk.type(make.getByLabel("Out of"), m.outOf);
      await walk.type(make.getByLabel("Pass mark"), m.passMark);
      await walk.click(make.getByLabel(p.hifz.second, { exact: true }));
      await walk.click(make.getByRole("button", { name: "Make assessment" }));
      await expect(page.getByText("The assessment was made as a draft.")).toBeVisible();
      const row = assessments(page).getByRole("listitem").filter({ hasText: m.title });
      await expect(row).toContainText("Draft");
      await expect(row).toContainText(`out of ${m.outOf} · pass mark ${m.passMark}`);
      await walk.click(page.getByRole("button", { name: "New assessment" }));
      const again = dialog(page, "New assessment");
      await walk.type(again.getByLabel("Title"), m.tooBigTitle);
      await walk.type(again.getByLabel("Out of"), m.tooBig);
      await walk.click(again.getByRole("button", { name: "Make assessment" }));
      await expect(again.getByText(/at most 1000|can be at most/)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 280,
      chapter,
      role: "Superadmin",
      title: "The draft is opened for scores",
      caption:
        "Opening the assessment for scores is a step of its own; from then on the teachers of the group see it and can enter what each person scored.",
      covers: ["PAS-01"],
    },
    async () => {
      await walk.click(dialog(page, "New assessment").getByRole("button", { name: "Cancel" }));
      await openSheet(walk, page);
      await walk.click(page.getByRole("button", { name: "Open for scores" }));
      await expect(page.getByText("The assessment is open for scores.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Mark as complete" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 281,
      chapter,
      role: "Teacher",
      title:
        "A teacher enters scores in one save: a score above the maximum is refused, an absent person has no score, a suspended person is not sitting",
      caption:
        "The teacher sees the assessment for their group and cannot make one. A score above the maximum is refused beside its field and cannot be saved. An absent person is given a result instead of a score, and the suspended child is shown as not sitting, with no field. One save records everything, and each score says who entered it.",
      covers: ["PAS-02", "PAS-03", "PAS-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openAssessments(walk, page);
      await expect(page.getByRole("button", { name: "New assessment" })).toHaveCount(0);
      await openSheet(walk, page);
      await expect(page.getByRole("button", { name: "Mark as complete" })).toHaveCount(0);
      await expect(page.getByText("Nothing to save.")).toBeVisible();
      await expect(page.getByText("Not sitting (suspended)")).toBeVisible();
      await expect(page.getByLabel(`Score for ${child}`)).toHaveCount(0);
      await walk.type(page.getByLabel(`Score for ${yusuf}`), m.over);
      await expect(page.getByText(`A score can't be above the maximum of ${m.outOf}.`)).toBeVisible();
      await expect(page.getByRole("button", { name: "Save scores" })).toBeDisabled();
      await walk.type(page.getByLabel(`Score for ${yusuf}`), m.score);
      await walk.selectOption(page.getByLabel(`Result for ${guardian}`), "Absent");
      await expect(page.getByLabel(`Score for ${guardian}`)).toBeDisabled();
      await walk.click(page.getByRole("button", { name: `Add a comment for ${yusuf}` }));
      await walk.type(page.getByLabel(`Comment for ${yusuf}`), m.comment);
      await walk.click(page.getByRole("button", { name: "Save scores" }));
      await expect(page.getByText("Saved: 2 entered, 0 changed.")).toBeVisible();
      await expect(page.getByText(new RegExp(`${m.scoreShown} · .*entered by ${teacher}`))).toBeVisible();
      await expect(page.getByText(`Comment: ${m.comment}`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 282,
      chapter,
      role: "Teacher",
      title: "A score is corrected, and its history keeps what it replaced",
      caption:
        "While the assessment is open the teacher can change a score. The sheet says it was changed once, and the history lists the change from what it was to what it is now.",
      covers: ["PAS-02"],
    },
    async () => {
      await walk.type(page.getByLabel(`Score for ${yusuf}`), m.fixed);
      await walk.click(page.getByRole("button", { name: "Save scores" }));
      await expect(page.getByText("Saved: 0 entered, 1 changed.")).toBeVisible();
      await expect(page.getByText("changed 1 time")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Score history of ${yusuf}` }));
      await expect(dialog(page, `Score history of ${yusuf}`).getByText(new RegExp(`changed ${m.scoreShown} to ${m.fixed}`))).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 283,
      chapter,
      role: "Superadmin",
      title: "Marking needs every score in, and publishing asks for a confirmation first",
      caption:
        "The superadministrator marks the assessment complete once every score is in, and then publishes the results. Publishing asks first and says that only a program admin can change a score after that.",
      covers: ["PAS-05"],
    },
    async () => {
      await walk.click(dialog(page, `Score history of ${yusuf}`).getByRole("button", { name: "Close" }).last());
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openAssessments(walk, page);
      await openSheet(walk, page);
      await walk.click(page.getByRole("button", { name: "Mark as complete" }));
      await expect(page.getByText("The assessment is marked complete.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Publish results" }));
      const ask = dialog(page, "Publish results?");
      await expect(ask).toContainText("Only a program admin can change a score after that");
      await walk.click(ask.getByRole("button", { name: "Publish results" }));
      await expect(page.getByText("The results are published.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 284,
      chapter,
      role: "Superadmin",
      title: "A published score is corrected only with a reason, and its history keeps the reason",
      caption:
        "After publishing a score can still be wrong. Changing one asks why, and the save stays disabled until a reason is given. The history lists the change and the reason.",
      covers: ["PAS-06"],
    },
    async () => {
      await walk.type(page.getByLabel(`Score for ${yusuf}`), m.changed);
      await expect(page.getByLabel("Why is a published score being changed?")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save scores" })).toBeDisabled();
      await walk.type(page.getByLabel("Why is a published score being changed?"), m.reason);
      await walk.click(page.getByRole("button", { name: "Save scores" }));
      await expect(page.getByText("Saved: 0 entered, 1 changed.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Score history of ${yusuf}` }));
      await expect(
        dialog(page, `Score history of ${yusuf}`).getByText(new RegExp(`changed ${m.fixed} to ${m.changed} \\(${m.reason}\\)`)),
      ).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 285,
      chapter,
      role: "Superadmin",
      title: "The results show each person's average and grade over the published assessments",
      caption:
        "The Results tab turns the published scores into a weighted average for each person and names the grade it falls in, using the grades set for the program.",
      covers: ["PAS-07"],
    },
    async () => {
      await walk.click(dialog(page, `Score history of ${yusuf}`).getByRole("button", { name: "Close" }).last());
      await walk.click(page.getByRole("button", { name: "Back to the assessments" }));
      await walk.click(tab(page, "Results"));
      const results = page.getByRole("list", { name: "Results" });
      await expect(results.getByRole("listitem").filter({ hasText: yusuf })).toContainText(`90% · ${m.grades[1].name}`);
    },
  );

  await walk.step(
    {
      id: 286,
      chapter,
      role: "Teacher",
      title: "After marking, the teacher can only read the sheet",
      caption:
        "Once the assessment is marked and published the teacher's sheet has no fields and no Save: they read what was entered, and only a program admin can change it.",
      covers: ["PAS-05"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openAssessments(walk, page);
      await openSheet(walk, page);
      await expect(page.getByRole("button", { name: "Save scores" })).toHaveCount(0);
      await expect(page.getByLabel(`Score for ${yusuf}`)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 287,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator reads the sheet of their own branch's people and cannot enter anything",
      caption:
        "The branch administrator sees only the people of their own branch on the sheet. There is no Save, no Mark as complete, no score field, and no Settings.",
      covers: ["PAS-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openAssessments(walk, page);
      await openSheet(walk, page);
      await expect(page.getByText(yusuf)).toBeVisible();
      await expect(page.getByText(child)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Save scores" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Mark as complete" })).toHaveCount(0);
      await expect(page.getByLabel(`Score for ${yusuf}`)).toHaveCount(0);
      await expect(tab(page, "Settings")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 288,
      chapter,
      role: "Superadmin",
      title: "Assessments have a switch for the school and for each branch, beside the others",
      caption:
        "In Settings, assessments in programs have their own switch for the school and for each branch. Turning one branch off leaves the other switches alone; off for the school, no program uses assessments and what was recorded can only be read.",
      covers: ["PAS-09"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Settings");
      await walk.click(page.getByRole("button", { name: "Programs", exact: true }));
      await expect(page.getByRole("heading", { name: "Assessments in programs" })).toBeVisible();
      await expect(page.getByText("Assessments is on for the school", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Turn off program assessments for ${arabic}` }));
      await expect(page.getByText(`${arabic} no longer uses assessments in programs.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Turn program assessments back on for ${arabic}` }));
      await expect(page.getByText(`${arabic} uses assessments in programs again.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn off assessments for the school" }));
      await expect(page.getByText("Assessments is off for the school", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn on assessments for the school" }));
      await expect(page.getByText("Assessments is on for the school", { exact: true })).toBeVisible();
      await expect(page.getByText(english).first()).toBeVisible();
    },
  );
}
