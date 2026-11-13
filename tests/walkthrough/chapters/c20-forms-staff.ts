import fs from "fs";
import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, forms as f } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C20 Forms, the staff side (task 0033, section 6.21): a teacher writes a practice set, is refused for a question left unwritten, saves it as a draft, publishes it, opens its page, edits its
// details, reads its questions with the answer key, and prints it as a PDF with the key and a reason. A questionnaire for the staff and a public anonymous one are written and published (the public
// one shows its link and what a public link cannot promise), paper work needs a class and is closed after a confirmation, and a teacher and a member of the non-teaching staff answer the
// questionnaire addressed to them, once.

const chapter = "C20 Forms (staff)";

const dialog = (page: Page) => page.getByRole("dialog");
const item = (page: Page, text: string): Locator => page.getByRole("listitem").filter({ hasText: text });
const question = (page: Page, n: number): Locator => dialog(page).getByRole("group", { name: `Question ${n}` });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

export async function c20FormsStaff(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 202,
      chapter,
      role: "Teacher",
      title: "Forms is in a teacher's navigation, with its five sections",
      caption:
        "Forms holds the practice sets, the questionnaires, the paper work, the marking queue and what is addressed to the signed-in person.",
      covers: ["FRM-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Forms");
      for (const name of ["Practice sets", "Questionnaires", "Paper work", "Marking", "For you"])
        await expect(tab(page, name)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 203,
      chapter,
      role: "Teacher",
      title: "A practice set with a question left unwritten is refused with a sentence",
      caption: "Save as draft with the question empty says which question needs writing, and nothing is saved: the list stays as it was.",
      covers: ["FRM-03"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New practice set" }));
      await expect(dialog(page).getByRole("heading", { name: "New practice set" })).toBeVisible();
      await walk.type(dialog(page).getByLabel("Title"), f.practice.title);
      await walk.click(dialog(page).getByRole("button", { name: "Save as draft" }));
      await expect(dialog(page).getByRole("alert")).toContainText("Write the question for question 1.");
    },
  );

  await walk.step(
    {
      id: 204,
      chapter,
      role: "Teacher",
      title: "Write a practice set and save it as a draft",
      caption:
        "A practice set has a class, an optional time limit and its questions: here a single-choice question with the right option ticked, and a true or false one. A draft is not shown to any pupil.",
      covers: ["FRM-02"],
    },
    async () => {
      await walk.type(dialog(page).getByLabel("Instructions"), f.practice.instructions);
      await walk.click(dialog(page).getByLabel(a.classes.first, { exact: true }));
      await walk.type(dialog(page).getByLabel("Time limit (minutes)"), f.practice.minutes);
      const q1 = question(page, 1);
      await walk.type(q1.getByLabel("Question", { exact: true }), f.practice.q1.prompt);
      await walk.type(q1.getByLabel("Option A", { exact: true }), f.practice.q1.a);
      await walk.type(q1.getByLabel("Option B", { exact: true }), f.practice.q1.b);
      await walk.click(q1.getByRole("radio", { name: "Option B is correct" }));
      await walk.type(q1.getByLabel("Points"), f.practice.q1.points);
      await walk.click(dialog(page).getByRole("button", { name: "Add a question" }));
      const q2 = question(page, 2);
      await walk.selectOption(q2.getByLabel("Question type"), "TRUE_FALSE");
      await walk.type(q2.getByLabel("Question", { exact: true }), f.practice.q2.prompt);
      await walk.click(q2.getByRole("radio", { name: "True" }));
      await walk.click(dialog(page).getByRole("button", { name: "Save as draft" }));
      await expect(dialog(page)).toHaveCount(0);
      await expect(page.getByRole("status").filter({ hasText: "saved as a draft" })).toBeVisible();
      await expect(item(page, f.practice.title)).toContainText("Draft");
      await expect(item(page, f.practice.title)).toContainText("2 questions");
    },
  );

  await walk.step(
    {
      id: 205,
      chapter,
      role: "Teacher",
      title: "Publish the practice set",
      caption:
        "Publishing makes it available to the pupils of the class. The list says Published, and the teacher can still close it later.",
      covers: ["FRM-02"],
    },
    async () => {
      await walk.click(item(page, f.practice.title).getByRole("button", { name: "Publish" }));
      await expect(item(page, f.practice.title)).toContainText("Published");
    },
  );

  await walk.step(
    {
      id: 206,
      chapter,
      role: "Teacher",
      title: "Open a form's page and edit its details",
      caption:
        "A form's title in the list opens its page: the details, the status and a way back to Forms, with Overview, Questions and Results. Edit details changes the title and the time limit, and the heading and the details follow.",
      covers: ["FRM-07", "FRM-08"],
    },
    async () => {
      await walk.click(item(page, f.practice.title).getByRole("link", { name: f.practice.title }));
      await expect(page.getByRole("heading", { level: 1, name: f.practice.title })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to Forms" })).toBeVisible();
      for (const name of ["Overview", "Questions", "Results"]) await expect(tab(page, name)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Edit details" }));
      await walk.type(dialog(page).getByLabel("Title"), f.practice.editedTitle);
      await walk.type(dialog(page).getByLabel("Time limit (minutes)"), f.practice.editedMinutes);
      await walk.click(dialog(page).getByRole("button", { name: "Save changes" }));
      await expect(dialog(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: f.practice.editedTitle })).toBeVisible();
      await expect(page.getByText(`${f.practice.editedMinutes} minutes`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 207,
      chapter,
      role: "Teacher",
      title: "Read the questions with the answer key",
      caption:
        "Whoever manages the form sees each question with its kind and points and the right option marked. Anyone who does not manage it never sees the key.",
      covers: ["FRM-11"],
    },
    async () => {
      await walk.click(tab(page, "Questions"));
      await expect(page.getByText(f.practice.q1.prompt)).toBeVisible();
      await expect(page.getByText("Correct answer").first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 208,
      chapter,
      role: "Teacher",
      title: "Print the form as a PDF, with the answer key and a reason",
      caption:
        "A printed copy can include the answer key, but only with a reason, which is kept: the PDF is watermarked and the print is logged against the person who made it.",
      covers: ["FRM-10"],
    },
    async () => {
      await walk.click(tab(page, "Overview"));
      await walk.click(page.getByRole("button", { name: /^Print/ }));
      await walk.click(dialog(page).getByLabel("Include the answer key"));
      await walk.type(dialog(page).getByLabel("Reason (optional)"), f.practice.printReason);
      const downloading = page.waitForEvent("download");
      await walk.click(dialog(page).getByRole("button", { name: "Download PDF" }));
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      expect(fs.statSync((await download.path())!).size).toBeGreaterThan(1000);
    },
  );

  await walk.step(
    {
      id: 209,
      chapter,
      role: "Teacher",
      title: "A questionnaire for the staff is limited to the roles ticked",
      caption:
        "A questionnaire for members of the school is addressed to the roles ticked, here the teaching and the non-teaching staff. It has no public link.",
      covers: ["FRM-04"],
    },
    async () => {
      await walk.click(page.getByRole("link", { name: "Back to Forms" }));
      await walk.click(tab(page, "Questionnaires"));
      await walk.click(page.getByRole("button", { name: "New questionnaire" }));
      await walk.type(dialog(page).getByLabel("Title"), f.staffPulse.title);
      await walk.click(dialog(page).getByLabel("Teachers", { exact: true }));
      await walk.click(dialog(page).getByLabel("Non-teaching staff"));
      const q1 = question(page, 1);
      await walk.selectOption(q1.getByLabel("Question type"), "TEXT");
      await walk.type(q1.getByLabel("Question", { exact: true }), f.staffPulse.prompt);
      await walk.click(dialog(page).getByRole("button", { name: "Save as draft" }));
      await expect(item(page, f.staffPulse.title)).toContainText("Members");
      await walk.click(item(page, f.staffPulse.title).getByRole("button", { name: "Publish" }));
      await expect(item(page, f.staffPulse.title)).toContainText("Published");
      await expect(item(page, f.staffPulse.title).getByRole("button", { name: "Copy link" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 210,
      chapter,
      role: "Teacher",
      title: "A public questionnaire gives a link, and says what a public link cannot promise",
      caption:
        "A questionnaire open to anyone with the link can be anonymous. Once published it shows its address with a Copy link button, and says plainly that a public link cannot tell who is answering and cannot stop one person answering twice.",
      covers: ["FRM-04", "FRM-09"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New questionnaire" }));
      await walk.type(dialog(page).getByLabel("Title"), f.lunch.title);
      await walk.click(dialog(page).getByLabel("Anyone with the link"));
      await walk.click(dialog(page).getByLabel("Anonymous"));
      const q1 = question(page, 1);
      await walk.selectOption(q1.getByLabel("Question type"), "RATING");
      await walk.type(q1.getByLabel("Question", { exact: true }), f.lunch.prompt);
      await walk.click(dialog(page).getByRole("button", { name: "Save as draft" }));
      await expect(item(page, f.lunch.title)).toContainText("Anyone with the link");
      await expect(item(page, f.lunch.title)).toContainText("Anonymous");
      await walk.click(item(page, f.lunch.title).getByRole("button", { name: "Publish" }));
      await expect(item(page, f.lunch.title)).toContainText("Published");
      await expect(item(page, f.lunch.title).getByText(/\/q\/[\w-]+/)).toBeVisible();
      await expect(item(page, f.lunch.title).getByRole("button", { name: "Copy link" })).toBeVisible();
      await expect(item(page, f.lunch.title)).toContainText("cannot tell who is answering");
    },
  );

  await walk.step(
    {
      id: 211,
      chapter,
      role: "Teacher",
      title: "Paper work needs a class, is published at once, and can be closed",
      caption:
        "Paper work is work handed in on paper. With no class ticked it is refused with a sentence; with a class it is published straight away, and closing it asks for a confirmation.",
      covers: ["FRM-05"],
    },
    async () => {
      await walk.click(tab(page, "Paper work"));
      await walk.click(page.getByRole("button", { name: "New paper work" }));
      await walk.type(dialog(page).getByLabel("Title"), f.paper.title);
      await walk.click(dialog(page).getByRole("button", { name: "Create paper work" }));
      await expect(dialog(page).getByRole("alert")).toContainText("Choose at least one class for the paper work.");
      await walk.click(dialog(page).getByLabel(a.classes.first, { exact: true }));
      await walk.click(dialog(page).getByRole("button", { name: "Create paper work" }));
      await expect(dialog(page)).toHaveCount(0);
      await expect(item(page, f.paper.title)).toContainText("Published");
      await expect(item(page, f.paper.title)).toContainText(a.classes.first);
      await walk.click(item(page, f.paper.title).getByRole("button", { name: "Close" }));
      await expect(dialog(page).getByRole("heading", { name: /^Close this/ })).toBeVisible();
      await walk.click(dialog(page).getByRole("button", { name: "Close it" }));
      await expect(item(page, f.paper.title)).toContainText("Closed");
    },
  );

  await walk.step(
    {
      id: 212,
      chapter,
      role: "Teacher",
      title: "A questionnaire addressed to the staff is answered in For you, once",
      caption:
        "For you lists what is addressed to the signed-in person. Answer opens the questions; Send my answers records them, and the row then says Answered and offers no second go.",
      covers: ["FRM-06"],
    },
    async () => {
      await walk.click(tab(page, "For you"));
      await expect(item(page, f.staffPulse.title)).toBeVisible();
      await walk.click(item(page, f.staffPulse.title).getByRole("button", { name: "Answer" }));
      await expect(dialog(page).getByRole("heading", { name: f.staffPulse.title })).toBeVisible();
      await walk.type(dialog(page).getByLabel(f.staffPulse.prompt), f.staffPulse.answer);
      await walk.click(dialog(page).getByRole("button", { name: "Send my answers" }));
      await expect(dialog(page)).toHaveCount(0);
      await expect(item(page, f.staffPulse.title)).toContainText("Answered");
      await expect(item(page, f.staffPulse.title).getByRole("button", { name: "Answer" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 213,
      chapter,
      role: "Non-teaching staff",
      title: "A member of the non-teaching staff answers the same questionnaire",
      caption: "The non-teaching staff have Forms too, for what is addressed to them, and see only their own section.",
      covers: ["FRM-06"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await openPage(walk, page, "Forms");
      await walk.click(tab(page, "For you"));
      await walk.click(item(page, f.staffPulse.title).getByRole("button", { name: "Answer" }));
      await walk.type(dialog(page).getByLabel(f.staffPulse.prompt), f.staffPulse.answerStaff);
      await walk.click(dialog(page).getByRole("button", { name: "Send my answers" }));
      await expect(dialog(page)).toHaveCount(0);
      await expect(item(page, f.staffPulse.title)).toContainText("Answered");
    },
  );
}
