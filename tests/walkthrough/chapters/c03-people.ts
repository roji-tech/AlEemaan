import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, cast, devToolsToken, school } from "../cast";
import { mainNav, signIn, signOut } from "./shared";

// C03 People (task 0033, section 6.6), first part: the superadministrator opens Users, invites a branch administrator, a teacher and a member of the non-teaching staff, invites one
// address that was mistyped and revokes it. The people accept in the second part (through the dev inbox), then the chapter signs in as each of them.

const chapter = "C03 People";

const pendingFor = (page: Page, email: string) => page.getByRole("button", { name: `Revoke the invitation to ${email}` });

export async function invite(walk: Walk, page: Page, email: string, role: string, branch: string): Promise<void> {
  await walk.click(page.getByRole("button", { name: "Invite someone" }));
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await walk.type(dialog.getByLabel("Email address"), email);
  await walk.selectOption(dialog.getByLabel("Role"), role);
  await walk.selectOption(dialog.getByLabel("Branch"), branch);
  await walk.click(dialog.getByRole("button", { name: "Send invitation" }));
  await expect(page.getByText(`Invitation sent to ${email}. The link works for 7 days.`)).toBeVisible();
  await expect(pendingFor(page, email)).toBeVisible();
}

export async function c03PeopleInvite(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 18,
      chapter,
      role: "Superadmin",
      title: "Open Users",
      caption: "Users lists the people with a role in the school, with filters, and the invitations that are still open.",
      covers: ["USR-01"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Users" }));
      await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "People" })).toBeVisible();
      await expect(page.getByLabel("People").getByText(cast.superadmin.email)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 19,
      chapter,
      role: "Superadmin",
      title: "Invite a branch administrator",
      caption: "An invitation is an email address, a role and a branch. Only a superadministrator can invite an administrator.",
      covers: ["USR-02"],
    },
    async () => {
      await invite(walk, page, cast.branchAdmin.email, "Administrator", school.branches.englishPrimary);
    },
  );

  await walk.step(
    {
      id: 20,
      chapter,
      role: "Superadmin",
      title: "Invite a teacher",
      caption: "A teacher belongs to one branch.",
      covers: ["USR-02"],
    },
    async () => {
      await invite(walk, page, cast.teacher.email, "Teaching staff", school.branches.englishPrimary);
    },
  );

  await walk.step(
    {
      id: 21,
      chapter,
      role: "Superadmin",
      title: "Invite a member of the non-teaching staff",
      caption: "Non-teaching staff see only what their work needs.",
      covers: ["USR-02"],
    },
    async () => {
      await invite(walk, page, cast.staff.email, "Non-teaching staff", school.branches.englishPrimary);
    },
  );

  await walk.step(
    {
      id: 22,
      chapter,
      role: "Superadmin",
      title: "Revoke an invitation sent to a mistyped address",
      caption: "Revoke ends an open invitation; its link stops working.",
      covers: ["USR-03"],
    },
    async () => {
      await invite(walk, page, cast.mistyped.email, "Administrator", school.branches.englishPrimary);
      await walk.click(pendingFor(page, cast.mistyped.email));
      await expect(page.getByText(`The invitation to ${cast.mistyped.email} was revoked. Its link no longer works.`)).toBeVisible();
      await expect(pendingFor(page, cast.mistyped.email)).toHaveCount(0);
      await expect(pendingFor(page, cast.branchAdmin.email)).toBeVisible();
    },
  );
}

export const inbox = (page: Page) => page.getByRole("dialog", { name: "Dev email inbox" });

/// Opens the dev inbox from its launcher.
export async function openInbox(walk: Walk, page: Page): Promise<void> {
  await walk.click(page.getByRole("button", { name: /^Dev email inbox/ }).first());
  await expect(inbox(page)).toBeVisible();
}

