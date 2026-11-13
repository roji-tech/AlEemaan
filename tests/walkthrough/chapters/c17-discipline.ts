import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics as a, cast, discipline as d, pupils, school, users as u } from "../cast";
import { openPage, signIn, signOut } from "./shared";
import { backToStaffSignIn, findPortal, portalSignIn, portalSignOut } from "./c12-portal";

// C17 Discipline (task 0033, section 6.17): a pupil's and a staff record's standing, and who may change it. The superadmin suspends Zainab with a reason and a last day, reads the history, expels
// Ibrahim (the dialog says the guardian can still see the invoices), and finds each under the Show filter; takes the roll of their arm, where the suspended pupil is flagged and can be marked and the
// expelled one is not listed. A teacher sees the badges and no button; the branch administrator is offered Suspend and Lift suspension and never Expel or Reinstate. Zainab signs in to the portal and is
// told she is suspended until the day, with the reason left out; Ibrahim's guardian is told he is no longer a pupil and keeps only the fees; Ibrahim himself is refused with the one sentence everyone gets.
// The superadmin turns the school's switch for branch administrators off and on, narrows one branch, and the branch administrator then has no standing button. A staff record that never signs in is
// suspended, terminated (it moves to Archived and offers Reinstate, not Restore) and reinstated. Everything is put back.

const chapter = "C17 Discipline";

const rowOf = (page: Page, name: string): Locator => page.getByRole("listitem").filter({ hasText: name });
const zainab = `${pupils.zainab.first} ${pupils.zainab.last}`;
const ibrahim = `${pupils.ibrahim.first} ${pupils.ibrahim.last}`;
const aisha = `${pupils.aisha.first} ${pupils.aisha.last}`;
const kemi = `${a.office.first} ${a.office.last}`;
const STANDING_BUTTONS = /^(Suspend|Lift suspension|Expel|Reinstate|Terminate) /;

/// The admission numbers the app made, read off the Students list as a person reads them to give to a family.
const numbers = { zainab: "", ibrahim: "" };

async function openStudents(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Students");
}

