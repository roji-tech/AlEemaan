import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { bank as b, cast } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C22 Question bank (task 0033, section 6.22): the school's shared bank of questions. A member of the non-teaching staff has no sidebar entry and reaches the page by its address; the branch administrator
// makes them a reviewer of one subject (a person must be chosen and a subject typed); a teacher writes a question (an empty one is refused), sees only Browse and My questions, and sends the question
// for review; the reviewer finds it in the Review queue and approves it with its subject and classes, and the teacher sees it approved.

const chapter = "C22 Question bank";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const questionRow = (page: Page): Locator => page.getByRole("button", { name: new RegExp(b.question.prompt) });
const reviewer = cast.staff;

export async function c22QuestionBank(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 220,
      chapter,
      role: "Non-teaching staff",
      title: "A member of the non-teaching staff who is not a reviewer is offered no sidebar entry and no Write a question",
      caption:
        "The question bank is for staff, and the non-teaching staff are staff, but its work is writing and reviewing questions, and that belongs to a reviewer. Until they are named one, the sidebar does not offer the entry. The page still opens by its address and shows Browse, My questions and My reports; it offers no Write a question, because the server would refuse it, and nothing to review or to set.",
      covers: ["QBK-11"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, reviewer);
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Question bank", exact: true })).toHaveCount(0);
      const typed = await walk.typedAddress(`${new URL(page.url()).origin}/question-bank`);
      await expect(typed.getByRole("heading", { level: 1, name: "Question bank" })).toBeVisible();
      for (const name of ["Browse", "My questions", "My reports"])
        await expect(typed.getByRole("tab", { name, exact: true })).toBeVisible();
      for (const name of ["Review queue", "Reviewers", "Settings"])
        await expect(typed.getByRole("tab", { name, exact: true })).toHaveCount(0);
      await walk.click(tab(typed, "My questions"));
      await expect(typed.getByText("You have not written a question.")).toBeVisible();
      await expect(typed.getByRole("button", { name: "Write a question" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 221,
      chapter,
      role: "Branch administrator",
      title: "Make a member of the non-teaching staff a reviewer of one subject",
      caption:
        "An administrator chooses who reviews questions: a person, and every subject or one. Choosing no one, or one subject with none typed, is refused beside the field; the person is then listed with what they review.",
      covers: ["QBK-07"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Question bank");
      for (const name of ["Browse", "My questions", "Review queue", "Reviewers", "Settings"]) await expect(tab(page, name)).toBeVisible();
      await walk.click(tab(page, "Reviewers"));
      await expect(page.getByText("No reviewers yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add reviewer" }));
      await expect(page.getByText("Choose a person.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Person"), `${reviewer.name} (${reviewer.email})`);
      await walk.click(page.getByLabel("One subject"));
      await walk.click(page.getByRole("button", { name: "Add reviewer" }));
      await expect(page.getByText("Type the subject they review.")).toBeVisible();
      await walk.type(page.getByLabel("Subject", { exact: true }), b.subject);
      await walk.click(page.getByRole("button", { name: "Add reviewer" }));
      await expect(page.getByText(`${reviewer.name} can now review ${b.subject}.`)).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: reviewer.name })).toContainText(`Reviews ${b.subject}`);
    },
  );

  await walk.step(
    {
      id: 222,
      chapter,
      role: "Teacher",
      title: "A teacher writes a question; an empty one is refused",
      caption:
        "My questions is the teacher's own list. A question needs its text, its options with the right one marked, its subject and its classes. Saving with nothing written says so, and nothing is saved; the draft is private until it is sent for review.",
      covers: ["QBK-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await expect(tab(page, "Browse")).toBeVisible();
      await expect(tab(page, "My questions")).toBeVisible();
      for (const name of ["Review queue", "Reviewers", "Settings"]) await expect(tab(page, name)).toHaveCount(0);
      await walk.click(tab(page, "My questions"));
      await expect(page.getByText("You have not written a question yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Write a question" }));
      const form = dialog(page, "Write a question");
      await walk.click(form.getByRole("button", { name: "Save as a draft" }));
      await expect(form.getByRole("alert")).toContainText("The question is required.");
      await walk.type(form.getByLabel("Question", { exact: true }), b.question.prompt);
      await walk.type(form.getByLabel("Option 1", { exact: true }), b.question.a);
      await walk.type(form.getByLabel("Option 2", { exact: true }), b.question.b);
      await walk.click(form.getByLabel("Option 1 is correct"));
      await walk.type(form.getByLabel("Subject", { exact: true }), b.subject);
      await walk.type(form.getByLabel("Classes", { exact: true }), b.question.classTag);
      await page.keyboard.press("Enter");
      await expect(form.getByRole("list", { name: "Classes chosen" })).toContainText(b.question.classTag);
      await walk.click(form.getByRole("button", { name: "Save as a draft" }));
      await expect(page.getByText("Saved as a draft.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 223,
      chapter,
      role: "Teacher",
      title: "Send the question for review",
      caption:
        "A draft is sent for review from its page. It then says it is waiting, and the writer can no longer send it again; the writer cannot approve their own question.",
      covers: ["QBK-03"],
    },
    async () => {
      await walk.click(dialog(page, "Write a question").getByRole("button", { name: "Close", exact: true }).last());
      await expect(questionRow(page)).toContainText("Draft");
      await walk.click(questionRow(page));
      const detail = dialog(page, "Question");
      await expect(detail.getByRole("button", { name: "Approve" })).toHaveCount(0);
      await walk.click(detail.getByRole("button", { name: "Send for review" }));
      await expect(page.getByText("Sent for review.")).toBeVisible();
      await expect(detail.getByText("Waiting for review", { exact: true })).toBeVisible();
      await expect(detail.getByRole("button", { name: "Send for review" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 224,
      chapter,
      role: "Non-teaching staff",
      title: "Named a reviewer, the member finds the question bank in the sidebar and approves the question",
      caption:
        "Now that an administrator has named them a reviewer, the sidebar offers the Question bank, and Write a question with it. The Review queue lists what is waiting. Approving asks which subject and classes the question is for, and says who will see it: approved questions are visible to teachers only, unless an exam approver decides otherwise.",
      covers: ["QBK-04", "QBK-11"],
    },
    async () => {
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Close", exact: true }).last());
      await signOut(walk, page);
      await signIn(walk, page, reviewer);
      await openPage(walk, page, "Question bank");
      await expect(page.getByRole("button", { name: "Write a question" })).toBeVisible();
      for (const name of ["Browse", "My questions", "Review queue"]) await expect(tab(page, name)).toBeVisible();
      for (const name of ["Reviewers", "Settings"]) await expect(tab(page, name)).toHaveCount(0);
      await walk.click(tab(page, "Review queue"));
      await expect(questionRow(page)).toContainText("Waiting for review");
      await walk.click(questionRow(page));
      const reviewing = dialog(page, "Question");
      await walk.click(reviewing.getByRole("button", { name: "Approve" }));
      const approve = dialog(page, "Approve this question");
      await expect(approve.getByLabel("Subject", { exact: true })).toHaveValue(b.subject);
      await expect(approve.getByRole("list", { name: "Classes chosen" })).toContainText(b.question.classTag);
      await expect(approve.getByText("Approved questions are visible to teachers only.")).toBeVisible();
      await walk.click(approve.getByRole("button", { name: "Approve", exact: true }));
      await expect(page.getByText("Approved.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 225,
      chapter,
      role: "Teacher",
      title: "The writer sees the question approved",
      caption: "Back in My questions the teacher's question says Approved, and is now in Browse for the other teachers of the branch.",
      covers: ["QBK-03"],
    },
    async () => {
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Close", exact: true }).last());
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "My questions"));
      await expect(questionRow(page)).toContainText("Approved");
      await walk.click(tab(page, "Browse"));
      await expect(questionRow(page)).toBeVisible();
    },
  );
}
