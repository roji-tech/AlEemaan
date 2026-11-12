import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, coursework as c, pupils } from "../cast";
import { openPage, signIn, signOut } from "./shared";
import { backToStaffSignIn, findPortal, portalSignIn, portalSignOut, section } from "./c12-portal";

// C13 Coursework (task 0033, section 6.6): the branch administrator makes an assignment, finds it again with the search and the filters, deletes one, adds study materials (and deletes one),
// builds a quiz with a question of each kind, and deletes a trial quiz. A pupil then reads the coursework in the portal, hands the assignment in and takes the quiz; a guardian reads the same
// coursework and is offered neither; the branch administrator grades the hand-in in the Speed Grader, and the pupil sees the grade and the feedback. Since task 0066 an assignment is saved
// as a draft, edited, published, closed, reopened, archived and restored, and a study material has a type and a draft state and can be edited; the pupil sees a closed assignment (and is told
// the teacher closed it) and never a draft material.

const chapter = "C13 Coursework";

const tab = (page: Page, name: RegExp) => page.getByRole("tablist", { name: "Coursework sections" }).getByRole("tab", { name });
const heading = (page: Page, title: string) => page.getByRole("heading", { level: 3, name: title, exact: true });

async function createAssignment(walk: Walk, page: Page, title: string, subject: string, points: string): Promise<void> {
  await walk.click(page.getByRole("button", { name: "+ Create Assignment" }));
  const dialog = page.getByRole("dialog", { name: "Create Coursework Assignment" });
  await walk.type(dialog.getByLabel("Assignment Title"), title);
  await walk.selectOption(dialog.getByLabel("Subject"), subject);
  await walk.type(dialog.getByLabel("Total Points"), points);
  await walk.click(dialog.getByRole("button", { name: "Publish Assignment" }));
  await expect(dialog).toBeHidden();
  await expect(heading(page, title)).toBeVisible();
}

async function addMaterial(walk: Walk, page: Page, title: string, subject: string): Promise<void> {
  await walk.click(page.getByRole("button", { name: "+ Add Material" }));
  const dialog = page.getByRole("dialog", { name: "Add Learning Material" });
  await walk.type(dialog.getByLabel("Material Title"), title);
  await walk.selectOption(dialog.getByLabel("Subject"), subject);
  await walk.click(dialog.getByRole("button", { name: "Publish Material" }));
  await expect(dialog).toBeHidden();
  await expect(heading(page, title)).toBeVisible();
}

