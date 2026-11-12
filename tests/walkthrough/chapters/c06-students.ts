import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, pupils } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";

// C06 Students (task 0033, section 6.6): the branch administrator registers the pupils of Primary 1 (two arms), corrects a guardian's phone number, searches and filters the list, archives a
// pupil and restores them, and is stopped by the namesake check when a pupil is registered twice. A teacher then opens the same page and can look but not change anything.

const chapter = "C06 Students";

type Pupil = (typeof pupils)[keyof typeof pupils];
export const fullName = (p: Pupil) => `${p.first} ${p.last}`;
export const pupilRows = (page: Page) => page.getByRole("listitem").filter({ hasText: "· born" });
export const rowOf = (page: Page, p: Pupil) => pupilRows(page).filter({ hasText: fullName(p) });

export async function register(walk: Walk, page: Page, p: Pupil): Promise<void> {
  await walk.click(page.getByRole("button", { name: "New student", exact: true }));
  const dialog = page.getByRole("dialog", { name: "New student" });
  await walk.type(dialog.getByLabel("First name"), p.first);
  await walk.type(dialog.getByLabel("Last name"), p.last);
  await walk.selectOption(dialog.getByLabel("Gender", { exact: true }), p.gender);
  await walk.type(dialog.getByLabel("Date of birth"), p.dobTyped);
  await walk.type(dialog.getByLabel("Admission number (optional)"), p.admissionNo);
  await walk.selectOption(dialog.getByLabel("Class (optional)"), a.classes.first);
  await walk.selectOption(dialog.getByLabel("Arm", { exact: true }), p.arm);
  await walk.type(dialog.getByLabel("Guardian name (optional)"), p.guardian);
  await walk.type(dialog.getByLabel("Guardian phone (optional)"), p.phone);
  await walk.type(dialog.getByLabel("Guardian email (optional)"), p.email);
  await walk.click(dialog.getByRole("button", { name: "Register student", exact: true }));
}

