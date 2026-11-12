import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, notices, pupils, school } from "../cast";
import { mainNav, signIn, signOut } from "./shared";
import { register, rowOf } from "./c06-students";

// C12 The portal (task 0033, section 6.6): the people who are NOT staff sign in. A pupil signs in with the admission number and the date of birth, a guardian with the same admission number and
// the guardian's phone number; which of the two was typed says who is acting. The chapter shows what each of them sees, what each is refused, a guardian with two children, and the branch setting
// (superadministrator, Settings, Portal access) that decides what a pupil and a guardian may open, changed and then put back. The sections that need a published result, a handed-in assignment
// or a practice set (POR-05, POR-06, POR-15 to POR-20 and POR-24 to POR-32) come with the chapters that make that data.

const chapter = "C12 The portal";

const sections = (page: Page) => page.getByRole("tablist", { name: "Student Portal Sections" });
const section = (page: Page, name: string) => sections(page).getByRole("tab", { name, exact: true });
const refusal = (page: Page) => page.getByRole("alert").filter({ hasText: /\w/ });
// the sentence the portal gives for every failed sign-in (src/lib/portal/service.ts, PORTAL_SIGNIN_FAILED): it does not say which of the two things was wrong
const SIGN_IN_FAILED = "Verification failed. Please check the admission number and the date of birth or guardian phone number.";

/// From the staff sign-in page to the portal's own sign-in card, the way a parent finds it: the logo leads to the front page, which has a link to the portal.
async function findPortal(walk: Walk, page: Page): Promise<void> {
  await walk.click(page.getByRole("link", { name: "AlEemaan", exact: true }));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await walk.click(page.getByRole("link", { name: "Parent and pupil portal" }).first());
  await expect(page.getByRole("heading", { level: 1, name: "AlEemaan Portal" })).toBeVisible();
}

/// The portal card asks for the admission number and ONE secret: the date of birth (a pupil) or the guardian's phone (a guardian).
async function portalSignIn(walk: Walk, page: Page, admissionNo: string, secret: string): Promise<void> {
  await walk.type(page.getByLabel("Student Admission Number"), admissionNo);
  await walk.type(page.getByLabel("Date of Birth OR Guardian Phone"), secret);
  await walk.click(page.getByRole("button", { name: "Access Student Portal" }));
}

async function portalSignOut(walk: Walk, page: Page): Promise<void> {
  await walk.click(page.getByRole("button", { name: "Sign Out" }));
  await expect(page.getByRole("heading", { level: 1, name: "AlEemaan Portal" })).toBeVisible();
  await expect(page.getByLabel("Student Admission Number")).toBeVisible();
}

/// The portal has no link to the staff sign-in, so a person who wants it presses the browser's Back button, which leads to the front page, and presses its Sign in.
async function backToStaffSignIn(walk: Walk, page: Page): Promise<void> {
  await page.goBack();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
  await walk.click(page.getByRole("link", { name: "Sign in" }).first());
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to your dashboard" })).toBeVisible();
}