export async function c13Coursework(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 107,
      chapter,
      role: "Branch administrator",
      title: "Make an assignment and keep it as a draft",
      caption:
        "An assignment has a title, a subject, the class it is for, instructions, a due date and its points. Save as Draft keeps it for the teacher only: the pupils do not see it until it is published. Late hand-ins are accepted unless the box is cleared.",
      covers: ["LMS-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Coursework", "Coursework & LMS");
      await expect(page.getByText("No assignments found")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "+ Create Assignment" }));
      const dialog = page.getByRole("dialog", { name: "Create Coursework Assignment" });
      await walk.type(dialog.getByLabel("Assignment Title"), c.essay.title);
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.english);
      await walk.selectOption(dialog.getByLabel("Class Target (Optional)"), a.classes.first);
      await walk.type(dialog.getByLabel("Description"), c.essay.description);
      await walk.type(dialog.getByLabel("Instructions"), c.essay.instructions);
      // the date-and-time field starts at its month when it is reached by the Tab key (a click lands on the segment under the pointer, here the hour); a year takes up to six digits, so
      // Tab moves from the year to the time
      await page.keyboard.press("Tab");
      await page.keyboard.type(c.essay.dueDateTyped, { delay: 45 });
      await page.keyboard.press("Tab");
      await page.keyboard.type(c.essay.dueTimeTyped, { delay: 45 });
      await walk.type(dialog.getByLabel("Total Points"), c.essay.points);
      await expect(dialog.getByLabel("Accept late submissions past the due date")).toBeChecked();
      await walk.click(dialog.getByRole("button", { name: "Save as Draft" }));
      await expect(dialog).toBeHidden();
      await expect(heading(page, c.essay.title)).toBeVisible();
      await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Publish draft: ${c.essay.title}` })).toBeVisible();
      await expect(page.getByText(c.essay.pointsShown)).toBeVisible();
      await expect(page.getByText(`Class: ${a.classes.first}`)).toBeVisible();
      await expect(page.getByText("No deadline")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 108,
      chapter,
      role: "Branch administrator",
      title: "Edit the draft and publish it",
      caption:
        "Edit opens the same form with what was saved. The description is changed and the assignment is published: from now on the pupils of the class see it.",
      covers: ["LMS-01"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Edit assignment ${c.essay.title}` }));
      const dialog = page.getByRole("dialog", { name: "Edit Coursework Assignment" });
      await expect(dialog.getByLabel("Assignment Title")).toHaveValue(c.essay.title);
      await expect(dialog.getByLabel("Total Points")).toHaveValue(c.essay.points);
      await expect(dialog.getByLabel("Description")).toHaveValue(c.essay.description);
      await expect(dialog.getByLabel("Due Date & Time")).not.toHaveValue("");
      await expect(dialog.getByRole("button", { name: "Save Draft" })).toBeVisible();
      await walk.type(dialog.getByLabel("Description"), c.essay.descriptionEdited);
      await walk.click(dialog.getByRole("button", { name: "Publish Assignment" }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
      await expect(page.getByText("DRAFT", { exact: true })).toHaveCount(0);
      await expect(page.getByText(c.essay.descriptionEdited)).toBeVisible();
      await expect(page.getByRole("button", { name: `Close hand-ins: ${c.essay.title}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 109,
      chapter,
      role: "Branch administrator",
      title: "Find an assignment with the search and the filters",
      caption:
        "A second assignment is made for another subject. The search looks at the title, and the subject and status filters narrow the list. No assignment is a draft, so that filter shows an empty list.",
      covers: ["LMS-02"],
    },
    async () => {
      await createAssignment(walk, page, c.scrap.title, a.subjects.maths, c.scrap.points);
      await expect(heading(page, c.essay.title)).toBeVisible();
      await walk.type(page.getByLabel("Search"), "essay");
      await expect(heading(page, c.essay.title)).toBeVisible();
      await expect(heading(page, c.scrap.title)).toHaveCount(0);
      await walk.type(page.getByLabel("Search"), "");
      await walk.selectOption(page.getByLabel("Subject", { exact: true }), a.subjects.maths);
      await expect(heading(page, c.scrap.title)).toBeVisible();
      await expect(heading(page, c.essay.title)).toHaveCount(0);
      await walk.selectOption(page.getByLabel("Subject", { exact: true }), "All Subjects");
      await walk.selectOption(page.getByLabel("Status", { exact: true }), "Draft");
      await expect(page.getByText("No assignments found")).toBeVisible();
      await walk.selectOption(page.getByLabel("Status", { exact: true }), "All Statuses");
      await expect(heading(page, c.essay.title)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 110,
      chapter,
      role: "Branch administrator",
      title: "Close hand-ins, reopen, archive and restore an assignment",
      caption:
        "Close stops hand-ins but leaves the assignment, and the pupil's own hand-in and mark, visible to the class. Reopen takes it back. Archive keeps it for the teacher only, with its hand-ins; Restore returns it as a draft. The Status filter finds each state. Then a second assignment is made and closed, and stays closed.",
      covers: ["LMS-02"],
    },
    async () => {
      const status = page.getByLabel("Status", { exact: true });
      await walk.click(page.getByRole("button", { name: `Close hand-ins: ${c.scrap.title}` }));
      await expect(page.getByRole("button", { name: `Reopen hand-ins: ${c.scrap.title}` })).toBeVisible();
      await walk.selectOption(status, "Closed");
      await expect(heading(page, c.scrap.title)).toBeVisible();
      await expect(heading(page, c.essay.title)).toHaveCount(0);
      await walk.selectOption(status, "All Statuses");
      await walk.click(page.getByRole("button", { name: `Reopen hand-ins: ${c.scrap.title}` }));
      await expect(page.getByRole("button", { name: `Close hand-ins: ${c.scrap.title}` })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Archive assignment ${c.scrap.title}` }));
      await expect(page.getByRole("button", { name: `Restore assignment ${c.scrap.title} as a draft` })).toBeVisible();
      await walk.selectOption(status, "Archived");
      await expect(heading(page, c.scrap.title)).toBeVisible();
      await expect(heading(page, c.essay.title)).toHaveCount(0);
      await walk.selectOption(status, "All Statuses");
      await walk.click(page.getByRole("button", { name: `Restore assignment ${c.scrap.title} as a draft` }));
      await expect(page.getByRole("button", { name: `Publish draft: ${c.scrap.title}` })).toBeVisible();
      await createAssignment(walk, page, c.closed.title, a.subjects.english, c.closed.points);
      await walk.click(page.getByRole("button", { name: `Close hand-ins: ${c.closed.title}` }));
      await expect(page.getByRole("button", { name: `Reopen hand-ins: ${c.closed.title}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 111,
      chapter,
      role: "Branch administrator",
      title: "Delete an assignment",
      caption: "Delete asks first, in the browser's own question. After OK the assignment is gone from the list; the other one stays.",
      covers: ["LMS-04"],
    },
    async () => {
      await walk.acceptNextConfirm(`Are you sure you want to delete assignment "${c.scrap.title}"?`);
      await walk.click(page.getByRole("button", { name: `Delete assignment ${c.scrap.title}` }));
      await expect(heading(page, c.scrap.title)).toHaveCount(0);
      await expect(heading(page, c.essay.title)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 112,
      chapter,
      role: "Branch administrator",
      title: "Add a study material",
      caption:
        "A study material has a title, a subject, a type, a link, a short summary and notes that are shown in the app itself. A link that is not a web address is refused and the reason is said; with a web address, the card shows a link that opens the resource, and the pupils see it too.",
      covers: ["LMS-05"],
    },
    async () => {
      await walk.click(tab(page, /Study Materials & Notes/));
      await expect(page.getByText("No study materials available")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "+ Add Material" }));
      const dialog = page.getByRole("dialog", { name: "Add Learning Material" });
      await walk.type(dialog.getByLabel("Material Title"), c.material.title);
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.english);
      await walk.selectOption(dialog.getByLabel("Type of Resource"), c.material.typeLabel);
      await walk.type(dialog.getByLabel("Resource Link or Document URL"), c.material.notAWebAddress);
      await walk.click(dialog.getByRole("button", { name: "Publish Material" }));
      await expect(dialog.getByRole("alert")).toContainText(c.material.notAWebAddressReason);
      await walk.type(dialog.getByLabel("Resource Link or Document URL"), c.material.url);
      await walk.type(dialog.getByLabel("Short Summary / Description"), c.material.summary);
      await walk.type(dialog.getByLabel("Inline Content / Notes (Markdown supported)"), c.material.content);
      await walk.click(dialog.getByRole("button", { name: "Publish Material" }));
      await expect(dialog).toBeHidden();
      await expect(heading(page, c.material.title)).toBeVisible();
      await expect(page.getByText(c.material.summary)).toBeVisible();
      await expect(page.getByRole("link", { name: c.material.linkName })).toHaveAttribute("href", c.material.url);
      await expect(page.getByText(c.material.typeLabel, { exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 113,
      chapter,
      role: "Branch administrator",
      title: "Keep a study material as a draft and edit it",
      caption:
        "A material has a type as well. Save as Draft keeps it for the teachers: the pupils do not see it until it is published. Edit opens the form with what was saved, and a draft stays a draft until it is published.",
      covers: ["LMS-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "+ Add Material" }));
      const dialog = page.getByRole("dialog", { name: "Add Learning Material" });
      await walk.type(dialog.getByLabel("Material Title"), c.draftMaterial.title);
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.english);
      await walk.selectOption(dialog.getByLabel("Type of Resource"), c.draftMaterial.typeLabel);
      await walk.click(dialog.getByRole("button", { name: "Save as Draft" }));
      await expect(dialog).toBeHidden();
      await expect(heading(page, c.draftMaterial.title)).toBeVisible();
      await expect(page.getByText("Draft", { exact: true })).toBeVisible();
      await expect(page.getByText(c.draftMaterial.typeLabel, { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Edit material ${c.draftMaterial.title}` }));
      const edit = page.getByRole("dialog", { name: "Edit Learning Material" });
      await expect(edit.getByLabel("Material Title")).toHaveValue(c.draftMaterial.title);
      await expect(edit.getByLabel("Type of Resource")).toHaveValue("PRESENTATION");
      await walk.type(edit.getByLabel("Short Summary / Description"), c.draftMaterial.summary);
      await walk.click(edit.getByRole("button", { name: "Save Draft" }));
      await expect(edit).toBeHidden();
      await expect(page.getByText(c.draftMaterial.summary)).toBeVisible();
      await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 114,
      chapter,
      role: "Branch administrator",
      title: "Unpublish, publish again and delete a study material",
      caption:
        "A published material can be taken back to a draft and published again from its card. Delete asks first; after OK the material leaves the list and the others stay.",
      covers: ["LMS-06"],
    },
    async () => {
      await addMaterial(walk, page, c.scrapMaterial.title, a.subjects.maths);
      await walk.click(page.getByRole("button", { name: `Unpublish: ${c.scrapMaterial.title}` }));
      await expect(page.getByRole("button", { name: `Publish draft: ${c.scrapMaterial.title}` })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Publish draft: ${c.scrapMaterial.title}` }));
      await expect(page.getByRole("button", { name: `Unpublish: ${c.scrapMaterial.title}` })).toBeVisible();
      await walk.acceptNextConfirm(`Are you sure you want to delete "${c.scrapMaterial.title}"?`);
      await walk.click(page.getByRole("button", { name: `Delete material ${c.scrapMaterial.title}` }));
      await expect(heading(page, c.scrapMaterial.title)).toHaveCount(0);
      await expect(heading(page, c.material.title)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 115,
      chapter,
      role: "Branch administrator",
      title: "Build a quiz with a question of each kind",
      caption:
        "A quiz has a time limit and a pass mark. Each question has a type, its points and its correct answer: a choice among options, true or false, or a short answer that must match a word.",
      covers: ["LMS-07"],
    },
    async () => {
      await walk.click(tab(page, /Quizzes & Assessments/));
      await expect(page.getByText("No quizzes created")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "+ Create Quiz" }));
      const dialog = page.getByRole("dialog", { name: "Create Interactive Quiz / Test" });
      await walk.type(dialog.getByLabel("Quiz Title"), c.quiz.title);
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.english);
      await walk.selectOption(dialog.getByLabel("Target Class (Optional)"), a.classes.first);
      await walk.type(dialog.getByLabel("Time Limit (Minutes)"), c.quiz.minutes);
      await walk.type(dialog.getByLabel("Passing Score (%)"), c.quiz.pass);
      await walk.type(dialog.getByLabel("Instructions"), c.quiz.instructions);
      await walk.click(dialog.getByRole("button", { name: "+ Add Question" }));
      await walk.click(dialog.getByRole("button", { name: "+ Add Question" }));
      const first = dialog.getByRole("group", { name: "Question 1" });
      const second = dialog.getByRole("group", { name: "Question 2" });
      const third = dialog.getByRole("group", { name: "Question 3" });
      await walk.type(first.getByLabel("Question prompt"), c.quiz.choice.prompt);
      await walk.type(first.getByLabel("Option 1", { exact: true }), c.quiz.choice.right);
      await walk.type(first.getByLabel("Option 2", { exact: true }), c.quiz.choice.wrong);
      await expect(first.getByRole("radio", { name: "Option 1 is the correct answer" })).toBeChecked();
      await walk.selectOption(second.getByLabel("Question Type"), "True / False");
      await walk.type(second.getByLabel("Question prompt"), c.quiz.trueFalse.prompt);
      await expect(second.getByRole("radio", { name: "True", exact: true })).toBeChecked();
      await walk.selectOption(third.getByLabel("Question Type"), "Short Answer");
      await walk.type(third.getByLabel("Question prompt"), c.quiz.short.prompt);
      await walk.type(third.getByLabel("Expected exact keyword or phrase"), c.quiz.short.answer);
      await walk.click(dialog.getByRole("button", { name: "Save & Publish Quiz" }));
      await expect(dialog).toBeHidden();
      await expect(heading(page, c.quiz.title)).toBeVisible();
      await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
      await expect(page.getByText("10m")).toBeVisible();
      await expect(page.getByText("60%")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 116,
      chapter,
      role: "Branch administrator",
      title: "Read a quiz's questions, search the quizzes and delete one",
      caption:
        "The Questions button lists a quiz's questions for the people who manage it. The search finds a quiz by its title. A trial quiz is made and deleted, behind the browser's own question.",
      covers: ["LMS-08"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Questions of ${c.quiz.title}` }));
      const questions = page.getByRole("dialog", { name: "Quiz questions" });
      await expect(questions).toContainText(c.quiz.choice.prompt);
      await expect(questions).toContainText(c.quiz.short.prompt);
      await walk.click(questions.getByRole("button", { name: "Close", exact: true }).last());
      await expect(questions).toBeHidden();

      await walk.click(page.getByRole("button", { name: "+ Create Quiz" }));
      const dialog = page.getByRole("dialog", { name: "Create Interactive Quiz / Test" });
      await walk.type(dialog.getByLabel("Quiz Title"), c.scrapQuiz.title);
      await walk.selectOption(dialog.getByLabel("Subject"), a.subjects.maths);
      const only = dialog.getByRole("group", { name: "Question 1" });
      await walk.type(only.getByLabel("Question prompt"), c.scrapQuiz.prompt);
      await walk.type(only.getByLabel("Option 1", { exact: true }), c.scrapQuiz.right);
      await walk.type(only.getByLabel("Option 2", { exact: true }), c.scrapQuiz.wrong);
      await walk.click(dialog.getByRole("button", { name: "Save & Publish Quiz" }));
      await expect(dialog).toBeHidden();
      await expect(heading(page, c.scrapQuiz.title)).toBeVisible();

      await walk.type(page.getByLabel("Search"), "honesty");
      await expect(heading(page, c.quiz.title)).toBeVisible();
      await expect(heading(page, c.scrapQuiz.title)).toHaveCount(0);
      await walk.type(page.getByLabel("Search"), "");
      await walk.acceptNextConfirm(`Are you sure you want to delete quiz "${c.scrapQuiz.title}"?`);
      await walk.click(page.getByRole("button", { name: `Delete quiz ${c.scrapQuiz.title}` }));
      await expect(heading(page, c.scrapQuiz.title)).toHaveCount(0);
      await expect(heading(page, c.quiz.title)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 117,
      chapter,
      role: "Pupil",
      title: "A pupil hands in the assignment",
      caption:
        "The pupil's Coursework section lists what the class has been given, including the assignment the teacher closed, which says so and offers no Hand in. Hand in takes an answer and, if wanted, a link. The assignment then shows as submitted and can be handed in again until it is graded.",
      covers: ["POR-06"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Coursework (LMS)"));
      await expect(page.getByRole("heading", { name: "Assignments & Coursework" })).toBeVisible();
      await expect(page.getByText("2 Available").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: c.essay.title })).toBeVisible();
      await expect(page.getByText("PENDING", { exact: true })).toHaveCount(2);
      await expect(page.getByRole("heading", { name: c.closed.title })).toBeVisible();
      await expect(page.getByText("Your teacher has closed this assignment, so work can no longer be handed in.")).toBeVisible();
      await expect(page.getByRole("button", { name: `Hand in: ${c.closed.title}` })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: `Hand in: ${c.essay.title}` }));
      const dialog = page.getByRole("dialog", { name: `Hand in: ${c.essay.title}` });
      await expect(dialog).toContainText(c.essay.instructions);
      await walk.type(dialog.getByLabel("Your answer"), c.handIn.answer);
      await walk.type(dialog.getByLabel("Link title (optional)"), c.handIn.linkTitle);
      await walk.type(dialog.getByLabel("Link address (optional)"), c.handIn.linkUrl);
      await walk.click(dialog.getByRole("button", { name: "Hand in", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText("SUBMITTED", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Hand in again: ${c.essay.title}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 118,
      chapter,
      role: "Pupil",
      title: "The pupil takes the quiz and reads the study material",
      caption:
        "A quiz is answered question by question, with the time left counting down, and marked at once: the score and whether the pass mark was reached. The pupil can try again. The study material is read in the app.",
      covers: ["POR-06"],
    },
    async () => {
      await expect(page.getByRole("heading", { name: "Quizzes" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Start: ${c.quiz.title}` }));
      const dialog = page.getByRole("dialog", { name: c.quiz.title });
      await expect(dialog.getByRole("timer")).toBeVisible();
      await walk.click(dialog.getByRole("radio", { name: c.quiz.choice.right }));
      await walk.click(dialog.getByRole("radio", { name: "True", exact: true }));
      await walk.type(dialog.getByLabel("Answer to question 3"), c.quiz.short.answer);
      await walk.click(dialog.getByRole("button", { name: "Submit quiz" }));
      await expect(dialog.getByText("Passed", { exact: true })).toBeVisible();
      await expect(dialog.getByText("You scored 100%.")).toBeVisible();
      await expect(dialog.getByText(`Pass mark: ${c.quiz.pass}%`)).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Done" }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText("last score 100%")).toBeVisible();
      await expect(page.getByRole("button", { name: `Try again: ${c.quiz.title}` })).toBeVisible();
      await expect(page.getByRole("heading", { name: c.material.title })).toBeVisible();
      await expect(page.getByRole("heading", { name: c.draftMaterial.title })).toHaveCount(0);
      await expect(page.getByText(c.material.content)).toBeVisible();
      await expect(page.getByRole("link", { name: c.material.linkName })).toHaveAttribute("href", c.material.url);
    },
  );

  await walk.step(
    {
      id: 119,
      chapter,
      role: "Guardian",
      title: "A guardian reads the coursework and cannot hand in or take the quiz",
      caption:
        "The guardian sees what the class has been given and whether the work has been handed in. Handing in and taking a quiz are the pupil's own, so neither button is offered, and there is no quiz list.",
      covers: ["POR-06"],
    },
    async () => {
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.phone);
      await walk.click(section(page, "Coursework (LMS)"));
      await expect(page.getByRole("heading", { name: c.essay.title })).toBeVisible();
      await expect(page.getByText("SUBMITTED", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Hand in/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Quizzes" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: c.material.title })).toBeVisible();
      // the guardian signs out, so that the portal asks for a sign-in again when the pupil comes back in step 121 (the portal session outlives a staff sign-out)
      await portalSignOut(walk, page);
    },
  );

  await walk.step(
    {
      id: 120,
      chapter,
      role: "Branch administrator",
      title: "Grade the hand-in in the Speed Grader",
      caption:
        "The Speed Grader lists the pupils who handed in, shows each one's answer and link, and takes a score out of the assignment's points and a note. Save moves on to the next pupil.",
      covers: ["LMS-03"],
    },
    async () => {
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Coursework", "Coursework & LMS");
      // two assignments are listed, newest first, and every card says only "Speed Grader": the essay is the older one
      await walk.click(page.getByRole("button", { name: "Speed Grader" }).last());
      const dialog = page.getByRole("dialog", { name: `Speed Grader: ${c.essay.title}` });
      await expect(dialog.getByText("Submissions (1)")).toBeVisible();
      await expect(dialog).toContainText(`${pupils.yusuf.first} ${pupils.yusuf.last}`);
      await expect(dialog).toContainText(c.handIn.answer);
      await expect(dialog).toContainText(c.handIn.linkTitle);
      await expect(dialog.getByText("Ungraded")).toBeVisible();
      await walk.type(dialog.getByLabel(`Score (out of ${c.essay.points})`), c.grade.score);
      await walk.type(dialog.getByLabel("Teacher Feedback / Notes"), c.grade.feedback);
      await walk.click(dialog.getByRole("button", { name: "Save & Next Student" }));
      await expect(dialog.getByText(c.grade.shown).first()).toBeVisible();
      await expect(dialog.getByText("Ungraded")).toHaveCount(0);
      await walk.click(dialog.getByRole("button", { name: "Close", exact: true }).last());
      await expect(dialog).toBeHidden();
    },
  );

  await walk.step(
    {
      id: 121,
      chapter,
      role: "Pupil",
      title: "The pupil sees the grade and the feedback",
      caption:
        "The grade replaces the status, and the teacher's note shows under the assignment. A graded assignment cannot be handed in again.",
      covers: ["POR-06"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Coursework (LMS)"));
      await expect(page.getByText(c.grade.shown, { exact: true })).toBeVisible();
      await expect(page.getByText(c.grade.feedback)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Hand in/ })).toHaveCount(0);
    },
  );
}