/// The first time on a tab the inbox asks for the run's token; after that the tab keeps it.
export async function unlockInbox(walk: Walk, page: Page): Promise<void> {
  await walk.type(inbox(page).getByLabel("Dev tools token"), devToolsToken());
  await walk.click(inbox(page).getByRole("button", { name: "Unlock" }));
}

/// Opens the message sent to `email` and follows the link in it, as a person would: a click on the link the inbox shows.
export async function followInvitation(walk: Walk, page: Page, email: string): Promise<void> {
  await walk.click(inbox(page).getByRole("button", { name: new RegExp(`${email}.*invited`) }));
  await expect(inbox(page).getByText(`To ${email}`)).toBeVisible();
  await walk.click(inbox(page).getByRole("link", { name: /\/accept-invite#token=/ }));
}

export async function accept(walk: Walk, page: Page, person: { name: string; email: string }, roleText: string): Promise<void> {
  await openInbox(walk, page);
  await followInvitation(walk, page, person.email);
  await expect(page.getByText(roleText)).toBeVisible();
  await walk.type(page.getByLabel("Your name"), person.name);
  await walk.type(page.getByLabel("Password", { exact: true }), PASSWORD);
  await walk.type(page.getByLabel("Confirm password"), PASSWORD);
  await walk.click(page.getByRole("button", { name: "Create account and join" }));
  await walk.click(page.getByRole("button", { name: "Continue to sign in" }));
  await expect(page).toHaveURL(/\/login$/);
}

export async function c03PeopleAccept(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 23,
      chapter,
      role: "Superadmin",
      title: "Sign out",
      caption: "The invited people open their own invitations, so the superadministrator signs out first.",
      covers: ["LOG-04"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: /^Account menu for/ }));
      await walk.click(page.getByRole("button", { name: "Sign out" }));
      await expect(page).toHaveURL(/\/login$/);
    },
  );

  await walk.step(
    {
      id: 24,
      chapter,
      role: "Visitor",
      title: "Open the dev email inbox",
      caption:
        "Stand-in for a mailbox: the school's emails land in a local inbox, unlocked with this run's token. Nothing is sent outside this machine.",
      covers: ["SHL-06"],
    },
    async () => {
      await openInbox(walk, page);
      await unlockInbox(walk, page);
      await expect(inbox(page).getByRole("button", { name: new RegExp(`${cast.branchAdmin.email}.*invited`) })).toBeVisible();
      await expect(inbox(page).getByRole("button", { name: new RegExp(`${cast.teacher.email}.*invited`) })).toBeVisible();
      await expect(inbox(page).getByRole("button", { name: new RegExp(`${cast.staff.email}.*invited`) })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 25,
      chapter,
      role: "Visitor",
      title: "A revoked invitation's link is refused",
      caption: "The message to the mistyped address is still in the inbox; its link no longer works, and says what to do.",
      covers: ["INV-02"],
    },
    async () => {
      await followInvitation(walk, page, cast.mistyped.email);
      await expect(page.getByText("Ask your school administrator to send a new invitation.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 26,
      chapter,
      role: "Branch administrator",
      title: "Accept the branch administrator's invitation",
      caption: "The link shows the role and the branch, with the address partly hidden; the person chooses a name and a password.",
      covers: ["INV-01"],
    },
    async () => {
      await page.goBack();
      await accept(walk, page, cast.branchAdmin, "Administrator");
    },
  );

  await walk.step(
    {
      id: 27,
      chapter,
      role: "Teacher",
      title: "Accept the teacher's invitation",
      caption: "The same steps for a teacher.",
      covers: ["INV-01"],
    },
    async () => {
      await accept(walk, page, cast.teacher, "Teaching staff");
    },
  );

  await walk.step(
    {
      id: 28,
      chapter,
      role: "Non-teaching staff",
      title: "Accept the non-teaching staff member's invitation",
      caption: "And for a member of the non-teaching staff.",
      covers: ["INV-01"],
    },
    async () => {
      await accept(walk, page, cast.staff, "Non-teaching staff");
    },
  );
}

// Each page a person reaches from the sidebar: the entry's name and the heading of the page it opens.
const PAGE_HEADINGS: Record<string, string> = {
  Academics: "Academics",
  Students: "Students",
  Coursework: "Coursework & LMS",
  Attendance: "Attendance",
  Results: "Results",
  Timetable: "Timetable & Scheduling",
  Programs: "Programs",
  Announcements: "Announcements & Broadcasts",
  Communication: "Communication",
  Finance: "Finance & Fee Invoicing",
  Approvals: "Approvals and rules",
  "Question bank": "Question bank",
  Forms: "Forms",
  Users: "Users",
  Branches: "Branches",
  Settings: "Settings",
};

/// Clicks each of the entries the role may use, in turn, and reads the page it lands on: the right heading and the entry marked as the current page. Then the sidebar has exactly those entries
/// (and Overview), so nothing else is offered.
async function sweep(walk: Walk, page: Page, entries: readonly string[]): Promise<void> {
  for (const entry of entries) {
    await walk.click(mainNav(page).getByRole("link", { name: entry, exact: true }));
    await expect(page.getByRole("heading", { level: 1, name: PAGE_HEADINGS[entry] })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: entry, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await expect(mainNav(page).getByRole("link")).toHaveCount(entries.length + 1);
}

const ADMIN_ENTRIES = [
  "Academics",
  "Students",
  "Coursework",
  "Attendance",
  "Results",
  "Timetable",
  "Programs",
  "Announcements",
  "Communication",
  "Finance",
  "Approvals",
  "Question bank",
  "Forms",
  "Users",
] as const;
const TEACHER_ENTRIES = [
  "Students",
  "Coursework",
  "Attendance",
  "Results",
  "Timetable",
  "Programs",
  "Announcements",
  "Question bank",
  "Forms",
] as const;
const STAFF_ENTRIES = ["Programs", "Announcements", "Forms"] as const;

export async function c03PeopleRoles(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 29,
      chapter,
      role: "Branch administrator",
      title: "Sign in as the branch administrator",
      caption: "The account menu says who is signed in, as what.",
      covers: ["LOG-01", "SHL-07"],
    },
    async () => {
      await signIn(walk, page, cast.branchAdmin);
      await walk.click(page.getByRole("button", { name: /^Account menu for/ }));
      await expect(page.getByText(cast.branchAdmin.email).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Video guide" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 30,
      chapter,
      role: "Branch administrator",
      title: "Visit every page the branch administrator may use",
      caption: "Every sidebar entry opens its page. Branches and Settings are not offered: they belong to the superadministrator.",
      covers: ["SHL-01", "SHL-02"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await sweep(walk, page, ADMIN_ENTRIES);
      await expect(mainNav(page).getByRole("link", { name: "Branches", exact: true })).toHaveCount(0);
      await expect(mainNav(page).getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 31,
      chapter,
      role: "Teacher",
      title: "Sign in as the teacher and visit every page",
      caption: "A teacher sees the classroom and assessment pages and announcements, and nothing of administration.",
      covers: ["LOG-01", "SHL-01", "SHL-02"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await sweep(walk, page, TEACHER_ENTRIES);
      for (const hidden of ["Academics", "Communication", "Finance", "Approvals", "Users", "Branches", "Settings"]) {
        await expect(mainNav(page).getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
      }
    },
  );

  await walk.step(
    {
      id: 32,
      chapter,
      role: "Non-teaching staff",
      title: "Sign in as the non-teaching staff member and visit every page",
      caption: "Non-teaching staff are offered only the few pages their work needs.",
      covers: ["LOG-01", "SHL-01", "SHL-02"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await sweep(walk, page, STAFF_ENTRIES);
      for (const hidden of ["Students", "Results", "Finance", "Users"]) {
        await expect(mainNav(page).getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
      }
    },
  );
}