export async function c12Portal(walk: Walk, page: Page): Promise<void> {
  // The admission number the app made for Aisha (read from the list, as a person reads it off the screen to give it to her mother).
  const issued = { aisha: "" };

  await walk.step(
    {
      id: 95,
      chapter,
      role: "Branch administrator",
      title: "Register a sister under the same guardian",
      caption:
        "A guardian's phone number joins the children who share it. Hafsa is registered with the same guardian and phone as Aisha, so one sign-in will open both.",
      covers: ["STU-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await walk.click(mainNav(page).getByRole("link", { name: "Students", exact: true }));
      await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
      await register(walk, page, pupils.hafsa);
      await expect(page.getByText(`${pupils.hafsa.first} ${pupils.hafsa.last} registered.`)).toBeVisible();
      await expect(rowOf(page, pupils.hafsa)).toContainText(`Guardian ${pupils.hafsa.guardian} (${pupils.hafsa.phone})`);
      const aisha = rowOf(page, pupils.aisha);
      await expect(aisha).toContainText(/\d{4}\/\d+/);
      issued.aisha = ((await aisha.textContent()) ?? "").match(/\d{4}\/\d+/)![0];
    },
  );

  await walk.step(
    {
      id: 96,
      chapter,
      role: "Pupil",
      title: "A pupil's portal details do not open the school app",
      caption:
        "The staff sign-in asks for an e-mail address and a password. An admission number and a date of birth are refused there, with a sentence.",
      covers: ["POR-12"],
    },
    async () => {
      await signOut(walk, page);
      await walk.type(page.getByLabel("Email address"), pupils.yusuf.admissionNo);
      await walk.type(page.getByLabel("Password", { exact: true }), pupils.yusuf.dobShown);
      await walk.click(page.getByRole("button", { name: "Sign in" }));
      await expect(refusal(page).first()).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
    },
  );

  await walk.step(
    {
      id: 97,
      chapter,
      role: "Pupil",
      title: "A pupil signs in to the portal",
      caption:
        "A parent finds the portal from the front page. A pupil types the admission number and the date of birth. The overview shows attendance and the school's announcements, and no fees: that is the branch's setting.",
      covers: ["POR-01", "POR-04"],
    },
    async () => {
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await expect(page.getByRole("heading", { name: `${pupils.yusuf.first} ${pupils.yusuf.last}` })).toBeVisible();
      await expect(page.getByText("Attendance Rate")).toBeVisible();
      await expect(page.getByRole("heading", { name: "School Announcements" })).toBeVisible();
      await expect(page.getByRole("heading", { name: notices.sports.title })).toBeVisible();
      for (const name of ["Overview", "Academic Results", "Coursework (LMS)", "Forms", "Practice"])
        await expect(section(page, name)).toBeVisible();
      await expect(section(page, "Fees & Billing")).toHaveCount(0);
      await expect(page.getByText("School Fee Balance")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 98,
      chapter,
      role: "Pupil",
      title: "Results, forms and practice: the pupil's own sections",
      caption:
        "Results are shown only when they have been published. Forms has practice sets, questionnaires and paper work. Practice has its own setup, history and reports.",
      covers: ["POR-10", "POR-13", "POR-21"],
    },
    async () => {
      await walk.click(section(page, "Academic Results"));
      await expect(page.getByRole("heading", { name: "No Published Results Found" })).toBeVisible();
      await walk.click(section(page, "Forms"));
      for (const name of ["Practice sets", "Questionnaires", "Paper work"])
        await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
      await walk.click(section(page, "Practice"));
      for (const name of ["Practise now", "History", "My reports"])
        await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 99,
      chapter,
      role: "Pupil",
      title: "Sign out, and a wrong date of birth or admission number is refused",
      caption:
        "Both mistakes get the same sentence, which does not say which was wrong, so nobody can use the form to find out which admission numbers exist.",
      covers: ["POR-09", "POR-03"],
    },
    async () => {
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, "2017-07-21");
      await expect(page.getByRole("alert").filter({ hasText: SIGN_IN_FAILED })).toBeVisible();
      await portalSignIn(walk, page, "AEM-0200", pupils.yusuf.dobShown);
      await expect(page.getByRole("alert").filter({ hasText: SIGN_IN_FAILED })).toBeVisible();
      await expect(page.getByLabel("Student Admission Number")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 100,
      chapter,
      role: "Guardian",
      title: "A guardian signs in with the phone number",
      caption:
        "The same admission number with the guardian's phone number signs in a guardian. A guardian sees the fee balance and every child who shares the phone, and has no Forms section: those are the pupil's own.",
      covers: ["POR-04", "POR-14", "ANN-06"],
    },
    async () => {
      await portalSignIn(walk, page, issued.aisha, pupils.aisha.phoneCorrected);
      // the next person on the screen starts on the Overview, not where the pupil left off (found by this chapter's first run, task 0061)
      await expect(section(page, "Overview")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("heading", { name: `${pupils.aisha.first} ${pupils.aisha.last}` })).toBeVisible();
      await expect(page.getByText("School Fee Balance")).toBeVisible();
      await expect(page.getByRole("heading", { name: notices.resumption.title })).toBeVisible();
      await expect(page.getByRole("heading", { name: notices.sports.title })).toBeVisible();
      for (const name of ["Overview", "Academic Results", "Fees & Billing", "Coursework (LMS)", "Practice"])
        await expect(section(page, name)).toBeVisible();
      await expect(section(page, "Forms")).toHaveCount(0);
      await expect(page.getByLabel("Select student to view")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 101,
      chapter,
      role: "Guardian",
      title: "Fees and billing: the invoice and its receipts",
      caption:
        "The guardian reads the invoice the school made, what has been paid and each receipt. Both payments of the finance chapter are here.",
      covers: ["POR-07"],
    },
    async () => {
      await walk.click(section(page, "Fees & Billing"));
      await expect(page.getByRole("heading", { name: "Fee Invoices" })).toBeVisible();
      await expect(page.getByText("1 Invoice", { exact: true })).toBeVisible();
      await expect(page.getByRole("row", { name: /PAID/ }).first()).toContainText("₦55,000");
      await expect(page.getByText("Account fully settled")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Payment Receipts History" })).toBeVisible();
      // the two payments of C11 (20,000 and then the 35,000 that was left), each with its receipt
      await expect(page.getByRole("row").filter({ hasText: "₦20,000" })).toHaveCount(1);
      await expect(page.getByRole("row").filter({ hasText: "₦35,000" })).toHaveCount(1);
      await walk.click(page.getByRole("button", { name: "Receipt", exact: true }).first());
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(`${pupils.aisha.first} ${pupils.aisha.last}`);
      await walk.click(dialog.getByRole("button", { name: "Close dialog" }));
      await expect(dialog).toBeHidden();
    },
  );

  await walk.step(
    {
      id: 102,
      chapter,
      role: "Guardian",
      title: "Two children, one sign-in",
      caption:
        "A guardian whose phone number is on two pupils sees both in the list and can switch between them. The list holds only that guardian's children; every section then shows the child chosen.",
      covers: ["POR-08", "POR-11"],
    },
    async () => {
      const chooser = page.getByLabel("Select student to view");
      await expect(chooser.locator("option")).toHaveCount(2);
      await expect(chooser).toContainText(`${pupils.aisha.first} ${pupils.aisha.last}`);
      await expect(chooser).toContainText(`${pupils.hafsa.first} ${pupils.hafsa.last}`);
      const sisterId = await chooser.locator("option", { hasText: pupils.hafsa.first }).getAttribute("value");
      await walk.selectOption(chooser, sisterId ?? "");
      await expect(chooser).toHaveValue(sisterId ?? "");
      // the section stays where it was (Fees and billing) and now shows the sister: she has no invoice yet
      await expect(page.getByText("0 Invoices", { exact: true })).toBeVisible();
      await expect(page.getByText("No fee invoices generated for this student yet.")).toBeVisible();
      await walk.click(section(page, "Overview"));
      await expect(page.getByRole("heading", { name: `${pupils.hafsa.first} ${pupils.hafsa.last}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 103,
      chapter,
      role: "Guardian",
      title: "Practice is a summary for a guardian, never a question",
      caption: "A guardian is told how practice is going. The questions, the setup and the history of answers are the pupil's own.",
      covers: ["POR-22"],
    },
    async () => {
      await walk.click(section(page, "Practice"));
      await expect(page.getByRole("region", { name: "How practice is going" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Practise now" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Start practice" })).toHaveCount(0);
      await portalSignOut(walk, page);
    },
  );

  await walk.step(
    {
      id: 104,
      chapter,
      role: "Superadmin",
      title: "Choose what pupils and guardians may do",
      caption:
        "The superadministrator sets, for one branch at a time, what a pupil and a guardian may open. It applies at once. Here a pupil is given the fees and a guardian loses the results; each change is listed under Recent changes.",
      covers: ["STG-04"],
    },
    async () => {
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.superadmin);
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Portal access", exact: true }));
      await expect(page.getByRole("heading", { name: "Portal access" })).toBeVisible();
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await expect(page.getByText("Nothing has been changed for this branch. The recommended settings apply.")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Pupil: Fees and invoices" })).not.toBeChecked();
      await expect(page.getByRole("checkbox", { name: "Guardian: Academic results and report cards" })).toBeChecked();
      await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
      await walk.click(page.getByRole("checkbox", { name: "Pupil: Fees and invoices" }));
      await walk.click(page.getByRole("checkbox", { name: "Guardian: Academic results and report cards" }));
      await walk.click(page.getByRole("button", { name: "Save changes" }));
      await expect(page.getByText("Saved. It applies to every portal sign-in from now on.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Recent changes" })).toBeVisible();
      await expect(page.getByText("Gave more access")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 105,
      chapter,
      role: "Pupil",
      title: "The pupil now sees the fees; the guardian no longer sees the results",
      caption: "The same sign-ins, a different portal: the setting is applied to every sign-in from the moment it is saved.",
      covers: ["STG-04"],
    },
    async () => {
      await signOut(walk, page);
      await findPortal(walk, page);
      await portalSignIn(walk, page, pupils.yusuf.admissionNo, pupils.yusuf.dobShown);
      await expect(section(page, "Fees & Billing")).toBeVisible();
      await expect(page.getByText("School Fee Balance")).toBeVisible();
      await portalSignOut(walk, page);
      await portalSignIn(walk, page, issued.aisha, pupils.aisha.phoneCorrected);
      await expect(section(page, "Overview")).toBeVisible();
      await expect(section(page, "Academic Results")).toHaveCount(0);
      await expect(section(page, "Fees & Billing")).toBeVisible();
      await portalSignOut(walk, page);
    },
  );

  await walk.step(
    {
      id: 106,
      chapter,
      role: "Superadmin",
      title: "Put the recommended settings back",
      caption:
        "A change that is not saved can be discarded, and the recommended settings can be put back in one press. Saving them lists the change again.",
      covers: ["STG-04"],
    },
    async () => {
      await backToStaffSignIn(walk, page);
      await signIn(walk, page, cast.superadmin);
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await walk.click(page.getByRole("button", { name: "Portal access", exact: true }));
      await walk.selectOption(page.getByLabel("Branch", { exact: true }), school.branches.englishPrimary);
      await expect(page.getByRole("checkbox", { name: "Pupil: Fees and invoices" })).toBeChecked();
      await walk.click(page.getByRole("checkbox", { name: "Pupil: Take quizzes" }));
      await walk.click(page.getByRole("button", { name: "Discard changes" }));
      await expect(page.getByRole("checkbox", { name: "Pupil: Take quizzes" })).toBeChecked();
      await walk.click(page.getByRole("button", { name: "Use the recommended settings" }));
      await expect(page.getByRole("checkbox", { name: "Pupil: Fees and invoices" })).not.toBeChecked();
      await expect(page.getByRole("checkbox", { name: "Guardian: Academic results and report cards" })).toBeChecked();
      await walk.click(page.getByRole("button", { name: "Save changes" }));
      await expect(page.getByText("Saved. It applies to every portal sign-in from now on.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Recent changes" })).toBeVisible();
      await expect(page.locator("li").filter({ has: page.locator("time") })).toHaveCount(2);
    },
  );
}
