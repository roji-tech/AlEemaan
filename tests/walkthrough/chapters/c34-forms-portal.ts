import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, forms as f, formsPortal as q, pupils } from "../cast";
import { openPage, signIn, signOut } from "./shared";
import { backToStaffSignIn, findPortal, portalSignIn, portalSignOut, section } from "./c12-portal";

// C34 Forms in the portal and marking (task 0033, section 6.34): the pupil takes the practice set of C20 and finds it Finished, a teacher writes a second set with a question marked by hand, the pupil answers it and is told
// what is waiting; the teacher marks it (a score above the points and no score at all are refused), reads the set's own Marking tab and its Results; a questionnaire for the pupils and paper work are made, the pupil answers the
// questionnaire once and asks for the paper work to be marked, and the teacher's roll call flags that pupil, records who handed in and who was late, and has nobody new to add.

const chapter = "C34 Forms portal";

const dialog = (page: Page) => page.getByRole("dialog");
const item = (page: Page, text: string): Locator => page.getByRole("listitem").filter({ hasText: text });
const question = (page: Page, n: number): Locator => dialog(page).getByRole("group", { name: `Question ${n}` });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const panel = (page: Page) => page.getByRole("tabpanel").last();
const yusuf = `${pupils.yusuf.first} ${pupils.yusuf.last}`;
const aisha = `${pupils.aisha.first} ${pupils.aisha.last}`;
const attempt = (page: Page) => page.getByRole("region", { name: "Your attempt" });
const result = (page: Page) => page.getByRole("region", { name: "Your result" });

