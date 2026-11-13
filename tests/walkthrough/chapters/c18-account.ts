import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, account as acc, cast, school, users as u } from "../cast";
import { openPage, signIn, signOut } from "./shared";
import { accept, followInvitation, inbox, invite, openInbox } from "./c03-people";

// C18 Account (task 0033, section 6.18): what a person does about their own account. A new administrator is invited for it, so that nothing of the school's real people has to be put back: the
// invitation is opened while the branch administrator is signed in (the page says it is for a different account and offers Sign out), the new administrator accepts it, reads "Your access", edits
// their name (an empty one is explained), is refused when the current password typed to change the password is wrong, changes it, reads the list of devices (only this one), asks to change the
// email address, confirms the new address from the link in the dev inbox, and signs in again with the new address and the new password. A teacher and a member of the non-teaching staff read
// their own "Your access".

const chapter = "C18 Account";
const newcomer = acc.newcomer;

/// Opens the account page from the account menu, as a person does.
async function openAccount(walk: Walk, page: Page): Promise<void> {
  await walk.click(page.getByRole("button", { name: /^Account menu for/ }));
  await walk.click(page.getByRole("link", { name: "Profile" }));
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
}

/// Signs in with an address and a password of one's own, and reads the welcome.
async function signInAs(walk: Walk, page: Page, email: string, password: string, first: string): Promise<void> {
  await walk.type(page.getByLabel("Email address"), email);
  await walk.type(page.getByLabel("Password", { exact: true }), password);
  await walk.click(page.getByRole("button", { name: "Sign in" }));
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${first}` })).toBeVisible();
}

export async function c18Account(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 181,
      chapter,
      role: "Superadmin",
      title: "Invite a new administrator for the account steps",
      caption:
        "A new person is invited, so that what the next steps change belongs to them and nothing of the school's real people has to be put back.",
      covers: ["USR-02"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.superadmin);
      await openPage(walk, page, "Users");
      await invite(walk, page, newcomer.email, "Administrator", school.branches.englishPrimary);
    },
  );

  await walk.step(
    {
      id: 182,
      chapter,
      role: "Branch administrator",
      title: "An invitation opened while another person is signed in asks whether to sign out",
      caption:
        "The link in an invitation is for one address. Opened while another person is signed in, the page says it is for a different account and offers Sign out, instead of joining the wrong person to the school.",
      covers: ["INV-03"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.branchAdmin);
      await openInbox(walk, page);
      await followInvitation(walk, page, newcomer.email);
      await expect(page.getByRole("heading", { level: 1, name: "This invitation is for a different account" })).toBeVisible();
      await expect(page.getByText(/^You're signed in as someone \w+\. Sign out, then open the link in your email again\.$/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 183,
      chapter,
      role: "Branch administrator",
      title: "Sign out, and accept the invitation",
      caption:
        "After signing out, the same link in the email shows the role and the branch, and the new administrator chooses a name and a password.",
      covers: ["INV-01"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Sign out" }));
      await expect(page).toHaveURL(/\/login$/);
      await accept(walk, page, newcomer, "Administrator");
    },
  );

  await walk.step(
    {
      id: 184,
      chapter,
      role: "Branch administrator",
      title: "Read what the account page says about the person's access",
      caption:
        "Your access lists each branch the person belongs to and the role they hold in it. It says what the account is allowed to do, and nothing about what others have.",
      covers: ["ACC-07"],
    },
    async () => {
      await signInAs(walk, page, newcomer.email, PASSWORD, newcomer.name.split(" ")[0]);
      await openAccount(walk, page);
      await expect(page.getByRole("heading", { name: "Your access" })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: school.branches.englishPrimary })).toContainText("Administrator");
      await expect(page.getByTestId("profile-name")).toHaveText(newcomer.name);
    },
  );

  await walk.step(
    {
      id: 185,
      chapter,
      role: "Branch administrator",
      title: "Edit your name; an empty one is explained",
      caption:
        "The name is edited in place. Save with nothing in the field says what is wrong, beside the field, and sends nothing; with a name it says Name updated, and the account menu shows it at once.",
      covers: ["ACC-01"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: /^Edit name/ }));
      await walk.type(page.getByLabel("Name", { exact: true }), "   ");
      await walk.click(page.getByRole("button", { name: "Save" }));
      await expect(page.getByText("Enter your name.")).toBeVisible();
      await walk.type(page.getByLabel("Name", { exact: true }), acc.editedName);
      await walk.click(page.getByRole("button", { name: "Save" }));
      await expect(page.getByRole("status").filter({ hasText: "Name updated." })).toBeVisible();
      await expect(page.getByTestId("profile-name")).toHaveText(acc.editedName);
      await expect(page.getByRole("button", { name: `Account menu for ${acc.editedName}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 186,
      chapter,
      role: "Branch administrator",
      title: "A wrong current password is refused with a sentence",
      caption: "Changing the password asks for the current one. A wrong one is refused in words, at the field, and nothing changes.",
      covers: ["ACC-08"],
    },
    async () => {
      await walk.type(page.getByLabel("Current password", { exact: true }), u.wrongPassword);
      await walk.type(page.getByLabel("New password", { exact: true }), acc.newPassword);
      await walk.type(page.getByLabel("Confirm new password"), acc.newPassword);
      await walk.click(page.getByRole("button", { name: "Change password" }));
      await expect(page.getByText("Your current password is incorrect.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 187,
      chapter,
      role: "Branch administrator",
      title: "Change the password",
      caption: "With the right current password the change is made, and every other device is signed out.",
      covers: ["ACC-02"],
    },
    async () => {
      await walk.type(page.getByLabel("Current password", { exact: true }), PASSWORD);
      await walk.click(page.getByRole("button", { name: "Change password" }));
      await expect(page.getByText("Password changed. You've been signed out of your other devices.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 188,
      chapter,
      role: "Branch administrator",
      title: "See the devices that are signed in",
      caption:
        "The list shows each device by browser and system, this one first and marked. With only this one signed in it says so. (Signing another device out needs a second browser, which one recording does not have; the API and browser tests of the account cover it.)",
      covers: ["ACC-06"],
    },
    async () => {
      const devices = page.getByRole("list", { name: "Signed-in devices" });
      await expect(devices.getByTestId("session-row")).toHaveCount(1);
      await expect(devices.getByTestId("session-row").first()).toContainText("This device");
      await expect(page.getByText(/^You're not signed in anywhere \w+\.$/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out of all other devices" })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 189,
      chapter,
      role: "Branch administrator",
      title: "Ask to change the email address",
      caption:
        "The new address and the password are asked for, and a confirmation link is sent to the NEW address; the old one is told. Nothing changes until the link is used, and the page says to check the inbox.",
      covers: ["ACC-03"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Change email address" }));
      await walk.type(page.getByLabel("New email address"), acc.newEmail);
      await walk.type(page.getByLabel("Your password"), acc.newPassword);
      await walk.click(page.getByRole("button", { name: "Send confirmation link" }));
      await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
      await expect(page.getByText(acc.newEmail)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 190,
      chapter,
      role: "Branch administrator",
      title: "Confirm the new address from the link, and sign in with it",
      caption:
        "The link opens a page that asks for one more press, so that an email scanner cannot confirm it. Confirming changes the address and signs the person out everywhere; the new address and the same password sign in, and the old address no longer does.",
      covers: ["CNF-01"],
    },
    async () => {
      await openInbox(walk, page);
      await walk.click(inbox(page).getByRole("button", { name: new RegExp(acc.newEmail) }));
      await walk.click(inbox(page).getByRole("link", { name: /\/confirm-email#token=/ }));
      await expect(page.getByRole("heading", { name: "Confirm your new email address" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Confirm email address" }));
      await expect(page.getByRole("heading", { name: "Email address changed" })).toBeVisible();
      await walk.click(page.getByRole("link", { name: "Continue to sign in" }));
      await expect(page).toHaveURL(/\/login$/);
      await signInAs(walk, page, acc.newEmail, acc.newPassword, newcomer.name.split(" ")[0]);
    },
  );

  await walk.step(
    {
      id: 191,
      chapter,
      role: "Teacher",
      title: "A teacher and a member of the non-teaching staff read their own access",
      caption: "Each reads the branch and the role they hold, on the same page, with no way to read another person's.",
      covers: ["ACC-07"],
    },
    async () => {
      for (const [person, role] of [
        [cast.teacher, "Teaching staff"],
        [cast.staff, "Non-teaching staff"],
      ] as const) {
        await signOut(walk, page);
        await signIn(walk, page, person);
        await openAccount(walk, page);
        await expect(page.getByRole("listitem").filter({ hasText: school.branches.englishPrimary })).toContainText(role);
        await expect(page.getByTestId("profile-name")).toHaveText(person.name);
      }
    },
  );
}
