import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, formsMore as m, pupils } from "../cast";
import { openPage, signIn, signOut } from "./shared";
import { findPortal, portalSignIn, portalSignOut, section } from "./c12-portal";

// C40 Forms, leftovers (task 0033, section 6.40): a teacher types the address of a form that does not exist and is told so with a way back; a short practice set is written and published; a pupil starts it and leaves, and
// when they come back it says In progress and Continue shows the time left counted from the first start.

const chapter = "C40 Forms leftovers";

const dialog = (page: Page) => page.getByRole("dialog");
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const item = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

export async function c40FormsMore(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 359,
      chapter,
      role: "Teacher",
      title: "The address of a form that does not exist says so and offers the way back",
      caption:
        "A mistyped form address does not show an error page or any part of a form: it says it could not find that form, and Back to Forms leads to the list.",
      covers: ["FRM-15"],
    },
    async () => {
      await page.goBack();
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      const typed = await walk.typedAddress(`${new URL(page.url()).origin}/forms/${m.unknownId}`);
      await expect(typed.getByText("We could not find that form.")).toBeVisible();
      await expect(typed.getByRole("link", { name: "Back to Forms" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 360,
      chapter,
      role: "Teacher",
      title: "A short practice set with a time limit is written and published",
      caption: "One single-choice question and a time limit of ten minutes, for the pupils of Primary 1.",
      covers: ["FRM-02"],
    },
    async () => {
      await walk.closeTypedAddress();
      await openPage(walk, page, "Forms");
      await walk.click(page.getByRole("button", { name: "New practice set" }));
      await walk.type(dialog(page).getByLabel("Title"), m.quiz.title);
      await walk.click(dialog(page).getByLabel(a.classes.first, { exact: true }));
      await walk.type(dialog(page).getByLabel("Time limit (minutes)"), m.quiz.minutes);
      const q1 = dialog(page).getByRole("group", { name: "Question 1" });
      await walk.type(q1.getByLabel("Question", { exact: true }), m.quiz.q.prompt);
      await walk.type(q1.getByLabel("Option A", { exact: true }), m.quiz.q.a);
      await walk.type(q1.getByLabel("Option B", { exact: true }), m.quiz.q.b);
      await walk.click(q1.getByRole("radio", { name: "Option A is correct" }));
      await walk.click(dialog(page).getByRole("button", { name: "Save as draft" }));
      await expect(dialog(page)).toHaveCount(0);
      await walk.click(item(page, m.quiz.title).getByRole("button", { name: "Publish" }));
      await expect(item(page, m.quiz.title)).toContainText("Published");
    },
  );

  await walk.step(
    {
      id: 361,
      chapter,
      role: "Pupil",
      title: "A pupil starts a practice set and leaves it unfinished",
      caption: "Start opens the attempt and the clock starts. The pupil signs out without submitting.",
      covers: ["POR-17"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Forms"));
      await walk.click(tab(page, "Practice sets"));
      await walk.click(item(page, m.quiz.title).getByRole("button", { name: "Start" }));
      await expect(page.getByRole("region", { name: "Your attempt" }).getByRole("timer")).toContainText(/Time left: (09|10):\d\d/);
    },
  );

  await walk.step(
    {
      id: 362,
      chapter,
      role: "Pupil",
      title: "An attempt in progress is continued, and its countdown runs from when it started",
      caption:
        "Back in the list the set says In progress and offers Continue. The countdown was not restarted: it counts from the first start, so the time left is what remains of the ten minutes.",
      covers: ["POR-17"],
    },
    async () => {
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Forms"));
      await walk.click(tab(page, "Practice sets"));
      await expect(item(page, m.quiz.title)).toContainText("In progress");
      await walk.click(item(page, m.quiz.title).getByRole("button", { name: "Continue" }));
      await expect(page.getByRole("region", { name: "Your attempt" }).getByRole("timer")).toContainText(/Time left: (0[89]|10):\d\d/);
    },
  );
}
