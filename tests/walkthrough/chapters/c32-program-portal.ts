import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, programs as p, progress as g, progressPortal as q, pupils } from "../cast";
import { openPage, signIn, signOut } from "./shared";
import { backToStaffSignIn, findPortal, portalSignIn, portalSignOut, section } from "./c12-portal";

// C32 Program progress in the portal (task 0033, section 6.32): what the family sees of the record C31 wrote. A pupil sees the verified entries and the month so far, marks a week as seen, and reads the same card in
// Arabic with Arabic-Indic digits and Hijri dates, and the choice is kept when the page is loaded again. A guardian sees a summary and none of the teacher's notes. The superadministrator then lets guardians see every verified
// entry and moves the Hijri date by a day (three is refused), and the guardian sees the notes.

const chapter = "C32 Program portal";

const card = (page: Page) => page.getByRole("region", { name: `Progress in ${p.hifz.name}` });
const newText = (page: Page) => card(page).getByRole("region", { name: "New text entries" });

export async function c32ProgramPortal(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 315,
      chapter,
      role: "Pupil",
      title: "A pupil sees their verified entries and marks a week as seen",
      caption:
        "In the portal the pupil has a Progress section when the program shows pupils their record. It holds the month so far and the entries a supervisor verified. A week can be marked as seen, and the portal remembers that it was.",
      covers: ["PGR-11"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await walk.click(section(page, "Progress"));
      await expect(card(page)).toBeVisible();
      await expect(card(page).getByText("This month so far")).toBeVisible();
      await expect(newText(page)).toContainText(`${g.surahName} ${g.fromAyah} to ${g.changedTo}`);
      await walk.click(
        card(page)
          .getByRole("button", { name: /^Mark the week of .+ as seen$/ })
          .first(),
      );
      await expect(card(page).getByText("You marked this week as seen.").first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 316,
      chapter,
      role: "Pupil",
      title: "The record can be read in Arabic, with Arabic-Indic digits and Hijri dates, and the choice is kept",
      caption:
        "The same card can be read in Arabic. Digits can be Arabic-Indic and dates Hijri; words a teacher typed are never changed. The choice stays on this device, so it is still there when the page is loaded again.",
      covers: ["PGR-14"],
    },
    async () => {
      await walk.selectOption(page.getByLabel("Language"), "ar");
      await expect(card(page).getByText("هذا الشهر حتى الآن")).toBeVisible();
      await expect(card(page).getByText("This month so far")).toHaveCount(0);
      await expect(card(page).getByRole("heading", { level: 3, name: "الحفظ الجديد" })).toBeVisible();
      await expect(newText(page)).toContainText("البقرة 1 إلى 8");
      await expect(newText(page)).toContainText(g.note);
      await walk.selectOption(page.getByLabel("Digits"), "arabic");
      await expect(newText(page)).toContainText("البقرة ١ إلى ٨");
      await expect(newText(page)).toContainText(g.note);
      await walk.selectOption(page.getByLabel("Dates"), "hijri");
      await page.reload();
      await walk.click(section(page, "Progress"));
      await expect(page.getByLabel("Language")).toHaveValue("ar");
      await expect(page.getByLabel("Dates")).toHaveValue("hijri");
      await expect(page.getByLabel("Digits")).toHaveValue("arabic");
      await expect(card(page).getByText("هذا الشهر حتى الآن")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 317,
      chapter,
      role: "Guardian",
      title: "A guardian sees a summary of the record and none of the teacher's notes",
      caption:
        "A guardian signs in with the admission number and their phone number. By default they see a summary: days recorded, the amount and the ratings, and not the day-by-day entries or the notes. They choose English again for themselves.",
      covers: ["PGR-12"],
    },
    async () => {
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.phone);
      await walk.click(section(page, "Progress"));
      await walk.selectOption(page.getByLabel("Language"), "en");
      await expect(card(page).getByText("This month so far")).toBeVisible();
      await expect(card(page)).toContainText(/\d+ days? recorded/);
      await expect(card(page)).not.toContainText(g.note);
      await expect(newText(page)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 318,
      chapter,
      role: "Superadmin",
      title: "The program lets guardians see every verified entry and moves the Hijri date",
      caption:
        "In the program's settings the superadministrator chooses what a guardian sees: a summary, or every verified entry. The calculated Hijri date can be moved by up to two days where the moon was sighted on another day; three days is refused.",
      covers: ["PGR-15"],
    },
    async () => {
      await portalSignOut(walk, page);
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Programs");
      await walk.click(page.getByRole("link", { name: p.hifz.name }));
      await walk.click(page.getByRole("tab", { name: "Settings", exact: true }));
      const fieldset = page.getByRole("group", { name: "Progress records" });
      await walk.selectOption(fieldset.getByLabel("What a guardian sees"), "FULL");
      await walk.type(fieldset.getByLabel("Hijri date adjustment (days)"), q.hijriBad);
      await expect(fieldset.getByText("From -2 to 2 days.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
      await walk.type(fieldset.getByLabel("Hijri date adjustment (days)"), q.hijriGood);
      await walk.click(page.getByRole("button", { name: "Save settings" }));
      await expect(page.getByText("The settings were saved.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 319,
      chapter,
      role: "Guardian",
      title: "With the program's setting changed, the guardian reads every verified entry",
      caption:
        "The guardian signs in again. The card now lists the verified entries of the new text, with the teacher's note, as the program allowed.",
      covers: ["PGR-12"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.phone);
      await walk.click(section(page, "Progress"));
      await expect(newText(page)).toContainText(g.note);
    },
  );
}