export async function c17Discipline(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 165,
      chapter,
      role: "Superadmin",
      title: "Suspend a pupil, with a reason and a last day",
      caption:
        "The dialog says what a suspension does before anyone confirms it. A reason of at least three characters is needed, and a last day may be given; without one the suspension lasts until it is lifted. The list then says Suspended until that day.",
      covers: ["STD-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openStudents(walk, page);
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      numbers.zainab = ((await rowOf(page, zainab).textContent()) ?? "").match(/(?:AEM-|\d{4}\/)\d+/)![0];
      numbers.ibrahim = ((await rowOf(page, ibrahim).textContent()) ?? "").match(/(?:AEM-|\d{4}\/)\d+/)![0];
      await walk.click(page.getByRole("button", { name: `Suspend ${zainab}` }));
      const dialog = page.getByRole("dialog", { name: `Suspend ${zainab}?` });
      await expect(dialog).toContainText("will not be able to hand in work, take quizzes or practise");
      await walk.click(dialog.getByRole("button", { name: "Suspend", exact: true }));
      await expect(dialog.getByText("Say why (at least 3 characters).")).toBeVisible();
      await walk.type(dialog.getByLabel("Why are you suspending them?"), d.suspendReason);
      await walk.type(dialog.getByLabel("Last day of the suspension"), u.lastDayTyped);
      await walk.click(dialog.getByRole("button", { name: "Suspend", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${zainab} is suspended.`)).toBeVisible();
      await expect(rowOf(page, zainab)).toContainText(`Suspended until ${u.lastDayShown}`);
      await expect(rowOf(page, ibrahim)).not.toContainText("Suspended");
    },
  );

  await walk.step(
    {
      id: 166,
      chapter,
      role: "Superadmin",
      title: "Read a pupil's standing history",
      caption:
        "History lists every change, newest first, with the reason, the day and who decided. Nothing in it can be edited: it is a record, and the dialog has only a Close button.",
      covers: ["STD-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Standing history of ${zainab}` }));
      const history = page.getByRole("dialog", { name: `History of ${zainab}` });
      await expect(history).toContainText("Suspended");
      await expect(history).toContainText(d.suspendReason);
      await expect(history).toContainText(cast.superadmin.name);
      await expect(history.getByRole("textbox")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 167,
      chapter,
      role: "Superadmin",
      title: "Expel a pupil",
      caption:
        "Expelling says what it does and what it does not: the pupil comes off the class lists and the portal, the records are kept, the guardian can still see the invoices so that what is owed can be settled, and only a superadmin can reinstate. The row says Expelled and offers no Suspend.",
      covers: ["STD-03"],
    },
    async () => {
      const history = page.getByRole("dialog", { name: `History of ${zainab}` });
      await walk.click(history.getByRole("button", { name: "Close", exact: true }).last());
      await expect(history).toBeHidden();
      await walk.click(page.getByRole("button", { name: `Expel ${ibrahim}` }));
      const dialog = page.getByRole("dialog", { name: `Expel ${ibrahim}?` });
      await expect(dialog).toContainText("guardian can still see the invoices");
      await expect(dialog).toContainText("Only a super admin can reinstate them");
      await walk.type(dialog.getByLabel("Why are you expelling them?"), d.expelReason);
      await walk.click(dialog.getByRole("button", { name: "Expel", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${ibrahim} is expelled.`)).toBeVisible();
      await expect(rowOf(page, ibrahim)).toContainText("Expelled");
      await expect(page.getByRole("button", { name: `Suspend ${ibrahim}` })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 168,
      chapter,
      role: "Superadmin",
      title: "Find the suspended and the expelled with the Show filter",
      caption: "Show lists only the expelled, or only the suspended, and says so when no one matches.",
      covers: ["STD-03"],
    },
    async () => {
      await walk.selectOption(page.getByLabel("Show"), "Expelled");
      await expect(rowOf(page, ibrahim)).toBeVisible();
      await expect(rowOf(page, zainab)).toHaveCount(0);
      await walk.selectOption(page.getByLabel("Show"), "Suspended");
      await expect(rowOf(page, zainab)).toBeVisible();
      await expect(rowOf(page, ibrahim)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 169,
      chapter,
      role: "Superadmin",
      title: "Take the roll: the suspended pupil is flagged and can be marked, the expelled one is not listed",
      caption:
        "A suspended pupil stays on the class list with a Suspended badge and is marked as usual. An expelled pupil is not on the list at all.",
      covers: ["STD-05"],
    },
    async () => {
      await openPage(walk, page, "Attendance");
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await walk.selectOption(page.getByLabel("Authorized Arm:"), `${a.classes.first} ${pupils.zainab.arm} (Admin)`);
      await expect(page.getByText(`${pupils.zainab.last}, ${pupils.zainab.first}`)).toBeVisible();
      await expect(page.getByText(`Suspended until ${u.lastDayShown}`)).toBeVisible();
      await expect(page.getByText(`${pupils.ibrahim.last}, ${pupils.ibrahim.first}`)).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: "Mark All Present", exact: true }));
      await walk.click(page.getByRole("button", { name: "Save Roll Call", exact: true }).first());
      await expect(page.getByText(/^Attendance recorded for \d{4}-\d{2}-\d{2} \(\d+ students?\)\.$/)).toBeVisible();
      // the step ends on the roll itself: the flag beside the pupil who was marked
      await page.getByText(`Suspended until ${u.lastDayShown}`).scrollIntoViewIfNeeded();
    },
  );

  await walk.step(
    {
      id: 170,
      chapter,
      role: "Teacher",
      title: "A teacher sees the badges and has no standing button",
      caption: "A teacher can see who is suspended or expelled, so that a class is not surprised, and cannot change anyone's standing.",
      covers: ["STD-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openStudents(walk, page);
      await expect(rowOf(page, zainab).getByText("Suspended", { exact: false }).first()).toBeVisible();
      await expect(rowOf(page, ibrahim).getByText("Expelled", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: STANDING_BUTTONS })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Standing history of / })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 171,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator can suspend and lift, never expel or reinstate",
      caption:
        "Suspend and Lift suspension are offered; Expel and Reinstate, which stay with a superadmin, are not, and the expelled pupil's row has no button to bring them back.",
      covers: ["STD-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openStudents(walk, page);
      await expect(page.getByRole("button", { name: `Suspend ${aisha}` })).toBeVisible();
      await expect(page.getByRole("button", { name: `Lift suspension ${zainab}` })).toBeVisible();
      await expect(page.getByRole("button", { name: `Standing history of ${zainab}` })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Expel / })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Reinstate / })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 172,
      chapter,
      role: "Pupil",
      title: "A suspended pupil is told so, without the reason",
      caption:
        "The pupil signs in to the portal and is told they are suspended until the day, and that they cannot hand in work, take quizzes or practise. The reason stays with the school.",
      covers: ["STD-10"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, numbers.zainab, pupils.zainab.dobShown);
      await expect(page.getByText(`You are suspended until ${u.lastDayShown}.`)).toBeVisible();
      await expect(page.getByText(/can't hand in work, take quizzes or practise/)).toBeVisible();
      await expect(page.getByText(d.suspendReason)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 173,
      chapter,
      role: "Guardian",
      title: "The guardian of an expelled child keeps only the fees",
      caption:
        "The guardian signs in with the admission number and their phone number and is told the child is no longer a pupil of the school. Fees & Billing stays, so that what is owed can be settled; the results and the coursework do not.",
      covers: ["STD-10"],
    },
    async () => {
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, numbers.ibrahim, pupils.ibrahim.phone);
      await expect(page.getByText(`${pupils.ibrahim.first} is no longer a pupil of the school.`, { exact: false })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Fees & Billing" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Academic Results" })).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Coursework (LMS)" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 174,
      chapter,
      role: "Pupil",
      title: "An expelled pupil is refused with the one sentence everyone gets",
      caption:
        "The pupil's own sign-in is refused with the same sentence a wrong admission number or birth date gets, so that the page says nothing about why.",
      covers: ["STD-10"],
    },
    async () => {
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, numbers.ibrahim, pupils.ibrahim.dobShown);
      await expect(
        page.getByText("Verification failed. Please check the admission number and the date of birth or guardian phone number."),
      ).toBeVisible();
      await expect(page.getByRole("tablist", { name: "Student Portal Sections" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 175,
      chapter,
      role: "Superadmin",
      title: "Take suspending away from branch administrators, for the school and for one branch",
      caption:
        "A superadmin can always suspend. One switch says whether the administrators of the branches may; turned off for the school, every branch says it may not suspend, set by the school. A branch can narrow itself but never widen the school's choice. Here the school's switch is turned off and on, and then one branch is stopped.",
      covers: ["STD-09"],
    },
    async () => {
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Settings");
      await walk.click(page.getByRole("button", { name: "Discipline", exact: true }));
      await expect(page.getByText("Branch administrators may suspend", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn off for the school" }));
      await expect(page.getByText("Branch administrators may no longer suspend.")).toBeVisible();
      await expect(page.getByText("Branch administrators may not suspend", { exact: true })).toBeVisible();
      await expect(page.getByText(/may not suspend, set by the school/).first()).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Turn on for the school" }));
      await expect(page.getByText("Branch administrators may suspend again.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Stop administrators of ${school.branches.englishPrimary} suspending` }));
      await expect(page.getByText(`Administrators of ${school.branches.englishPrimary} may no longer suspend.`)).toBeVisible();
      await expect(page.getByText(/may not suspend, set by the branch/).first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 176,
      chapter,
      role: "Branch administrator",
      title: "With suspending taken away, a branch administrator has no standing button",
      caption: "The branch administrator of the stopped branch still sees who is suspended or expelled, and is offered nothing to change.",
      covers: ["STD-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openStudents(walk, page);
      await expect(rowOf(page, zainab).getByText("Suspended", { exact: false }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: STANDING_BUTTONS })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 177,
      chapter,
      role: "Superadmin",
      title: "Suspend a staff record, and read its history",
      caption:
        "A staff record is the branch's own list of the people it employs, and includes people who never sign in. It can be suspended with a reason, and its History lists every change.",
      covers: ["STD-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Academics");
      await walk.click(page.getByRole("tab", { name: "Staff" }));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await walk.click(page.getByRole("button", { name: `Suspend ${kemi}` }));
      const dialog = page.getByRole("dialog", { name: `Suspend ${kemi}?` });
      await walk.type(dialog.getByLabel("Why are you suspending them?"), d.staffSuspendReason);
      await walk.click(dialog.getByRole("button", { name: "Suspend", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${kemi} is suspended.`)).toBeVisible();
      await expect(rowOf(page, kemi)).toContainText("Suspended");
      await walk.click(page.getByRole("button", { name: `Standing history of ${kemi}` }));
      const history = page.getByRole("dialog", { name: `History of ${kemi}` });
      await expect(history).toContainText(d.staffSuspendReason);
    },
  );

  await walk.step(
    {
      id: 178,
      chapter,
      role: "Superadmin",
      title: "Terminate a staff record: it moves to Archived and offers Reinstate, not Restore",
      caption:
        "Terminating archives the record. Under Show, Archived it offers Reinstate, which needs a reason and gives the record back; Restore is only for a record that was archived without being terminated.",
      covers: ["STD-08"],
    },
    async () => {
      const history = page.getByRole("dialog", { name: `History of ${kemi}` });
      await walk.click(history.getByRole("button", { name: "Close", exact: true }).last());
      await expect(history).toBeHidden();
      await walk.click(page.getByRole("button", { name: `Terminate ${kemi}` }));
      const dialog = page.getByRole("dialog", { name: `Terminate ${kemi}?` });
      await walk.type(dialog.getByLabel("Why are you terminating them?"), d.staffTerminateReason);
      await walk.click(dialog.getByRole("button", { name: "Terminate", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${kemi} is terminated.`)).toBeVisible();
      await walk.selectOption(page.getByLabel("Show"), "Archived");
      await expect(rowOf(page, kemi)).toContainText("Terminated");
      await expect(page.getByRole("button", { name: `Restore ${kemi}` })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: `Reinstate ${kemi}` }));
      const back = page.getByRole("dialog", { name: `Reinstate ${kemi}?` });
      await walk.type(back.getByLabel("Why are you reinstating them?"), d.staffReinstateReason);
      await walk.click(back.getByRole("button", { name: "Reinstate", exact: true }));
      await expect(back).toBeHidden();
      await expect(page.getByText(`${kemi} is reinstated.`)).toBeVisible();
      await walk.selectOption(page.getByLabel("Show"), "Current staff");
      await expect(rowOf(page, kemi)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 179,
      chapter,
      role: "Superadmin",
      title: "Let the branch's administrators suspend again",
      caption: "The branch's switch is turned back on with one button, and the branch says its administrators may suspend.",
      covers: ["STD-09"],
    },
    async () => {
      await openPage(walk, page, "Settings");
      await walk.click(page.getByRole("button", { name: "Discipline", exact: true }));
      await walk.click(page.getByRole("button", { name: `Let administrators of ${school.branches.englishPrimary} suspend again` }));
      await expect(page.getByText(`Administrators of ${school.branches.englishPrimary} may suspend again.`)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 180,
      chapter,
      role: "Superadmin",
      title: "Lift the suspension and reinstate the expelled pupil",
      caption:
        "Lifting a suspension takes the badge away, and reinstating an expelled pupil puts them back on the class list of the session that is running. Each needs a reason, which goes into the history.",
      covers: ["STD-02", "STD-03"],
    },
    async () => {
      await openStudents(walk, page);
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await walk.selectOption(page.getByLabel("Show"), "Suspended");
      await walk.click(page.getByRole("button", { name: `Lift suspension ${zainab}` }));
      const lifting = page.getByRole("dialog", { name: `Lift suspension ${zainab}?` });
      await walk.type(lifting.getByLabel("Why are you lifting it?"), d.liftReason);
      await walk.click(lifting.getByRole("button", { name: "Lift suspension", exact: true }));
      await expect(lifting).toBeHidden();
      await expect(page.getByText(`${zainab} is no longer suspended.`)).toBeVisible();
      await walk.selectOption(page.getByLabel("Show"), "Expelled");
      await walk.click(page.getByRole("button", { name: `Reinstate ${ibrahim}` }));
      const back = page.getByRole("dialog", { name: `Reinstate ${ibrahim}?` });
      await walk.type(back.getByLabel("Why are you reinstating them?"), d.reinstateReason);
      await walk.click(back.getByRole("button", { name: "Reinstate", exact: true }));
      await expect(back).toBeHidden();
      await expect(page.getByText(`${ibrahim} is reinstated.`)).toBeVisible();
      await walk.selectOption(page.getByLabel("Show"), "Current students");
      await expect(rowOf(page, ibrahim)).not.toContainText("Expelled");
      await expect(rowOf(page, zainab)).not.toContainText("Suspended");
    },
  );
}
