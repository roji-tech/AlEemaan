import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, practice as pr, pupils, school } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";
import { backToStaffSignIn, findPortal, portalSignIn, portalSignOut, section } from "./c12-portal";

// C33 Portal practice (task 0033, section 6.33): the pupil's own practice from the question bank. The school lowers the smallest pool so that a class with a few approved questions is offered practice; the pupil
// sets up a session, answers and sees the key after each answer or all at the end, and reads the result.

const chapter = "C33 Portal practice";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const panel = (page: Page) => page.getByRole("tabpanel").last();
const sessions = (page: Page): Locator => page.getByRole("list", { name: "Practice sessions" }).locator(":scope > li");
const result = (page: Page) => page.getByRole("region", { name: "Your practice result" });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const setup = (page: Page) => page.getByRole("region", { name: "Practice setup" });

export async function c33PortalPractice(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 320,
      chapter,
      role: "Superadmin",
      title: "The school lowers the smallest pool before practice is offered",
      caption:
        "Practice is offered for a subject only when the school has enough approved practice questions for the class. The superadministrator sets that smallest pool to one question, so this small school's class is offered practice.",
      covers: ["QBK-08"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Settings"));
      await walk.type(page.getByLabel("Smallest pool before practice is offered"), pr.minPool);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText(/Saved\. One setting changed for every branch\./)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 321,
      chapter,
      role: "Pupil",
      title: "A pupil's Practice tab has Practise now, History and My reports",
      caption:
        "The pupil signs in and chooses Practice. There are three sections: Practise now, History and My reports. With no approved practice question for the class, Practise now says none are ready yet.",
      covers: ["POR-21", "POR-28"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Practice"));
      for (const name of ["Practise now", "History", "My reports"]) await expect(tab(page, name)).toBeVisible();
      await expect(page.getByText("No practice questions are ready for your class yet.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 322,
      chapter,
      role: "Teacher",
      title: "A teacher writes two questions for the pupils' class and sends them for review",
      caption:
        "Practice draws on the school's approved questions. The teacher writes two Mathematics questions for Primary 1, each with an explanation that pupils will see after answering, and sends both for review.",
      covers: ["QBK-01", "QBK-03"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "My questions"));
      for (const q of pr.questions) {
        await walk.click(page.getByRole("button", { name: "Write a question" }));
        const form = dialog(page, "Write a question");
        await walk.type(form.getByLabel("Question", { exact: true }), q.prompt);
        await walk.type(form.getByLabel("Option 1", { exact: true }), q.right);
        await walk.type(form.getByLabel("Option 2", { exact: true }), q.wrong);
        await walk.click(form.getByLabel("Option 1 is correct"));
        await walk.type(form.getByLabel("Explanation (optional)"), q.explanation);
        await walk.type(form.getByLabel("Subject", { exact: true }), pr.subject);
        await walk.type(form.getByLabel("Classes", { exact: true }), pr.classTag);
        await page.keyboard.press("Enter");
        await walk.click(form.getByRole("button", { name: "Save as a draft" }));
        await expect(page.getByText("Saved as a draft.")).toBeVisible();
        await walk.click(form.getByRole("button", { name: "Close", exact: true }).last());
        await walk.click(page.getByRole("button", { name: new RegExp(q.prompt) }));
        await walk.click(dialog(page, "Question").getByRole("button", { name: "Send for review" }));
        await expect(page.getByText("Sent for review.")).toBeVisible();
        await walk.click(dialog(page, "Question").getByRole("button", { name: "Close", exact: true }).last());
      }
    },
  );

  await walk.step(
    {
      id: 323,
      chapter,
      role: "Superadmin",
      title: "The exam approver approves both so that pupils can practise with them",
      caption:
        "Approving also decides who may see a question. For each of the two the superadministrator chooses that pupils can practise with it now.",
      covers: ["QBK-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Review queue"));
      for (const q of pr.questions) {
        await walk.click(page.getByRole("button", { name: new RegExp(q.prompt) }));
        await walk.click(dialog(page, "Question").getByRole("button", { name: "Approve" }));
        const approve = dialog(page, "Approve this question");
        await walk.click(approve.getByLabel("Pupils can practise with it now"));
        await walk.click(approve.getByRole("button", { name: "Approve", exact: true }));
        await expect(page.getByText("Approved.")).toBeVisible();
        await expect(approve).toBeHidden();
        await walk.click(dialog(page, "Question").getByRole("button", { name: "Close", exact: true }).last());
      }
    },
  );

  await walk.step(
    {
      id: 324,
      chapter,
      role: "Pupil",
      title: "A pupil sets up a session and answers with the answer shown after each question",
      caption:
        "Practise now offers the subject, the number of questions and when the answer is shown. With the answer after each question, the pupil sees Correct or Not quite, the right answer and the explanation, then the result.",
      covers: ["POR-24", "POR-25"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Practice"));
      await expect(setup(page)).toContainText(/You can answer \d+ more questions today\./);
      await walk.selectOption(setup(page).getByLabel("Subject"), pr.subject);
      await walk.click(setup(page).getByRole("radio", { name: "After each answer" }));
      await walk.click(setup(page).getByRole("button", { name: "Start practice" }));
      const session = page.getByRole("region", { name: "Your practice" });
      await expect(session).toContainText("Question 1 of 2");
      await walk.click(session.getByRole("radio", { name: "Yes" }));
      await walk.click(session.getByRole("button", { name: "Check answer" }));
      await expect(session.getByRole("status")).toContainText("Correct");
      await expect(session.getByRole("status")).toContainText(/Three and four make seven|Five and six make eleven/);
      await walk.click(session.getByRole("button", { name: "Next question" }));
      await expect(session).toContainText("Question 2 of 2");
      await walk.click(session.getByRole("radio", { name: "No" }));
      await walk.click(session.getByRole("button", { name: "Check answer" }));
      await expect(session.getByRole("status")).toContainText("Not quite");
      await expect(session.getByRole("status")).toContainText("Correct answer: Yes");
      await walk.click(session.getByRole("button", { name: "See my result" }));
      const result = page.getByRole("region", { name: "Your practice result" });
      await expect(result).toContainText("You got 1 of 2 right (50%).");
    },
  );

  await walk.step(
    {
      id: 325,
      chapter,
      role: "Pupil",
      title: "With the answers at the end nothing is revealed until the session is finished",
      caption:
        "In the other mode each answer is only saved: no key and no explanation until the pupil asks for the result, which then shows every answer with its key. A wrong answer can be reported as a problem with the question: a few words are asked for.",
      covers: ["POR-26", "POR-31"],
    },
    async () => {
      await walk.click(page.getByRole("region", { name: "Your practice result" }).getByRole("button", { name: "Practise again" }));
      await walk.click(setup(page).getByRole("radio", { name: "At the end" }));
      await walk.click(setup(page).getByRole("button", { name: "Start practice" }));
      const session = page.getByRole("region", { name: "Your practice" });
      await expect(session).toContainText("Question 1 of 2");
      await walk.click(session.getByRole("radio", { name: "No" }));
      await walk.click(session.getByRole("button", { name: "Save answer" }));
      await expect(session.getByRole("status")).toContainText("Answer saved.");
      await expect(session).not.toContainText("Correct answer");
      await expect(session).not.toContainText(/Three and four make seven|Five and six make eleven/);
      await walk.click(session.getByRole("button", { name: "Next question" }));
      await walk.click(session.getByRole("radio", { name: "Yes" }));
      await walk.click(session.getByRole("button", { name: "Save answer" }));
      await walk.click(session.getByRole("button", { name: "See my result" }));
      const result = page.getByRole("region", { name: "Your practice result" });
      await expect(result).toContainText("You got 1 of 2 right (50%).");
      const wrong = result.getByRole("listitem").filter({ hasText: "Your answer: No" });
      await expect(wrong).toContainText("Correct answer: Yes");
      await walk.click(wrong.getByRole("button", { name: "Report a problem" }));
      const report = page.getByRole("dialog");
      await walk.type(report.getByLabel("What is wrong with it?"), pr.tooShort);
      await walk.click(report.getByRole("button", { name: "Send report" }));
      await expect(report.getByText(/at least 5 characters/)).toBeVisible();
      await walk.type(report.getByLabel("What is wrong with it?"), pr.report);
      await walk.click(report.getByRole("button", { name: "Send report" }));
      await expect(result).toContainText("Thank you. Your report was sent to the people who look after the questions.");
    },
  );

  await walk.step(
    {
      id: 326,
      chapter,
      role: "Pupil",
      title: "Finish now asks first and gives the unanswered questions back",
      caption:
        "A pupil can stop early. Finish now asks first, and says the questions not answered are given back to today's allowance. The result is only of what was answered, and the allowance is back up.",
      covers: ["POR-27"],
    },
    async () => {
      await walk.click(result(page).getByRole("button", { name: "Practise again" }));
      await walk.click(setup(page).getByRole("radio", { name: "After each answer" }));
      await walk.click(setup(page).getByRole("button", { name: "Start practice" }));
      const session = page.getByRole("region", { name: "Your practice" });
      await walk.click(session.getByRole("radio", { name: "Yes" }));
      await walk.click(session.getByRole("button", { name: "Check answer" }));
      await expect(session.getByRole("status")).toContainText("Correct");
      await walk.click(session.getByRole("button", { name: "Finish now" }));
      const ask = page.getByRole("dialog");
      await expect(ask).toContainText("The questions you have not answered are given back to today's allowance.");
      await walk.click(ask.getByRole("button", { name: "Keep going" }));
      await expect(session).toContainText("Question 1 of 2");
      await walk.click(session.getByRole("button", { name: "Finish now" }));
      await walk.click(page.getByRole("dialog").getByRole("button", { name: "Finish now" }));
      await expect(result(page)).toContainText("You got 1 of 1 right (100%).");
    },
  );

  await walk.step(
    {
      id: 327,
      chapter,
      role: "Pupil",
      title: "History keeps every session; an answer can be archived and brought back; My reports lists the report",
      caption:
        "History lists the sessions, newest first, with the subject and how many were right. Show answers opens them in the options' own words. An answer can be archived out of sight and restored. My reports lists the problem the pupil reported.",
      covers: ["POR-30", "POR-31"],
    },
    async () => {
      await walk.click(tab(page, "History"));
      await expect(sessions(page)).toHaveCount(3);
      await expect(sessions(page).first()).toContainText("1 of 1 right");
      const older = sessions(page).filter({ hasText: "1 of 2 right" });
      await expect(older).toHaveCount(2);
      await walk.click(older.last().getByText("Show answers"));
      const wrong = older.last().getByRole("listitem").filter({ hasText: "Your answer: No" });
      await expect(wrong).toContainText("Not quite");
      await walk.click(wrong.getByRole("button", { name: "Archive" }));
      await expect(older.last().getByRole("listitem").filter({ hasText: "Your answer: No" })).toHaveCount(0);
      await walk.click(panel(page).getByLabel("Show archived answers"));
      await walk.click(
        sessions(page).getByRole("listitem").filter({ hasText: "Your answer: No" }).getByRole("button", { name: "Restore" }),
      );
      await walk.click(tab(page, "My reports"));
      await expect(page.getByRole("list", { name: "Your reports" }).locator(":scope > li")).toHaveCount(1);
    },
  );

  await walk.step(
    {
      id: 328,
      chapter,
      role: "Superadmin",
      title: "The school lets guardians see a child's practice in full and takes practice away from pupils",
      caption:
        "Two settings decide what a family gets of practice. The school-wide ceiling for guardians is raised to the child's practice in full, and for this branch guardians are given full practice and pupils nothing.",
      covers: ["STG-04", "QBK-08"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Settings"));
      await walk.selectOption(page.getByLabel("The most a guardian can see of a child's practice"), "FULL");
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText(/Saved\. One setting changed for every branch\./)).toBeVisible();
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await walk.click(page.getByRole("button", { name: "Portal access", exact: true }));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await walk.selectOption(page.getByLabel("Guardian: question practice"), "FULL");
      await walk.selectOption(page.getByLabel("Pupil: question practice"), "NONE");
      await walk.click(page.getByRole("button", { name: "Save changes" }));
      await expect(page.getByText("Saved. It applies to every portal sign-in from now on.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 329,
      chapter,
      role: "Guardian",
      title: "A guardian given the full history reads it and can change nothing; a pupil without practice has no tab",
      caption:
        "The guardian's Practice tab lists the child's sessions and, on request, every answer. There is nothing to start, report, archive or finish. The pupil, whose practice was taken away, no longer has the tab at all.",
      covers: ["POR-32", "POR-23"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.phone);
      await walk.click(section(page, "Practice"));
      await expect(tab(page, "Practise now")).toHaveCount(0);
      await expect(tab(page, "My reports")).toHaveCount(0);
      await walk.click(sessions(page).first().getByText("Show answers"));
      await expect(sessions(page).first()).toContainText("Your answer:");
      await expect(page.getByRole("button", { name: /Start practice|Report a problem|Archive|Download PDF|Finish it/ })).toHaveCount(0);
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await expect(section(page, "Overview")).toBeVisible();
      await expect(section(page, "Practice")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 330,
      chapter,
      role: "Superadmin",
      title: "Put the practice settings back",
      caption:
        "The branch's portal settings go back to the recommended ones, with pupils practising again, and the school-wide ceiling for guardians goes back to a summary.",
      covers: ["STG-04"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.superadmin);
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await walk.click(page.getByRole("button", { name: "Portal access", exact: true }));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await walk.click(page.getByRole("button", { name: "Use the recommended settings" }));
      await walk.click(page.getByRole("button", { name: "Save changes" }));
      await expect(page.getByText("Saved. It applies to every portal sign-in from now on.")).toBeVisible();
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Settings"));
      await walk.selectOption(page.getByLabel("The most a guardian can see of a child's practice"), "SUMMARY");
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText(/Saved\. One setting changed for every branch\./)).toBeVisible();
    },
  );
}