export async function c34FormsPortal(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 331,
      chapter,
      role: "Pupil",
      title: "A pupil starts a practice set, sees the countdown, answers and is told the result",
      caption:
        "The Forms section of the portal lists the practice sets open for the pupil's class, with the time allowed and whether they were started. Start opens the attempt with a countdown; Submit shows what is marked and the score.",
      covers: ["POR-15"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Forms"));
      await walk.click(tab(page, "Practice sets"));
      const row = item(page, f.practice.editedTitle);
      await expect(row).toContainText(f.practice.instructions);
      await expect(row).toContainText("2 questions");
      await expect(row).toContainText(`${f.practice.editedMinutes} minutes`);
      await expect(row).toContainText("Not started");
      await walk.click(row.getByRole("button", { name: "Start" }));
      await expect(attempt(page).getByRole("timer")).toContainText(/Time left: (19|20):\d\d/);
      await walk.click(attempt(page).getByRole("radio", { name: f.practice.q1.b }));
      await walk.click(attempt(page).getByRole("radio", { name: "True" }));
      await walk.click(attempt(page).getByRole("button", { name: "Submit" }));
      await expect(result(page)).toBeVisible();
      await expect(result(page)).toContainText(`Your answer: ${f.practice.q1.b}`);
      await expect(result(page)).toContainText("Correct");
    },
  );

  await walk.step(
    {
      id: 332,
      chapter,
      role: "Pupil",
      title: "A finished set is opened again from the list with its result",
      caption: "Back in the list the set says Finished and offers no Start. See result opens the result again.",
      covers: ["POR-16"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Back to practice sets" }));
      const row = item(page, f.practice.editedTitle);
      await expect(row).toContainText("Finished");
      await expect(row.getByRole("button", { name: "Start" })).toHaveCount(0);
      await walk.click(row.getByRole("button", { name: /^See result/ }));
      await expect(result(page)).toContainText(`Your answer: ${f.practice.q1.b}`);
    },
  );

  await walk.step(
    {
      id: 333,
      chapter,
      role: "Teacher",
      title: "A short question is marked by hand unless the teacher unticks it",
      caption:
        "A second practice set has a single-choice question and a short answer. The short question is marked by hand: the box is ticked, and the correct answer written is the model answer the teacher will mark against. The set is published for the class.",
      covers: ["FRM-19"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Forms");
      await walk.click(page.getByRole("button", { name: "New practice set" }));
      await walk.type(dialog(page).getByLabel("Title"), q.quiz.title);
      await walk.type(dialog(page).getByLabel("Instructions"), q.quiz.instructions);
      await walk.click(dialog(page).getByLabel(a.classes.first, { exact: true }));
      const q1 = question(page, 1);
      await walk.type(q1.getByLabel("Question", { exact: true }), q.quiz.q1.prompt);
      await walk.type(q1.getByLabel("Option A", { exact: true }), q.quiz.q1.a);
      await walk.type(q1.getByLabel("Option B", { exact: true }), q.quiz.q1.b);
      await walk.click(q1.getByRole("radio", { name: "Option A is correct" }));
      await walk.click(dialog(page).getByRole("button", { name: "Add a question" }));
      const q2 = question(page, 2);
      await walk.selectOption(q2.getByLabel("Question type"), "SHORT");
      await walk.type(q2.getByLabel("Question", { exact: true }), q.quiz.q2.prompt);
      await walk.type(q2.getByLabel("Correct answer"), q.quiz.q2.model);
      await expect(q2.getByLabel("Marked by hand")).toBeChecked();
      await walk.type(q2.getByLabel("Points"), q.quiz.q2.points);
      await walk.click(dialog(page).getByRole("button", { name: "Save as draft" }));
      await expect(dialog(page)).toHaveCount(0);
      await walk.click(item(page, q.quiz.title).getByRole("button", { name: "Publish" }));
      await expect(item(page, q.quiz.title)).toContainText("Published");
    },
  );

  await walk.step(
    {
      id: 334,
      chapter,
      role: "Pupil",
      title: "A pupil is told what is marked and what is waiting for the teacher",
      caption:
        "The single-choice answer is marked at once. The short answer says it is waiting for the teacher to mark it, and shows no correct answer and no score.",
      covers: ["POR-15"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Forms"));
      await walk.click(tab(page, "Practice sets"));
      await walk.click(item(page, q.quiz.title).getByRole("button", { name: "Start" }));
      await walk.click(attempt(page).getByRole("radio", { name: q.quiz.q1.a }));
      await walk.type(attempt(page).getByLabel(q.quiz.q2.prompt), q.quiz.pupilAnswer);
      await walk.click(attempt(page).getByRole("button", { name: "Submit" }));
      await expect(result(page)).toContainText("still has to mark 1 answer");
      const short = result(page).getByRole("listitem").filter({ hasText: q.quiz.q2.prompt });
      await expect(short).toContainText(`Your answer: ${q.quiz.pupilAnswer}`);
      await expect(short).toContainText("Waiting for your teacher to mark this answer.");
      await expect(short).not.toContainText("Correct answer:");
    },
  );

  await walk.step(
    {
      id: 335,
      chapter,
      role: "Teacher",
      title: "The teacher marks the short answer; a score above the points, or none at all, is refused",
      caption:
        "The Marking tab lists the attempts that wait, across all forms. Mark opens one: the machine-marked answer is read-only, the teacher scores the hand-marked one and may add feedback. A score above the question's points and no score at all are refused with a sentence.",
      covers: ["FRM-16", "FRM-17"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Forms");
      await walk.click(tab(page, "Marking"));
      const waiting = item(page, yusuf).filter({ hasText: q.quiz.title });
      await expect(waiting).toContainText("Waiting");
      await expect(waiting).toContainText("1 still to mark");
      await walk.click(waiting.getByRole("button", { name: "Mark" }));
      const answers = dialog(page).getByRole("list", { name: "Answers" });
      await expect(answers.getByRole("listitem").filter({ hasText: q.quiz.q1.prompt })).toContainText("Marked automatically");
      await expect(answers.getByRole("listitem").filter({ hasText: q.quiz.q2.prompt })).toContainText(`Model answer: ${q.quiz.q2.model}`);
      await walk.type(dialog(page).getByLabel("Score for question 2"), q.quiz.tooMuch);
      await walk.click(dialog(page).getByRole("button", { name: "Save marks" }));
      await expect(dialog(page).getByRole("alert")).toContainText(`The score for question 2 is from 0 to ${q.quiz.q2.points}.`);
      await walk.type(dialog(page).getByLabel("Score for question 2"), "");
      await walk.click(dialog(page).getByRole("button", { name: "Save marks" }));
      await expect(dialog(page).getByRole("alert")).toContainText("Give at least one answer a score.");
      await walk.type(dialog(page).getByLabel("Score for question 2"), q.quiz.score);
      await walk.type(dialog(page).getByLabel("Feedback for question 2"), q.quiz.feedback);
      await walk.click(dialog(page).getByRole("button", { name: "Save marks" }));
      await expect(dialog(page)).toHaveCount(0);
      await expect(panel(page)).toContainText("Nothing is waiting for marking.");
    },
  );

  await walk.step(
    {
      id: 336,
      chapter,
      role: "Teacher",
      title: "A set's own page has its Marking tab and its Results",
      caption:
        "The set's own page lists only its attempts under Marking, with the same Mark button. Results shows who answered, finished or still answering, and the score as a number out of the total.",
      covers: ["FRM-18", "FRM-13"],
    },
    async () => {
      await walk.click(tab(page, "Practice sets"));
      await walk.click(item(page, q.quiz.title).getByRole("link", { name: q.quiz.title }));
      await expect(tab(page, "Overview")).toBeVisible();
      await walk.click(tab(page, "Marking"));
      await expect(panel(page)).toContainText("Nothing is waiting for marking.");
      await walk.click(tab(page, "Results"));
      await expect(panel(page)).toContainText(yusuf);
      await expect(panel(page)).toContainText("Finished");
      await expect(panel(page)).toContainText("4 of 4");
    },
  );

  await walk.step(
    {
      id: 337,
      chapter,
      role: "Teacher",
      title: "A questionnaire for the pupils and paper work are made for the class",
      caption:
        "A questionnaire can be addressed to the pupils of a class and kept anonymous. Paper work, handed in on paper, is made for the class and is published at once.",
      covers: ["FRM-04", "FRM-05"],
    },
    async () => {
      await walk.click(page.getByRole("link", { name: "Back to Forms" }));
      await walk.click(tab(page, "Questionnaires"));
      await walk.click(page.getByRole("button", { name: "New questionnaire" }));
      await walk.type(dialog(page).getByLabel("Title"), q.pulse.title);
      await walk.click(dialog(page).getByLabel("Anonymous", { exact: true }));
      await walk.click(dialog(page).getByLabel("Pupils", { exact: true }));
      await walk.click(dialog(page).getByLabel(a.classes.first, { exact: true }));
      const q1 = question(page, 1);
      await walk.selectOption(q1.getByLabel("Question type"), "RATING");
      await walk.type(q1.getByLabel("Question", { exact: true }), q.pulse.prompt);
      await walk.click(dialog(page).getByRole("button", { name: "Save as draft" }));
      await walk.click(item(page, q.pulse.title).getByRole("button", { name: "Publish" }));
      await expect(item(page, q.pulse.title)).toContainText("Published");
      await walk.click(tab(page, "Paper work"));
      await walk.click(page.getByRole("button", { name: "New paper work" }));
      await walk.type(dialog(page).getByLabel("Title"), q.record.title);
      await walk.type(dialog(page).getByLabel("Instructions"), q.record.instructions);
      await walk.click(dialog(page).getByLabel(a.classes.first, { exact: true }));
      await walk.click(dialog(page).getByRole("button", { name: "Create paper work" }));
      await expect(item(page, q.record.title)).toContainText("Published");
    },
  );

  await walk.step(
    {
      id: 338,
      chapter,
      role: "Pupil",
      title: "A pupil answers the questionnaire once and asks for the paper work to be marked",
      caption:
        "The questionnaire says it is anonymous before it is answered, and once answered it says Answered and offers no second go. Paper work shows the pupil's own state, Not handed in yet, and one press asks the teacher to mark it.",
      covers: ["POR-19", "POR-20"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Forms"));
      await walk.click(tab(page, "Questionnaires"));
      await walk.click(item(page, q.pulse.title).getByRole("button", { name: "Answer" }));
      await expect(dialog(page)).toContainText("anonymous");
      await walk.click(dialog(page).getByRole("radio", { name: "4" }));
      await walk.click(dialog(page).getByRole("button", { name: "Send my answers" }));
      await expect(dialog(page)).toHaveCount(0);
      await expect(item(page, q.pulse.title)).toContainText("Answered");
      await expect(item(page, q.pulse.title).getByRole("button", { name: "Answer" })).toHaveCount(0);
      await walk.click(tab(page, "Paper work"));
      await expect(item(page, q.record.title)).toContainText("Not handed in yet");
      await walk.click(item(page, q.record.title).getByRole("button", { name: "Request marking" }));
      await expect(item(page, q.record.title)).toContainText("You asked your teacher to mark it.");
      await expect(item(page, q.record.title).getByRole("button", { name: "Request marking" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 339,
      chapter,
      role: "Teacher",
      title: "The roll call flags who asked for marking and records who handed in and who was late",
      caption:
        "The roll call of paper work lists the class with a summary, and flags the pupil who asked for marking. The teacher records one pupil as handed in with a note and another as late, and saves both together. Nobody new has joined the class, so there is nobody to add.",
      covers: ["FRM-20", "FRM-21", "FRM-22"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Forms");
      await walk.click(tab(page, "Paper work"));
      await walk.click(item(page, q.record.title).getByRole("link", { name: q.record.title }));
      await walk.click(tab(page, "Roll call"));
      await expect(panel(page)).toContainText("1 asked for marking");
      const list = panel(page).getByRole("list", { name: "Roll call" });
      await expect(list.getByRole("listitem").filter({ hasText: yusuf })).toContainText("Asked for marking");
      await walk.selectOption(panel(page).getByLabel(`Status of ${yusuf}`), "HANDED_IN");
      await walk.type(panel(page).getByLabel(`Note for ${yusuf}`), q.record.note);
      await walk.selectOption(panel(page).getByLabel(`Status of ${aisha}`), "LATE");
      await walk.click(panel(page).getByRole("button", { name: "Save changes (2)" }));
      await expect(panel(page)).toContainText("2 changes saved.");
      await expect(panel(page)).toContainText("1 late");
      await walk.click(panel(page).getByRole("button", { name: "Add pupils who joined the class" }));
      await expect(panel(page)).toContainText("Nobody new to add.");
    },
  );
}
