import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, programs as p, progress as g, pupils } from "../cast";
import { openPage, signIn, signOut } from "./shared";

// C31 Program progress records (task 0033, section 6.31): a running log for each person in a program, here the Quran booklet. The superadministrator turns progress records on by choosing a template and asks that entries be
// verified before families see them. The teacher adds an entry (a range past the end of a surah is refused with the surah's length), is offered the next range after the last ayah done, finds that a second entry for the same
// day opens the first, reads an entry's history, fills the week grid like the paper booklet, and hands entries in. The supervisor reads and verifies but cannot write: verifies one entry, returns another with a comment
// (a few words are asked for), the teacher hands it in again and the supervisor verifies the whole week from the grid.

const chapter = "C31 Program progress";

const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const entries = (page: Page): Locator => page.getByRole("list", { name: "New text entries" }).getByRole("listitem");
const revision = (page: Page): Locator => page.getByRole("list", { name: "Daily revision entries" }).getByRole("listitem");
const yusuf = `${pupils.yusuf.first} ${pupils.yusuf.last}`;
const teacher = cast.teacher.name;

async function openRecord(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Programs");
  await walk.click(page.getByRole("link", { name: p.hifz.name }));
  await walk.click(tab(page, "Progress records"));
  await walk.click(page.getByRole("button", { name: `Open the progress record of ${yusuf}` }));
  await expect(page.getByRole("heading", { level: 2, name: yusuf })).toBeVisible();
}

