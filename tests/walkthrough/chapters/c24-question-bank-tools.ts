import fs from "fs";
import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, review as r, tools as t } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C24 Question bank, overlap, printing and settings (task 0033, section 6.24): a teacher writes a near copy of an approved question; the superadministrator, who is an exam approver, sees the
// overlap warning, opens the other question and chooses who may see the copy when approving it; the teacher's own view carries no word of it; the teacher prints the copy as a PDF with a reason and
// a reviewer finds it in the Print log; the settings are changed for the school (a value that is not a number is refused), narrowed for one branch and put back.

const chapter = "C24 Question bank tools";

const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rowFor = (page: Page, prompt: string): Locator => page.getByRole("button", { name: new RegExp(escaped(prompt)) });
const closeDetail = (page: Page) => dialog(page, "Question").getByRole("button", { name: "Close", exact: true }).last();
const copy = `${r.question.prompt}${t.copySuffix}`;
const largest = (page: Page) => page.getByLabel("Largest practice set (questions)");
const presets = (page: Page) => page.getByLabel("Practice set sizes offered");

export async function c24QuestionBankTools(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 237,
      chapter,
      role: "Teacher",
      title: "A teacher writes a near copy of an approved question and sends it for review",
      caption:
        "Writing the same question again with a few words added is how a bank fills with copies. The teacher is told nothing about that: they write the question and send it for review as usual.",
      covers: ["QBK-01", "QBK-03"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "My questions"));
      await walk.click(page.getByRole("button", { name: "Write a question" }));
      const form = dialog(page, "Write a question");
      await walk.type(form.getByLabel("Question", { exact: true }), copy);
      await walk.type(form.getByLabel("Option 1", { exact: true }), r.question.a);
      await walk.type(form.getByLabel("Option 2", { exact: true }), r.question.fixedB);
      await walk.click(form.getByLabel("Option 1 is correct"));
      await walk.type(form.getByLabel("Subject", { exact: true }), r.subject);
      await walk.type(form.getByLabel("Classes", { exact: true }), r.question.classTag);
      await page.keyboard.press("Enter");
      await walk.click(form.getByRole("button", { name: "Save as a draft" }));
      await expect(page.getByText("Saved as a draft.")).toBeVisible();
      await walk.click(form.getByRole("button", { name: "Close", exact: true }).last());
      await walk.click(rowFor(page, copy));
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Send for review" }));
      await expect(page.getByText("Sent for review.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 238,
      chapter,
      role: "Superadmin",
      title: "An exam approver is warned that the question is very close to another, and can open it",
      caption:
        "The superadministrator is an exam approver. Opening the question from the queue shows a warning: it is very close to another question in the bank, with how much is the same, and a way to open the other one to compare. Only exam approvers are shown this.",
      covers: ["QBK-06"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Review queue"));
      await walk.click(rowFor(page, copy));
      const detail = dialog(page, "Question");
      await expect(detail.getByRole("alert").filter({ hasText: "very close to another" })).toBeVisible();
      await expect(detail.getByText(/\d+% the same as a question in the bank/)).toBeVisible();
      await walk.click(detail.getByRole("button", { name: "Open it" }));
      await expect(dialog(page, "Question").getByText(r.question.prompt).first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 239,
      chapter,
      role: "Superadmin",
      title: "The exam approver chooses who may see the question when approving it",
      caption:
        "Approving by an exam approver also decides who may see the question: teachers only, teachers only until a date, or pupils too, to practise with. Choosing a date option without a date is refused. Here pupils can practise with it.",
      covers: ["QBK-06"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await walk.click(tab(page, "Review queue"));
      await walk.click(rowFor(page, copy));
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Approve" }));
      const approve = dialog(page, "Approve this question");
      await walk.click(approve.getByLabel("Teachers only until a date"));
      await walk.click(approve.getByRole("button", { name: "Approve", exact: true }));
      await expect(approve.getByRole("alert")).toContainText("Choose the date and time");
      await walk.click(approve.getByLabel("Pupils can practise with it now"));
      await walk.click(approve.getByRole("button", { name: "Approve", exact: true }));
      await expect(page.getByText("Approved.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 240,
      chapter,
      role: "Teacher",
      title: "The writer sees the question approved, with no word about the overlap",
      caption:
        "In their own view the question is simply Approved. A teacher is never shown the overlap warning, the percentage or the question it resembles.",
      covers: ["QBK-10"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "My questions"));
      await walk.click(rowFor(page, copy));
      const own = dialog(page, "Question");
      await expect(own.getByText("Approved", { exact: true }).first()).toBeVisible();
      await expect(own.getByText(/very close|% the same|overlap/i)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 241,
      chapter,
      role: "Teacher",
      title: "A teacher prints a question as a PDF, with the answer key and a reason",
      caption:
        "Any question a teacher can open can be printed. The PDF carries a watermark; the answer key is optional and a reason is kept. The question then says the print is in the print log. A teacher who reviews nothing has no Print log of their own.",
      covers: ["QBK-17"],
    },
    async () => {
      await expect(tab(page, "Print log")).toHaveCount(0);
      await walk.click(dialog(page, "Question").getByRole("button", { name: "Print", exact: true }));
      const ask = dialog(page, "Print this question");
      await walk.click(ask.getByLabel("Include the answer key"));
      await walk.type(ask.getByLabel("Reason (optional)"), t.printReason);
      const downloading = page.waitForEvent("download");
      await walk.click(ask.getByRole("button", { name: "Download PDF" }));
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      expect(fs.statSync((await download.path())!).size).toBeGreaterThan(1000);
      await expect(dialog(page, "Question").getByText("The PDF was downloaded and the print is in the print log.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 242,
      chapter,
      role: "Branch administrator",
      title: "The branch administrator reads the print log: what, who, when and why",
      caption:
        "Reviewers and administrators have a Print log: each print with what was printed, how many pages, who printed it, when, and the reason they gave.",
      covers: ["QBK-19"],
    },
    async () => {
      await walk.click(closeDetail(page));
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Print log"));
      // the list also holds the practice set that was printed in Forms (C20): every kind of print is in the one log
      const lines = page.getByRole("list", { name: "Print log" }).locator(":scope > li");
      const line = lines.filter({ hasText: "A question" });
      await expect(line).toHaveCount(1);
      await expect(line).toContainText(`printed by ${cast.teacher.name}`);
      await expect(line).toContainText(`Reason: ${t.printReason}`);
    },
  );

  await walk.step(
    {
      id: 243,
      chapter,
      role: "Superadmin",
      title: "The school's settings: a value that is not a number is refused, a real change is kept with its reason",
      caption:
        "Settings has the school-wide switches and limits. Typing words where a number belongs is caught before anything is sent. A real change (a smaller largest practice set, with the sizes offered to match) is saved with an optional reason, for every branch; the page says how many settings changed.",
      covers: ["QBK-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Settings"));
      await walk.type(largest(page), t.settings.notANumber);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText("Type a whole number.")).toBeVisible();
      await walk.type(largest(page), t.settings.largest);
      await walk.type(presets(page), t.settings.presets);
      await walk.type(page.getByLabel("Reason (optional)"), t.settings.reason);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText(/Saved\. 2 settings changed for every branch\./)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 244,
      chapter,
      role: "Branch administrator",
      title: "A branch can make a limit stricter than the school's, and go back to the school's",
      caption:
        "A branch administrator sees the same settings but can only make one stricter than the school's. Here the branch allows fewer questions in a practice set than the school does; the page shows both numbers. Using the school's setting again removes the branch's own.",
      covers: ["QBK-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Settings"));
      await expect(page.getByRole("tabpanel").getByText(/A branch can only make a switch stricter/)).toBeVisible();
      await walk.type(largest(page), t.settings.branchLargest);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText(/Saved\. One setting changed for /)).toBeVisible();
      await expect(
        page.getByText(`School: ${t.settings.largest} questions. Applies here: ${t.settings.branchLargest} questions.`),
      ).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Use the school's setting for Largest practice set" }));
      await expect(page.getByText("This branch will use the school's setting once you save.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText(/Saved\. One setting changed for /)).toBeVisible();
      await expect(largest(page)).toHaveValue(t.settings.largest);
    },
  );

  await walk.step(
    {
      id: 245,
      chapter,
      role: "Superadmin",
      title: "The school's limit is put back to what it was",
      caption:
        "The change made for the school is undone the same way it was made: the limit and the sizes offered go back to their first values, and the page says two settings changed.",
      covers: ["QBK-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Question bank");
      await walk.click(tab(page, "Settings"));
      await walk.type(largest(page), t.settings.schoolLargest);
      await walk.type(presets(page), t.settings.schoolPresets);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText(/Saved\. 2 settings changed for every branch\./)).toBeVisible();
      await expect(largest(page)).toHaveValue(t.settings.schoolLargest);
    },
  );
}
