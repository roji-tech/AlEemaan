import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, cast, results as r, school, users as u } from "../cast";
import { mainNav, openPage, signIn, signOut } from "./shared";

// C16 Users (task 0033, section 6.15): the people the superadmin invited in C03, now that they have joined. The superadmin moves the non-teaching staff member to another branch and back,
// lets a teacher approve results and a teacher and the staff member read form results (each confirmed with the superadmin's own password: nothing is asked and nothing changes
// with a wrong one), filters by that access, deactivates the staff member (who is then refused at sign-in), reactivates them (who then signs in again), makes a branch administrator a
// superadmin and takes it away again, and suspends, terminates and reinstates the teacher, whose history lists each step. The grants are then taken back. The branch administrator sees
// only their own branch's people, no superadmin control, no Terminate and no sign of the superadmin in the list, and suspends and lifts the teacher. A teacher and a member of the non-teaching staff
// are shown no Users entry, and a typed address says the page is for administrators.

const chapter = "C16 Users";

const rowOf = (page: Page, name: string): Locator => page.getByRole("listitem").filter({ hasText: name });
const editDialog = (page: Page, name: string) => page.getByRole("dialog", { name: `Change access for ${name}` });

/// Opens Users from the sidebar, as every administrator does.
async function openUsers(walk: Walk, page: Page): Promise<void> {
  await openPage(walk, page, "Users");
}

/// Opens the dialog that changes a member's access, from the row's Edit button.
export async function openEdit(walk: Walk, page: Page, name: string): Promise<Locator> {
  await walk.click(page.getByRole("button", { name: `Change role or branch for ${name}` }));
  const dialog = editDialog(page, name);
  await expect(dialog).toBeVisible();
  return dialog;
}

/// Saves the open edit dialog and reads that it closed.
export async function saveEdit(walk: Walk, dialog: Locator): Promise<void> {
  await walk.click(dialog.getByRole("button", { name: "Save changes" }));
  await expect(dialog).toBeHidden();
}