export async function c06Students(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 56,
      chapter,
      role: "Branch administrator",
      title: "Register the first pupil",
      caption:
        "A pupil is registered with a name, a date of birth, a class and arm, and a guardian. Leave the admission number blank and the app makes the next one.",
      covers: ["STU-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openPage(walk, page, "Students");
      await expect(page.getByText("No students yet. Add one, or import a class from a spreadsheet.")).toBeVisible();
      await register(walk, page, pupils.aisha);
      await expect(page.getByText(`${fullName(pupils.aisha)} registered.`)).toBeVisible();
      await expect(rowOf(page, pupils.aisha)).toContainText(`Female · born ${pupils.aisha.dobShown} · ${a.classes.first}`);
      await expect(rowOf(page, pupils.aisha)).toContainText(`Guardian ${pupils.aisha.guardian} (${pupils.aisha.phone})`);
    },
  );

  await walk.step(
    {
      id: 57,
      chapter,
      role: "Branch administrator",
      title: "Register three more pupils across the two arms",
      caption: "Two pupils in arm A and two in arm B. One admission number is typed instead of generated.",
      covers: ["STU-01"],
    },
    async () => {
      for (const p of [pupils.yusuf, pupils.zainab, pupils.ibrahim]) {
        await register(walk, page, p);
        await expect(page.getByText(`${fullName(p)} registered.`)).toBeVisible();
      }
      await expect(pupilRows(page)).toHaveCount(4);
      await expect(rowOf(page, pupils.yusuf)).toContainText(pupils.yusuf.admissionNo);
      await expect(rowOf(page, pupils.zainab)).toContainText(`${a.classes.first}`);
    },
  );

  await walk.step(
    {
      id: 58,
      chapter,
      role: "Branch administrator",
      title: "Correct a guardian's phone number",
      caption: "Edit changes the details; the class stays as it is. Leaving and returning shows the change was saved.",
      covers: ["STU-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Edit ${fullName(pupils.aisha)}`, exact: true }));
      const dialog = page.getByRole("dialog", { name: `Edit ${fullName(pupils.aisha)}` });
      await walk.type(dialog.getByLabel("Guardian phone (optional)"), pupils.aisha.phoneCorrected);
      await walk.click(dialog.getByRole("button", { name: "Save", exact: true }));
      await expect(page.getByText(`${fullName(pupils.aisha)} saved.`)).toBeVisible();
      await walk.click(mainNav(page).getByRole("link", { name: "Overview" }));
      await expect(page).toHaveURL(/\/dashboard$/);
      await openPage(walk, page, "Students");
      await expect(rowOf(page, pupils.aisha)).toContainText(pupils.aisha.phoneCorrected);
      await expect(rowOf(page, pupils.aisha)).not.toContainText(pupils.aisha.phone);
    },
  );

  await walk.step(
    {
      id: 59,
      chapter,
      role: "Branch administrator",
      title: "Search by name and by admission number, and filter by status",
      caption: "Search finds a pupil by name or admission number. The filter shows current, suspended, expelled or archived pupils.",
      covers: ["STU-03"],
    },
    async () => {
      await walk.type(page.getByLabel("Search students"), "Zain");
      await expect(pupilRows(page)).toHaveCount(1);
      await expect(rowOf(page, pupils.zainab)).toBeVisible();
      await walk.type(page.getByLabel("Search students"), pupils.yusuf.admissionNo);
      await expect(pupilRows(page)).toHaveCount(1);
      await expect(rowOf(page, pupils.yusuf)).toBeVisible();
      await walk.type(page.getByLabel("Search students"), "");
      await expect(pupilRows(page)).toHaveCount(4);
      await walk.selectOption(page.getByLabel("Show"), "Suspended");
      await expect(page.getByText("No students match.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Show"), "Current students");
      await expect(pupilRows(page)).toHaveCount(4);
    },
  );

  await walk.step(
    {
      id: 60,
      chapter,
      role: "Branch administrator",
      title: "Archive a pupil and restore them",
      caption: "Archiving takes a pupil off the current list; their record stays. Show Archived finds them and Restore brings them back.",
      covers: ["STU-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Archive ${fullName(pupils.ibrahim)}`, exact: true }));
      await expect(page.getByText(`${fullName(pupils.ibrahim)} archived.`)).toBeVisible();
      await expect(pupilRows(page)).toHaveCount(3);
      await walk.selectOption(page.getByLabel("Show"), "Archived");
      await expect(rowOf(page, pupils.ibrahim)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Restore ${fullName(pupils.ibrahim)}`, exact: true }));
      await expect(page.getByText(`${fullName(pupils.ibrahim)} restored.`)).toBeVisible();
      await walk.selectOption(page.getByLabel("Show"), "Current students");
      await expect(pupilRows(page)).toHaveCount(4);
    },
  );

  await walk.step(
    {
      id: 61,
      chapter,
      role: "Branch administrator",
      title: "The namesake check stops a pupil registered twice",
      caption:
        "A second pupil with the same name and date of birth is not registered until the administrator says it is a different child; that decision is recorded against their name.",
      covers: ["STU-01", "STU-05"],
    },
    async () => {
      await register(walk, page, { ...pupils.aisha, admissionNo: "AEM-0099" });
      const dialog = page.getByRole("dialog", { name: "New student" });
      await expect(dialog.getByRole("button", { name: "Register anyway", exact: true })).toBeVisible();
      await expect(dialog.getByText("The decision is recorded against your name.")).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Cancel", exact: true }));
      await expect(pupilRows(page)).toHaveCount(4);
    },
  );

  await walk.step(
    {
      id: 62,
      chapter,
      role: "Teacher",
      title: "A teacher can look at the pupils and change nothing",
      caption: "A teacher sees the pupils of the branch. The buttons that register, import, edit and archive are not offered.",
      covers: ["STU-06", "STU-03"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Students");
      await expect(pupilRows(page)).toHaveCount(4);
      await walk.type(page.getByLabel("Search students"), "Aisha");
      await expect(pupilRows(page)).toHaveCount(1);
      for (const hidden of ["New student", "Import from spreadsheet"]) {
        await expect(page.getByRole("button", { name: hidden, exact: true })).toHaveCount(0);
      }
      await expect(page.getByRole("button", { name: /^(Edit|Archive|Restore) / })).toHaveCount(0);
    },
  );
}
