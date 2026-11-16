import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { bank, cast, review as r } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C23 Question bank, review and reports (task 0033, section 6.23): the reviewer writes a question of their own, an administrator sends it back with a reason and later approves it; a teacher
// browses with the filters, is not offered a report on their own question, reports a problem with the reviewer's question (a short reason is refused, a second report is refused), the
// reviewer reads the report by role and section and answers it, the teacher reads the answer in My reports; an administrator retires the teacher's first question with a reason.

const chapter = "C23 Question bank review and reports";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rowFor = (page: Page, prompt: string): Locator => page.getByRole("button", { name: new RegExp(escaped(prompt)) });
const closeDetail = (page: Page) => dialog(page, "Question").getByRole("button", { name: "Close", exact: true }).last();
const reportRows = (page: Page): Locator => page.getByRole("list", { name: "Reports" }).locator(":scope > li");
const reviewer = cast.staff;
const prime = r.question.prompt;
const fractions = bank.question.prompt;

export async function c23QuestionBankReview(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 226,
      chapter,
      role: "Non-teaching staff",
      title: "A reviewer writes a question of their own and sends it for review",
      caption:
        "Being a reviewer is also being allowed to write: the member of the non-teaching staff who was made a reviewer now has Write a question. Their question goes the same way as a teacher's: a draft, then sent for review, and they cannot approve it themselves.",
      covers: ["QBK-01", "QBK-03"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, reviewer);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "My questions"));
      await expect(page.getByText("You have not written a question yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Write a question" }));
      const form = dialog(page, "Write a question");
      await walk.type(form.getByLabel("Question", { exact: true }), prime);
      await walk.type(form.getByLabel("Option 1", { exact: true }), r.question.a);
      await walk.type(form.getByLabel("Option 2", { exact: true }), r.question.b);
      await walk.click(form.getByLabel("Option 1 is correct"));
      await walk.type(form.getByLabel("Subject", { exact: true }), r.subject);
      await walk.type(form.getByLabel("Classes", { exact: true }), r.question.classTag);
      await page.keyboard.press("Enter");
      await expect(form.getByRole("list", { name: "Classes chosen" })).toContainText(r.question.classTag);
      await walk.click(form.getByRole("button", { name: "Save as a draft" }));
      await expect(page.getByText("Saved as a draft.")).toBeVisible();
      await walk.click(form.getByRole("button", { name: "Close", exact: true }).last());
      await walk.click(rowFor(page, prime));
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Send for review" }));
      await expect(page.getByText("Sent for review.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 227,
      chapter,
      role: "Branch administrator",
      title: "The branch administrator sends the question back, and must give a reason",
      caption:
        "The Review queue lists what is waiting. Sending a question back asks for a reason, and refuses to go on without one; the question then goes back to its writer, who is told why.",
      covers: ["QBK-05"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Review queue"));
      await expect(rowFor(page, prime)).toContainText("Waiting for review");
      await walk.click(rowFor(page, prime));
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Send back" }));
      const ask = dialog(page, "Send this question back?");
      await walk.click(ask.getByRole("button", { name: "Send back" }));
      await expect(ask.getByText("Give a reason.")).toBeVisible();
      await walk.type(ask.getByLabel("Reason"), r.sentBack);
      await walk.click(ask.getByRole("button", { name: "Send back" }));
      await expect(page.getByText("Sent back to the writer.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 228,
      chapter,
      role: "Non-teaching staff",
      title: "The writer reads the reason, corrects the question and sends it again",
      caption:
        "A question that was sent back says so in My questions, and its page shows the reason. The writer edits it (a new option) and sends it for review again.",
      covers: ["QBK-03"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, reviewer);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "My questions"));
      await expect(rowFor(page, prime)).toContainText("Sent back");
      await walk.click(rowFor(page, prime));
      const detail = dialog(page, "Question");
      await expect(detail.getByRole("alert").filter({ hasText: r.sentBack })).toBeVisible();
      await walk.click(detail.getByRole("button", { name: "Edit" }));
      const form = dialog(page, "Edit the question");
      await walk.type(form.getByLabel("Option 2", { exact: true }), r.question.fixedB);
      await walk.click(form.getByRole("button", { name: "Save changes" }));
      await expect(page.getByText("Saved.")).toBeVisible();
      await walk.click(rowFor(page, prime));
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Send for review" }));
      await expect(page.getByText("Sent for review.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 229,
      chapter,
      role: "Branch administrator",
      title: "The branch administrator approves the corrected question",
      caption:
        "The same question comes back to the queue and is approved, with its subject and classes. It is now in the bank for the teachers of its subject.",
      covers: ["QBK-04"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Review queue"));
      await walk.click(rowFor(page, prime));
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Approve" }));
      const approve = dialog(page, "Approve this question");
      await expect(approve.getByLabel("Subject", { exact: true })).toHaveValue(r.subject);
      await walk.click(approve.getByRole("button", { name: "Approve", exact: true }));
      await expect(page.getByText("Approved.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 230,
      chapter,
      role: "Teacher",
      title: "A teacher finds questions with the search and the filters, and has no review tools",
      caption:
        "Browse lists the approved questions the teacher may use, and My questions only their own. The search finds words, and the class and state filters narrow the list. A teacher who reviews nothing has no Review queue, Reports, Reviewers or Settings.",
      covers: ["QBK-02", "QBK-09"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      for (const name of ["Browse", "My questions", "My reports"]) await expect(tab(page, name)).toBeVisible();
      for (const name of ["Review queue", "Reports", "Reviewers", "Settings"]) await expect(tab(page, name)).toHaveCount(0);
      await expect(rowFor(page, prime)).toBeVisible();
      await expect(rowFor(page, fractions)).toBeVisible();
      await walk.type(page.getByLabel("Search the questions"), "prime");
      await expect(rowFor(page, prime)).toBeVisible();
      await expect(rowFor(page, fractions)).toHaveCount(0);
      await walk.type(page.getByLabel("Search the questions"), "");
      await walk.type(page.getByLabel("Class", { exact: true }), bank.question.classTag);
      await expect(rowFor(page, fractions)).toBeVisible();
      await expect(rowFor(page, prime)).toHaveCount(0);
      await walk.type(page.getByLabel("Class", { exact: true }), "");
      await walk.selectOption(page.getByLabel("State", { exact: true }), "Approved");
      await expect(rowFor(page, prime)).toBeVisible();
      await walk.click(tab(page, "My questions"));
      await expect(rowFor(page, fractions)).toBeVisible();
      await expect(rowFor(page, prime)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 231,
      chapter,
      role: "Teacher",
      title: "A teacher reports a problem with another person's question, once",
      caption:
        "On their own question a teacher is not offered Report a problem. On the reviewer's question the button is there: a report needs a few words, and a person has one waiting report on a question, so a second is refused in the app's words.",
      covers: ["QBK-12", "QBK-16"],
    },
    async () => {
      await walk.click(rowFor(page, fractions));
      await expect(dialog(page, "Question").getByRole("button", { name: "Report a problem" })).toHaveCount(0);
      await walk.click(closeDetail(page));
      await walk.click(tab(page, "Browse"));
      await walk.click(rowFor(page, prime));
      const detail = dialog(page, "Question");
      await walk.click(detail.getByRole("button", { name: "Report a problem" }));
      const ask = dialog(page, "Report a problem with this question");
      await walk.click(ask.getByRole("button", { name: "Send report" }));
      await expect(ask.getByText("Say what is wrong in at least 5 characters.")).toBeVisible();
      await walk.type(ask.getByLabel("What is wrong with it?"), r.report);
      await walk.click(ask.getByRole("button", { name: "Send report" }));
      await expect(detail.getByText("Your report went to the reviewers.")).toBeVisible();
      await walk.click(detail.getByRole("button", { name: "Report a problem" }));
      await walk.type(
        dialog(page, "Report a problem with this question").getByLabel("What is wrong with it?"),
        "The picture is also unclear.",
      );
      await walk.click(dialog(page, "Report a problem with this question").getByRole("button", { name: "Send report" }));
      await expect(dialog(page, "Report a problem with this question").getByRole("alert")).toContainText(
        "You have already reported this question; your report is waiting for a reviewer.",
      );
    },
  );

  await walk.step(
    {
      id: 232,
      chapter,
      role: "Non-teaching staff",
      title: "The reviewer reads the report: who wrote it by role and section, never by name",
      caption:
        "The Reports tab lists each report with its question, what was written and the version reported. The reporter is shown only as their role and section, never by name. The filter shows what is waiting, resolved or dismissed.",
      covers: ["QBK-13"],
    },
    async () => {
      await walk.click(dialog(page, "Report a problem with this question").getByRole("button", { name: "Cancel" }));
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, reviewer);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Reports"));
      await expect(reportRows(page)).toHaveCount(1);
      await expect(reportRows(page).first()).toContainText("Teacher in");
      await expect(reportRows(page).first()).toContainText("Waiting");
      await expect(reportRows(page).first()).toContainText(r.report);
      await expect(page.getByRole("tabpanel")).not.toContainText(cast.teacher.name);
      await walk.selectOption(page.getByLabel("Show", { exact: true }), "Resolved");
      await expect(page.getByText("No reports to show.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Show", { exact: true }), "Waiting");
      await expect(reportRows(page)).toHaveCount(1);
    },
  );

  await walk.step(
    {
      id: 233,
      chapter,
      role: "Non-teaching staff",
      title: "The reviewer answers the report with an outcome and a reason",
      caption:
        "Answering needs an outcome (Fixed, Not an error or Needs discussion) and a reason of a few words; neither is optional. An answered report leaves Waiting and shows its outcome and reason under Dismissed or Resolved.",
      covers: ["QBK-14"],
    },
    async () => {
      await walk.click(reportRows(page).first().getByRole("button", { name: "Answer this report" }));
      const ask = dialog(page, "Answer this report");
      await walk.click(ask.getByRole("button", { name: "Answer report" }));
      await expect(ask.getByText("Choose what you decided.")).toBeVisible();
      await walk.selectOption(ask.getByLabel("Outcome"), "Not an error");
      await walk.click(ask.getByRole("button", { name: "Answer report" }));
      await expect(ask.getByText("Give a reason, at least 3 characters.")).toBeVisible();
      await walk.type(ask.getByLabel("Your reason"), r.answer);
      await walk.click(ask.getByRole("button", { name: "Answer report" }));
      await expect(page.getByText("Report answered.")).toBeVisible();
      await expect(page.getByText("No report is waiting for you.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Show", { exact: true }), "Dismissed");
      await expect(reportRows(page).first()).toContainText("Not an error");
      await expect(reportRows(page).first()).toContainText(r.answer);
    },
  );

  await walk.step(
    {
      id: 234,
      chapter,
      role: "Teacher",
      title: "The teacher who reported reads the answer in My reports",
      caption: "Every member of staff has My reports: what they wrote, and once a reviewer has answered, the outcome and the reason.",
      covers: ["QBK-14"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "My reports"));
      const mine = page.getByRole("list", { name: "Your reports" }).locator(":scope > li");
      await expect(mine).toHaveCount(1);
      await expect(mine.first()).toContainText(`What you wrote: ${r.report}`);
      await expect(mine.first()).toContainText("Not an error");
      await expect(mine.first()).toContainText(`Reason: ${r.answer}`);
    },
  );

  await walk.step(
    {
      id: 235,
      chapter,
      role: "Branch administrator",
      title: "The branch administrator retires an approved question, with a reason",
      caption:
        "A question that should no longer be used is retired, and retiring asks for a reason too. It stays in the record: What has been decided says who retired it and why.",
      covers: ["QBK-05"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Question bank");
      await walk.click(rowFor(page, fractions));
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Retire" }));
      const ask = dialog(page, "Retire this question?");
      await walk.click(ask.getByRole("button", { name: "Retire" }));
      await expect(ask.getByText("Give a reason.")).toBeVisible();
      await walk.type(ask.getByLabel("Reason"), r.retire);
      await walk.click(ask.getByRole("button", { name: "Retire" }));
      await expect(page.getByText("Retired.").first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 236,
      chapter,
      role: "Teacher",
      title: "The writer sees the question retired, and why",
      caption:
        "In My questions the teacher's first question now says Retired. Its page shows the reason, and the list of what has been decided names who decided it.",
      covers: ["QBK-05"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "My questions"));
      await expect(rowFor(page, fractions)).toContainText("Retired");
      await walk.click(rowFor(page, fractions));
      const detail = dialog(page, "Question");
      await expect(detail.getByRole("alert").filter({ hasText: r.retire })).toBeVisible();
      await expect(detail.getByText("What has been decided")).toBeVisible();
    },
  );
}