export async function c16Users(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 147,
      chapter,
      role: "Superadmin",
      title: "Move a member to another branch, and back",
      caption:
        "Edit changes a member's role or branch, and takes effect on their next request. The list shows the new branch at once, and a note says who now holds which role where. Moving them back is the same dialog.",
      covers: ["USR-04"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openUsers(walk, page);
      await expect(rowOf(page, cast.staff.name)).toContainText(school.branches.englishPrimary);
      const toArabic = await openEdit(walk, page, cast.staff.name);
      await walk.selectOption(toArabic.getByLabel("Branch"), school.branches.arabicPrimary);
      await saveEdit(walk, toArabic);
      await expect(
        page.getByText(`Saved. ${cast.staff.name} is now Non-teaching staff at ${school.branches.arabicPrimary}.`),
      ).toBeVisible();
      await expect(rowOf(page, cast.staff.name)).toContainText(school.branches.arabicPrimary);
      const back = await openEdit(walk, page, cast.staff.name);
      await walk.selectOption(back.getByLabel("Branch"), school.branches.englishPrimary);
      await saveEdit(walk, back);
      await expect(
        page.getByText(`Saved. ${cast.staff.name} is now Non-teaching staff at ${school.branches.englishPrimary}.`),
      ).toBeVisible();
      await expect(rowOf(page, cast.staff.name)).toContainText(school.branches.englishPrimary);
    },
  );

  await walk.step(
    {
      id: 148,
      chapter,
      role: "Superadmin",
      title: "A password is needed to let a teacher approve results, and a wrong one changes nothing",
      caption:
        "Who may approve results is a school-wide decision, so only a superadmin can make it, and the dialog asks for the superadmin's own password first. Without it nothing is sent; with a wrong one the dialog says so, stays open, and the list does not change.",
      covers: ["USR-05", "USR-10"],
    },
    async () => {
      const dialog = await openEdit(walk, page, cast.teacher.name);
      await expect(dialog.getByLabel("Your password", { exact: true })).toHaveCount(0);
      await walk.click(dialog.getByRole("checkbox", { name: "May approve results" }));
      await expect(dialog.getByLabel("Your password", { exact: true })).toBeVisible();
      await walk.click(dialog.getByRole("button", { name: "Save changes" }));
      await expect(dialog.getByText("Enter your password to confirm.")).toBeVisible();
      await walk.type(dialog.getByLabel("Your password", { exact: true }), u.wrongPassword);
      await walk.click(dialog.getByRole("button", { name: "Save changes" }));
      await expect(dialog.getByText("That password isn't right.")).toBeVisible();
      await expect(rowOf(page, cast.teacher.name)).not.toContainText("Approves results");
    },
  );

  await walk.step(
    {
      id: 149,
      chapter,
      role: "Superadmin",
      title: "Let a teacher approve results, confirmed with the right password",
      caption:
        "With the right password the change is saved, the dialog closes, a note says who now holds which role where, and the row gets an Approves results tag.",
      covers: ["USR-05"],
    },
    async () => {
      const dialog = editDialog(page, cast.teacher.name);
      await expect(dialog).toBeVisible();
      await walk.type(dialog.getByLabel("Your password", { exact: true }), PASSWORD);
      await saveEdit(walk, dialog);
      await expect(page.getByText(`Saved. ${cast.teacher.name} is now Teaching staff at ${school.branches.englishPrimary}.`)).toBeVisible();
      await expect(rowOf(page, cast.teacher.name)).toContainText("Approves results");
    },
  );

  await walk.step(
    {
      id: 150,
      chapter,
      role: "Superadmin",
      title: "Let a teacher and a member of the non-teaching staff read form results",
      caption:
        "Reading the results of a branch's forms is a smaller grant: any administrator of the branch can give it, to teaching or non-teaching staff, and it is read only. It is confirmed with a password too, and the row gets a Reads form results tag.",
      covers: ["USR-06"],
    },
    async () => {
      for (const person of [cast.teacher, cast.staff]) {
        const dialog = await openEdit(walk, page, person.name);
        await walk.click(dialog.getByRole("checkbox", { name: "May read form results" }));
        await walk.type(dialog.getByLabel("Your password", { exact: true }), PASSWORD);
        await saveEdit(walk, dialog);
        await expect(rowOf(page, person.name)).toContainText("Reads form results");
      }
    },
  );

  await walk.step(
    {
      id: 151,
      chapter,
      role: "Superadmin",
      title: "Filter the list by who reads form results",
      caption:
        "The Access filter lists only the people who hold that grant, each with its tag, and the count under it says how many match. A search that finds no one says so and offers Clear filters, which resets the search, every filter and the page.",
      covers: ["USR-07"],
    },
    async () => {
      await walk.selectOption(page.getByLabel("Access"), "Reads form results");
      await expect(page.getByText("2 people match")).toBeVisible();
      await expect(rowOf(page, cast.teacher.name)).toContainText("Reads form results");
      await expect(rowOf(page, cast.staff.name)).toContainText("Reads form results");
      await expect(rowOf(page, cast.branchAdmin.name)).toHaveCount(0);
      await walk.type(page.getByLabel("Search"), u.nobody);
      await expect(page.getByText("No one matches these filters.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Clear filters" }));
      await expect(page.getByLabel("Access")).toHaveValue("");
      await expect(page.getByLabel("Search")).toHaveValue("");
      await expect(rowOf(page, cast.branchAdmin.name)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 152,
      chapter,
      role: "Superadmin",
      title: "Deactivate a member",
      caption:
        "Deactivating asks first, and says what it does and does not do: access ends, nothing they did is deleted, and it can be undone. A member with only this branch is signed out. The list stops showing them until the Status filter is turned to Deactivated.",
      covers: ["USR-08"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Deactivate ${cast.staff.name}` }));
      const dialog = page.getByRole("dialog", { name: `Deactivate ${cast.staff.name}?` });
      await expect(dialog).toContainText("Nothing they did is deleted");
      await walk.click(dialog.getByRole("button", { name: "Deactivate", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${cast.staff.name} was deactivated. They are signed out and lose access.`)).toBeVisible();
      await expect(rowOf(page, cast.staff.name)).toHaveCount(0);
      await walk.selectOption(page.getByLabel("Status"), "Deactivated");
      await expect(rowOf(page, cast.staff.name)).toContainText("Deactivated");
      await expect(page.getByRole("button", { name: `Reactivate ${cast.staff.name}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 153,
      chapter,
      role: "Non-teaching staff",
      title: "A deactivated member keeps their login but belongs to no branch",
      caption:
        "Deactivating takes away the member's branches, not the account: the same email and password still sign in, and the overview says the person is not a member of any branch and has no role. The sidebar offers only the overview and the announcements, and the announcements page, which it still offers, is refused by the server in words and lists nothing.",
      covers: ["USR-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await expect(page.getByText("You're signed in, but you aren't a member of any branch yet.")).toBeVisible();
      await expect(page.getByText("Ask your school administrator to add you to a branch.")).toBeVisible();
      await expect(page.getByText("No role yet").first()).toBeVisible();
      await expect(mainNav(page).getByRole("link")).toHaveCount(2);
      await openPage(walk, page, "Announcements", "Announcements & Broadcasts");
      await expect(page.getByText("You don't have permission to do that")).toBeVisible();
      await expect(page.getByText("No announcements found")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 154,
      chapter,
      role: "Superadmin",
      title: "Reactivate the member",
      caption: "Reactivate gives access back with the same role and branch, and says so.",
      covers: ["USR-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openUsers(walk, page);
      await walk.selectOption(page.getByLabel("Status"), "Deactivated");
      await walk.click(page.getByRole("button", { name: `Reactivate ${cast.staff.name}` }));
      await expect(page.getByText(`${cast.staff.name} can sign in again.`)).toBeVisible();
      await expect(rowOf(page, cast.staff.name)).toHaveCount(0);
      await walk.selectOption(page.getByLabel("Status"), "Active");
      await expect(rowOf(page, cast.staff.name)).toContainText("Active");
    },
  );

  await walk.step(
    {
      id: 155,
      chapter,
      role: "Non-teaching staff",
      title: "The reactivated member signs in again",
      caption: "The same email and password work again, and the member is back on their own overview.",
      covers: ["USR-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await expect(mainNav(page).getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 156,
      chapter,
      role: "Superadmin",
      title: "Making a branch administrator a superadmin needs a password, and a wrong one changes nothing",
      caption:
        "Superadmin is school-wide authority, so the dialog says what it gives and asks for the superadmin's own password. A wrong password changes nothing and is told so, in the dialog, which stays open.",
      covers: ["USR-09", "USR-10"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openUsers(walk, page);
      await walk.click(page.getByRole("button", { name: `Make superadmin ${cast.branchAdmin.name}` }));
      const dialog = page.getByRole("dialog", { name: `Make ${cast.branchAdmin.name} a superadmin?` });
      await expect(dialog).toContainText("A superadmin can manage every branch");
      await walk.type(dialog.getByLabel("Your password", { exact: true }), u.wrongPassword);
      await walk.click(dialog.getByRole("button", { name: "Make superadmin" }));
      await expect(dialog.getByText("Your password is incorrect.")).toBeVisible();
      await expect(rowOf(page, cast.branchAdmin.name)).not.toContainText("Superadmin");
    },
  );

  await walk.step(
    {
      id: 157,
      chapter,
      role: "Superadmin",
      title: "Make a branch administrator a superadmin, and take it away again",
      caption: "With the right password the row gets the Superadmin tag, and the same dialog, with the password again, takes it away.",
      covers: ["USR-09"],
    },
    async () => {
      const dialog = page.getByRole("dialog", { name: `Make ${cast.branchAdmin.name} a superadmin?` });
      await walk.type(dialog.getByLabel("Your password", { exact: true }), PASSWORD);
      await walk.click(dialog.getByRole("button", { name: "Make superadmin" }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${cast.branchAdmin.name} is now a superadmin.`)).toBeVisible();
      await expect(rowOf(page, cast.branchAdmin.name)).toContainText("Superadmin");
      await walk.click(page.getByRole("button", { name: `Remove superadmin from ${cast.branchAdmin.name}` }));
      const removal = page.getByRole("dialog", { name: `Remove superadmin from ${cast.branchAdmin.name}?` });
      await walk.type(removal.getByLabel("Your password", { exact: true }), PASSWORD);
      await walk.click(removal.getByRole("button", { name: "Remove superadmin" }));
      await expect(removal).toBeHidden();
      await expect(page.getByText(`${cast.branchAdmin.name} is no longer a superadmin.`)).toBeVisible();
      await expect(rowOf(page, cast.branchAdmin.name)).not.toContainText("Superadmin");
    },
  );

  await walk.step(
    {
      id: 158,
      chapter,
      role: "Superadmin",
      title: "Suspend a teacher, with a reason and a last day",
      caption:
        "Suspending needs a reason of at least three characters, which is kept in the history, and may have a last day; a superadmin can also suspend everywhere in the school. A suspended person is signed out, the row says Suspended until that day, and offers Lift suspension and Terminate but no Reactivate.",
      covers: ["STD-06"],
    },
    async () => {
      await walk.selectOption(page.getByLabel("Status"), "Everyone");
      await walk.click(page.getByRole("button", { name: `Suspend ${cast.teacher.name}` }));
      const dialog = page.getByRole("dialog", { name: `Suspend ${cast.teacher.name}?` });
      await expect(dialog).toContainText("will lose access to this branch straight away");
      await expect(dialog.getByRole("checkbox", { name: /Everywhere in the school/ })).toBeVisible();
      await walk.type(dialog.getByLabel("Why are you suspending them?"), u.tooShortReason);
      await walk.click(dialog.getByRole("button", { name: "Suspend", exact: true }));
      await expect(dialog.getByText("Say why (at least 3 characters).")).toBeVisible();
      await walk.type(dialog.getByLabel("Why are you suspending them?"), u.suspendReason);
      await walk.type(dialog.getByLabel("Last day of the suspension"), u.lastDayTyped);
      await walk.click(dialog.getByRole("button", { name: "Suspend", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${cast.teacher.name} is suspended.`)).toBeVisible();
      const row = rowOf(page, cast.teacher.name);
      await expect(row).toContainText("Suspended");
      await expect(row).toContainText(u.lastDayShown);
      await expect(row.getByRole("button", { name: `Lift suspension ${cast.teacher.name}` })).toBeVisible();
      await expect(row.getByRole("button", { name: `Terminate ${cast.teacher.name}` })).toBeVisible();
      await expect(row.getByRole("button", { name: `Reactivate ${cast.teacher.name}` })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 159,
      chapter,
      role: "Superadmin",
      title: "Terminate the teacher, read the history, and reinstate them",
      caption:
        "Terminating archives the staff record and can only be undone by a superadmin, with a reason. The row says Terminated and offers Reinstate, never Reactivate. History lists every change, newest first, with the reason, the day and who decided; nothing in it can be edited. Reinstating gives back access with the same role and restores the record.",
      covers: ["STD-06"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Terminate ${cast.teacher.name}` }));
      const dialog = page.getByRole("dialog", { name: `Terminate ${cast.teacher.name}?` });
      await expect(dialog).toContainText("their staff record is archived");
      await walk.type(dialog.getByLabel("Why are you terminating them?"), u.terminateReason);
      await walk.click(dialog.getByRole("button", { name: "Terminate", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${cast.teacher.name} is terminated.`)).toBeVisible();
      const row = rowOf(page, cast.teacher.name);
      await expect(row).toContainText("Terminated");
      await expect(row.getByRole("button", { name: `Reinstate ${cast.teacher.name}` })).toBeVisible();
      await expect(row.getByRole("button", { name: `Reactivate ${cast.teacher.name}` })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: `Standing history of ${cast.teacher.name}` }));
      const history = page.getByRole("dialog", { name: `History of ${cast.teacher.name}` });
      await expect(history).toContainText("Terminated");
      await expect(history).toContainText(u.terminateReason);
      await expect(history).toContainText("Suspended");
      await expect(history).toContainText(u.suspendReason);
      await expect(history).toContainText(cast.superadmin.name);
      await walk.click(history.getByRole("button", { name: "Close", exact: true }).last());
      await expect(history).toBeHidden();
      await walk.click(page.getByRole("button", { name: `Reinstate ${cast.teacher.name}` }));
      const back = page.getByRole("dialog", { name: `Reinstate ${cast.teacher.name}?` });
      await expect(back).toContainText("their staff record is restored");
      await walk.type(back.getByLabel("Why are you reinstating them?"), u.reinstateReason);
      await walk.click(back.getByRole("button", { name: "Reinstate", exact: true }));
      await expect(back).toBeHidden();
      await expect(page.getByText(`${cast.teacher.name} is reinstated.`)).toBeVisible();
      await expect(rowOf(page, cast.teacher.name)).toContainText("Active");
      await expect(page.getByRole("button", { name: `Change role or branch for ${cast.teacher.name}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 160,
      chapter,
      role: "Superadmin",
      title: "Take the grants back",
      caption:
        "A grant is taken back the same way it was given, with the password. Two boxes changed in one dialog need one confirmation, and the tags leave the rows.",
      covers: ["USR-05", "USR-06"],
    },
    async () => {
      await walk.selectOption(page.getByLabel("Status"), "Active");
      const teacher = await openEdit(walk, page, cast.teacher.name);
      await walk.click(teacher.getByRole("checkbox", { name: "May approve results" }));
      await walk.click(teacher.getByRole("checkbox", { name: "May read form results" }));
      await walk.type(teacher.getByLabel("Your password", { exact: true }), PASSWORD);
      await saveEdit(walk, teacher);
      await expect(rowOf(page, cast.teacher.name)).not.toContainText("Approves results");
      await expect(rowOf(page, cast.teacher.name)).not.toContainText("Reads form results");
      const staff = await openEdit(walk, page, cast.staff.name);
      await walk.click(staff.getByRole("checkbox", { name: "May read form results" }));
      await walk.type(staff.getByLabel("Your password", { exact: true }), PASSWORD);
      await saveEdit(walk, staff);
      await expect(rowOf(page, cast.staff.name)).not.toContainText("Reads form results");
    },
  );

  await walk.step(
    {
      id: 161,
      chapter,
      role: "Branch administrator",
      title: "A branch administrator sees only their own branch and no superadmin control",
      caption:
        "The branch administrator is offered the people of their own branch only: the Branch filter has no other branch, an invitation cannot make an administrator, and there is no Make superadmin button. The superadmin is not in their list at all, and a teacher's row offers Suspend but never Terminate.",
      covers: ["USR-11", "STD-07"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openUsers(walk, page);
      await expect(page.getByLabel("Branch", { exact: true }).locator("option")).toHaveCount(2);
      await expect(page.getByLabel("Branch", { exact: true }).getByRole("option", { name: school.branches.englishPrimary })).toBeAttached();
      await expect(page.getByRole("button", { name: /Make superadmin|Remove superadmin/ })).toHaveCount(0);
      await expect(rowOf(page, cast.branchAdmin.name)).toBeVisible();
      await expect(rowOf(page, cast.superadmin.name)).toHaveCount(0);
      const teacher = rowOf(page, cast.teacher.name);
      await expect(teacher.getByRole("button", { name: `Suspend ${cast.teacher.name}` })).toBeVisible();
      await expect(teacher.getByRole("button", { name: `Terminate ${cast.teacher.name}` })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: "Invite someone" }));
      const invitation = page.getByRole("dialog", { name: "Invite someone" });
      await expect(invitation.getByLabel("Role").getByRole("option", { name: "Administrator" })).toHaveCount(0);
      await walk.click(invitation.getByRole("button", { name: "Cancel" }));
      await expect(invitation).toBeHidden();
    },
  );

  await walk.step(
    {
      id: 162,
      chapter,
      role: "Branch administrator",
      title: "Suspend a teacher and lift it, as a branch administrator",
      caption:
        "A branch administrator can suspend and lift for the teachers of their branch. A suspended teacher has Lift suspension and no Reactivate, and there is still no Terminate: that is for a superadmin.",
      covers: ["STD-07"],
    },
    async () => {
      await walk.selectOption(page.getByLabel("Status"), "Everyone");
      await walk.click(page.getByRole("button", { name: `Suspend ${cast.teacher.name}` }));
      const dialog = page.getByRole("dialog", { name: `Suspend ${cast.teacher.name}?` });
      await expect(dialog.getByRole("checkbox", { name: /Everywhere in the school/ })).toHaveCount(0);
      await walk.type(dialog.getByLabel("Why are you suspending them?"), u.branchAdminSuspendReason);
      await walk.click(dialog.getByRole("button", { name: "Suspend", exact: true }));
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`${cast.teacher.name} is suspended.`)).toBeVisible();
      const row = rowOf(page, cast.teacher.name);
      await expect(row).toContainText("Suspended");
      await expect(row.getByRole("button", { name: `Reactivate ${cast.teacher.name}` })).toHaveCount(0);
      await expect(row.getByRole("button", { name: `Terminate ${cast.teacher.name}` })).toHaveCount(0);
      await walk.click(row.getByRole("button", { name: `Lift suspension ${cast.teacher.name}` }));
      const lifting = page.getByRole("dialog", { name: `Lift suspension ${cast.teacher.name}?` });
      await walk.type(lifting.getByLabel("Why are you lifting it?"), u.branchAdminLiftReason);
      await walk.click(lifting.getByRole("button", { name: "Lift suspension", exact: true }));
      await expect(lifting).toBeHidden();
      await expect(page.getByText(`${cast.teacher.name} is no longer suspended.`)).toBeVisible();
      await expect(rowOf(page, cast.teacher.name)).toContainText("Active");
    },
  );

  await walk.step(
    {
      id: 163,
      chapter,
      role: "Teacher",
      title: "A teacher is not offered Users, and has all they had before",
      caption:
        "The teacher who was suspended, terminated and reinstated signs in with the same email and password and finds their classes and subjects as they were. There is no Users entry, and a typed address says the page is for administrators.",
      covers: ["USR-12"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await expect(mainNav(page).getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
      await openPage(walk, page, "Results");
      await expect(page.getByLabel("Class and subject").getByRole("option", { name: r.pair.maths })).toBeAttached();
      const typed = await walk.typedAddress(`${new URL(page.url()).origin}/users`);
      await expect(typed.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
      await expect(typed.getByRole("alert").filter({ hasText: "Only administrators can view and manage users." })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 164,
      chapter,
      role: "Non-teaching staff",
      title: "A member of the non-teaching staff is not offered Users either",
      caption: "The same sentence is shown to the non-teaching staff, whose sidebar has even fewer entries.",
      covers: ["USR-12"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await expect(mainNav(page).getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
      const typed = await walk.typedAddress(`${new URL(page.url()).origin}/users`);
      await expect(typed.getByRole("alert").filter({ hasText: "Only administrators can view and manage users." })).toBeVisible();
    },
  );

  // the last step ends in its typed-address tab, so that the screenshot shows the sentence; the first tab comes back here, before the next chapter starts
  await walk.closeTypedAddress();
}