export async function c31ProgramProgress(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 306,
      chapter,
      role: "Superadmin",
      title: "Progress records are turned on by choosing a template, and entries are to be verified before families see them",
      caption:
        "A program keeps progress records only once it is switched on, and only after a template is chosen: the page asks for one before it will save. Here the Quran booklet is chosen, and entries must be verified by someone other than the writer before a family can see them.",
      covers: ["PGR-10"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await expect(tab(page, "Progress records")).toHaveCount(0);
      await walk.click(tab(page, "Settings"));
      const fieldset = page.getByRole("group", { name: "Progress records" });
      await expect(fieldset.getByTestId("progress-settings-state")).toContainText("switched off for this program");
      await walk.click(fieldset.getByLabel("Keep progress records in this program"));
      await expect(fieldset.getByText("Choose a template before turning progress records on.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
      await walk.selectOption(fieldset.getByLabel("Template"), g.template);
      await walk.click(fieldset.getByLabel("Verify entries before families see them"));
      await walk.type(fieldset.getByLabel("Lock is handed back after (seconds)"), g.lockRelease);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText("The settings were saved.")).toBeVisible();
      await walk.click(tab(page, "Progress records"));
      await expect(page.getByText(/Template: /)).toBeVisible();
      await expect(page.getByText("entries are verified before families see them")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 307,
      chapter,
      role: "Teacher",
      title: "A teacher adds an entry to a person's record; a range beyond the end of the surah is refused with its length",
      caption:
        "The teacher opens a person's record and adds to the new text: a surah and ayah range, a rating and a note. An ayah beyond the end of the surah is refused and the surah's length is said. Because the program verifies, the entry is a draft.",
      covers: ["PGR-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openRecord(walk, page);
      await expect(page.getByRole("list", { name: "New text entries" })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: "Add to new text" }));
      const add = dialog(page, "Add new text");
      await walk.selectOption(add.getByLabel("From surah"), g.surah);
      await walk.type(add.getByLabel("From ayah"), g.fromAyah);
      await walk.selectOption(add.getByLabel("To surah"), g.surah);
      await walk.type(add.getByLabel("To ayah"), g.tooFar);
      await walk.selectOption(add.getByLabel("Rating"), g.rating);
      await walk.click(add.getByRole("button", { name: "Add entry" }));
      await expect(add.getByText("Surah 2 has ayat 1 to 286.")).toBeVisible();
      await walk.type(add.getByLabel("To ayah"), g.toAyah);
      await walk.type(add.getByLabel("Notes"), g.note);
      await walk.click(add.getByRole("button", { name: "Add entry" }));
      await expect(page.getByText("The entry was added.")).toBeVisible();
      await expect(entries(page)).toHaveCount(1);
      await expect(entries(page)).toContainText(`${g.surahName} ${g.fromAyah} to ${g.toAyah}`);
      await expect(entries(page)).toContainText(g.note);
      await expect(entries(page)).toContainText(g.ratingShown);
      await expect(entries(page)).toContainText("Draft");
      await expect(entries(page)).toContainText(`Last saved by ${teacher}`);
    },
  );

  await walk.step(
    {
      id: 308,
      chapter,
      role: "Teacher",
      title: "The next range starts after the last ayah done, and a second entry for the same day opens the first",
      caption:
        "Adding again offers the range that follows what was done: the same surah, from the next ayah. Saving it for the same day does not make a second entry: the first opens to be changed, and the change is kept.",
      covers: ["PGR-02", "PGR-03"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Add to new text" }));
      const next = dialog(page, "Add new text");
      await expect(next.getByLabel("From surah")).toHaveValue(g.surah);
      await expect(next.getByLabel("From ayah")).toHaveValue(g.nextFrom);
      await walk.type(next.getByLabel("To ayah"), g.nextTo);
      await walk.click(next.getByRole("button", { name: "Add entry" }));
      const change = dialog(page, "Change new text");
      await expect(change).toBeVisible();
      await expect(change.getByLabel("To ayah")).toHaveValue(g.toAyah);
      await walk.type(change.getByLabel("To ayah"), g.changedTo);
      await walk.click(change.getByRole("button", { name: "Save changes" }));
      await expect(page.getByText("The entry was changed.")).toBeVisible();
      await expect(entries(page)).toContainText(`${g.surahName} ${g.fromAyah} to ${g.changedTo}`);
      await expect(entries(page)).toHaveCount(1);
    },
  );

  await walk.step(
    {
      id: 309,
      chapter,
      role: "Teacher",
      title: "Every save is kept in the entry's history",
      caption:
        "An entry's history lists each save: when it was made, and when it was changed. Nothing that was written is lost when it is corrected.",
      covers: ["PGR-06"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: /^History of the new text entry/ }));
      const history = dialog(page, "History of this entry");
      await expect(history.getByRole("listitem")).toHaveCount(2);
      await expect(history).toContainText("create");
      await expect(history).toContainText("update");
    },
  );

  await walk.step(
    {
      id: 310,
      chapter,
      role: "Teacher",
      title: "The week grid mirrors the paper booklet and refuses a day before the place began",
      caption:
        "The week grid lays the week out like the paper booklet: a row for each kind of entry, a column for each day. This pupil joined today, so a day of this week is before their place began: the save is refused and nothing is added.",
      covers: ["PGR-18"],
    },
    async () => {
      await walk.click(dialog(page, "History of this entry").getByRole("button", { name: "Close" }).last());
      await walk.click(page.getByRole("button", { name: "Week grid" }));
      const grid = page.getByRole("region", { name: "Week grid" });
      await expect(grid.getByRole("button", { name: "Save the week" })).toBeDisabled();
      await walk.selectOption(grid.getByLabel(/^New text .+ From surah$/).first(), g.gridSurah);
      await walk.type(grid.getByLabel(/^New text .+ From ayah$/).first(), g.gridFrom);
      await walk.selectOption(grid.getByLabel(/^New text .+ To surah$/).first(), g.gridSurah);
      await walk.type(grid.getByLabel(/^New text .+ To ayah$/).first(), g.gridTo);
      await walk.selectOption(grid.getByLabel(/^New text .+ Rating$/).first(), g.gridRating);
      await walk.click(grid.getByRole("button", { name: "Save the week" }));
      await expect(grid.getByText("That is before this person's place began.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Hide the week grid" }));
      await expect(entries(page)).toHaveCount(1);
    },
  );

  await walk.step(
    {
      id: 311,
      chapter,
      role: "Teacher",
      title: "When the program verifies, an entry is handed in, and its writer cannot verify it",
      caption:
        "A draft is handed in when the teacher is done with it. It then says it was handed in, and the teacher is not offered Verify: another person has to. The daily revision is added and handed in at once.",
      covers: ["PGR-07"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: /^Hand in the new text entry/ }).first());
      await expect(page.getByText("The entry was handed in.")).toBeVisible();
      await expect(entries(page).first()).toContainText("Handed in");
      await expect(page.getByRole("button", { name: /^Verify the new text entry/ })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: "Add to daily revision" }));
      const add = dialog(page, "Add daily revision");
      await walk.selectOption(add.getByLabel("From surah"), g.gridSurah);
      await walk.type(add.getByLabel("From ayah"), g.gridFrom);
      await walk.selectOption(add.getByLabel("To surah"), g.gridSurah);
      await walk.type(add.getByLabel("To ayah"), g.gridTo);
      await walk.selectOption(add.getByLabel("Rating"), g.gridRating);
      await walk.click(add.getByRole("button", { name: "Add and hand in" }));
      await expect(revision(page)).toContainText("Handed in");
    },
  );

  await walk.step(
    {
      id: 312,
      chapter,
      role: "Non-teaching staff",
      title: "A supervisor verifies one entry, or returns another with a comment, and cannot write",
      caption:
        "The supervisor sees how many entries wait in each person's record. They can read and verify, but there is no Add: they are not named to write there. Returning an entry asks for a few words; the writer will see them.",
      covers: ["PGR-07", "PGR-08", "PGR-13"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "Progress records"));
      await expect(page.getByRole("list", { name: "People" }).getByRole("listitem").filter({ hasText: yusuf })).toContainText(
        /\d+ waiting to be verified/,
      );
      await walk.click(page.getByRole("button", { name: `Open the progress record of ${yusuf}` }));
      await expect(page.getByRole("button", { name: "Add to new text" })).toHaveCount(0);
      await expect(page.getByText("You are not named to write to this person's group.")).toBeVisible();
      await walk.click(
        entries(page)
          .filter({ hasText: `${g.surahName} ${g.fromAyah} to ${g.changedTo}` })
          .getByRole("button", { name: /^Verify/ }),
      );
      await expect(page.getByText("The entry was verified.")).toBeVisible();
      await walk.click(revision(page).getByRole("button", { name: /^Return/ }));
      const ask = dialog(page, "Return this entry");
      await walk.type(ask.getByLabel("Comment for the writer"), g.tooShort);
      await walk.click(ask.getByRole("button", { name: "Return entry" }));
      await expect(ask.getByText(/few words/i)).toBeVisible();
      await walk.type(ask.getByLabel("Comment for the writer"), g.comment);
      await walk.click(ask.getByRole("button", { name: "Return entry" }));
      await expect(page.getByText("The entry was returned.")).toBeVisible();
      await expect(revision(page)).toContainText(`Returned: ${g.comment}`);
    },
  );

  await walk.step(
    {
      id: 313,
      chapter,
      role: "Teacher",
      title: "The writer sees the comment on a returned entry and hands it in again",
      caption:
        "A returned entry is a draft again, and the teacher reads what the supervisor wrote. They correct what is needed and hand it in once more.",
      covers: ["PGR-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openRecord(walk, page);
      await expect(revision(page)).toContainText(`Returned: ${g.comment}`);
      await walk.click(page.getByRole("button", { name: /^Hand in the daily revision entry/ }));
      await expect(page.getByText("The entry was handed in.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 314,
      chapter,
      role: "Non-teaching staff",
      title: "A supervisor verifies the whole week of a person in one step",
      caption:
        "From the week grid the supervisor verifies everything that was handed in for the week with one button, and the grid says how many entries were verified.",
      covers: ["PGR-09"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(tab(page, "Progress records"));
      await walk.click(page.getByRole("button", { name: `Open the progress record of ${yusuf}` }));
      await walk.click(page.getByRole("button", { name: "Week grid" }));
      const grid = page.getByRole("region", { name: "Week grid" });
      await walk.click(grid.getByRole("button", { name: "Verify the week" }));
      await expect(grid.getByText(/entries? w(as|ere) verified\./)).toBeVisible();
    },
  );
}
