import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { Authenticator } from "../support/totp";
import { account as acc } from "../cast";
import { signOut } from "./shared";
import { inbox, openInbox } from "./c03-people";

// C19 Recovery and two-step sign-in (task 0033, section 6.19): what a person does when they cannot sign in, and how they protect their account. A visitor asks for a password reset link for an address
// that has no account and for the new administrator's, and is told the same sentence both times; the message in the dev inbox gives a link, a new password is chosen, the same link is refused a second
// time, and the person signs in with the new password. They then turn on two-step verification (the setup key is read off the screen and the code is the one an authenticator app would show, computed
// by a stand-in; ten recovery codes are shown once), sign in with a code, sign in again with a recovery code, make new recovery codes, and turn two-step off. The account is the one made in C18.

const chapter = "C19 Recovery and two-step sign-in";
const RECOVERY_ITEM = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;
const first = acc.newcomer.name.split(" ")[0]!;

/// What the person has kept: the authenticator (the phone) and the recovery codes the screen showed.
const kept = { phone: null as Authenticator | null, recoveryCodes: [] as string[] };

async function signInPassword(walk: Walk, page: Page, password: string): Promise<void> {
  await walk.type(page.getByLabel("Email address"), acc.newEmail);
  await walk.type(page.getByLabel("Password", { exact: true }), password);
  await walk.click(page.getByRole("button", { name: "Sign in" }));
}

async function openAccount(walk: Walk, page: Page): Promise<void> {
  await walk.click(page.getByRole("button", { name: /^Account menu for/ }));
  await walk.click(page.getByRole("link", { name: "Profile" }));
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
}

export async function c19Recovery(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 192,
      chapter,
      role: "Visitor",
      title: "Ask for a reset link for an address that has no account",
      caption:
        "On the sign-in page, Forgot password? asks for an email address. For an address with no account the page says exactly what it says for one that has: if an account exists, a link is on its way. Nobody can use it to find out who has an account.",
      covers: ["FRG-02"],
    },
    async () => {
      await signOut(walk, page);
      await walk.click(page.getByRole("link", { name: "Forgot password?" }));
      await expect(page).toHaveURL(/\/forgot-password$/);
      await walk.type(page.getByLabel("Email address"), acc.nobody);
      await walk.click(page.getByRole("button", { name: "Send reset link" }));
      await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
      await expect(page.getByText("If an account exists for")).toContainText(acc.nobody);
    },
  );

  await walk.step(
    {
      id: 193,
      chapter,
      role: "Visitor",
      title: "Ask for a reset link for an address that has an account",
      caption: "The same screen, the same sentence, and this time a message is in the person's inbox.",
      covers: ["FRG-01"],
    },
    async () => {
      await page.goBack();
      await expect(page).toHaveURL(/\/login$/);
      await walk.click(page.getByRole("link", { name: "Forgot password?" }));
      await walk.type(page.getByLabel("Email address"), acc.newEmail);
      await walk.click(page.getByRole("button", { name: "Send reset link" }));
      await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
      await expect(page.getByText("If an account exists for")).toContainText(acc.newEmail);
    },
  );

  await walk.step(
    {
      id: 194,
      chapter,
      role: "Visitor",
      title: "Choose a new password from the emailed link",
      caption:
        "The link in the message opens a page that asks for the new password twice, with the secret taken out of the address bar. The change signs the person out everywhere, and the new password signs in.",
      covers: ["RST-01"],
    },
    async () => {
      await openInbox(walk, page);
      await walk.click(inbox(page).getByRole("button", { name: new RegExp(`${acc.newEmail}.*[Rr]eset`) }));
      await walk.click(inbox(page).getByRole("link", { name: /\/reset-password#token=/ }));
      await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
      await walk.type(page.getByLabel("New password", { exact: true }), acc.resetPassword);
      await walk.type(page.getByLabel("Confirm new password"), acc.resetPassword);
      await walk.click(page.getByRole("button", { name: "Set new password" }));
      await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Continue to sign in" }));
      await expect(page).toHaveURL(/\/login$/);
      await signInPassword(walk, page, acc.resetPassword);
      await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${first}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 195,
      chapter,
      role: "Visitor",
      title: "The same reset link cannot be used twice",
      caption:
        "Opening the same link again and choosing a password is refused, in a sentence that does not say whether the link was used or had expired, with a way to ask for a new one.",
      covers: ["RST-02"],
    },
    async () => {
      await signOut(walk, page);
      await openInbox(walk, page);
      await walk.click(inbox(page).getByRole("button", { name: new RegExp(`${acc.newEmail}.*[Rr]eset`) }));
      await walk.click(inbox(page).getByRole("link", { name: /\/reset-password#token=/ }));
      await walk.type(page.getByLabel("New password", { exact: true }), acc.newPassword);
      await walk.type(page.getByLabel("Confirm new password"), acc.newPassword);
      await walk.click(page.getByRole("button", { name: "Set new password" }));
      await expect(page.getByRole("heading", { name: "This link can't be used" })).toBeVisible();
      await expect(page.getByText(/invalid or has expired/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 196,
      chapter,
      role: "Branch administrator",
      title: "Turn on two-step verification: the key, the code, the recovery codes",
      caption:
        "The password is asked for first. The setup key is shown, as a picture to scan and as text to type into the authenticator app; the app shows a six-digit code, which is typed in to prove it is set up. Ten recovery codes are shown once.",
      covers: ["ACC-04"],
    },
    async () => {
      await page.goBack();
      await signInPassword(walk, page, acc.resetPassword);
      await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${first}` })).toBeVisible();
      await openAccount(walk, page);
      await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
      await expect(page.getByText("Off", { exact: true })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Set up two-step verification" }));
      await walk.type(page.getByLabel("Password", { exact: true }), acc.resetPassword);
      await walk.click(page.getByRole("button", { name: "Continue" }));
      await expect(page.getByRole("heading", { name: "Set up your authenticator app" })).toBeVisible();
      await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
      const key = ((await page.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{4}){7}$/).textContent()) ?? "").trim();
      kept.phone = new Authenticator(key);
      await walk.type(page.getByLabel("Authentication code"), await kept.phone.nextCode());
      await walk.click(page.getByRole("button", { name: "Turn on" }));
      await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Two-step verification is on" })).toBeVisible();
      kept.recoveryCodes = await page.getByRole("listitem").filter({ hasText: RECOVERY_ITEM }).allTextContents();
      expect(kept.recoveryCodes).toHaveLength(10);
      await expect(page.getByRole("button", { name: "Done" })).toBeDisabled();
    },
  );

  await walk.step(
    {
      id: 197,
      chapter,
      role: "Branch administrator",
      title: "Say the recovery codes are saved",
      caption:
        "The person cannot leave the codes until they say they have saved them, because they are shown only once. After that the page says how many are left.",
      covers: ["ACC-04"],
    },
    async () => {
      await walk.click(page.getByLabel("I have saved my recovery codes"));
      await walk.click(page.getByRole("button", { name: "Done" }));
      await expect(page.getByText("10 of 10")).toBeVisible();
      await expect(page.getByText("On", { exact: true })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 198,
      chapter,
      role: "Branch administrator",
      title: "Sign in with the password and then a code from the authenticator",
      caption:
        "After the password the page asks for the six-digit code. A code that was already used is not accepted again, so the person waits for the app to show the next one.",
      covers: ["LOG-03"],
    },
    async () => {
      await signOut(walk, page);
      await signInPassword(walk, page, acc.resetPassword);
      await expect(page.getByRole("heading", { level: 1, name: "Two-step verification" })).toBeVisible();
      await walk.type(page.getByLabel("Authentication code"), await kept.phone!.nextCode());
      await walk.click(page.getByRole("button", { name: "Verify", exact: true }));
      await expect(page).toHaveURL(/\/dashboard$/);
    },
  );

  await walk.step(
    {
      id: 199,
      chapter,
      role: "Branch administrator",
      title: "Sign in with a recovery code when the phone is lost",
      caption: "Use a recovery code instead takes one of the ten codes. A recovery code works once.",
      covers: ["LOG-03"],
    },
    async () => {
      await signOut(walk, page);
      await signInPassword(walk, page, acc.resetPassword);
      await expect(page.getByRole("heading", { level: 1, name: "Two-step verification" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Use a recovery code instead" }));
      await walk.type(page.getByLabel("Recovery code"), kept.recoveryCodes[0]!);
      await walk.click(page.getByRole("button", { name: "Verify", exact: true }));
      await expect(page).toHaveURL(/\/dashboard$/);
    },
  );

  await walk.step(
    {
      id: 200,
      chapter,
      role: "Branch administrator",
      title: "Make new recovery codes",
      caption: "Generating new codes needs a code from the app, shows ten fresh ones once, and says the old ones no longer work.",
      covers: ["ACC-05"],
    },
    async () => {
      await openAccount(walk, page);
      await walk.click(page.getByRole("button", { name: "Generate new recovery codes" }));
      await walk.type(page.getByLabel("Authentication code"), await kept.phone!.nextCode());
      await walk.click(page.getByRole("button", { name: "Generate new codes" }));
      await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "old ones no longer work" })).toBeVisible();
      await walk.click(page.getByLabel("I have saved my recovery codes"));
      await walk.click(page.getByRole("button", { name: "Done" }));
      await expect(page.getByText("10 of 10")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 201,
      chapter,
      role: "Branch administrator",
      title: "Turn two-step verification off",
      caption:
        "Turning it off needs the password and a code, so that someone at an unlocked screen cannot do it. The page then offers to set it up again.",
      covers: ["ACC-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Turn off two-step verification" }));
      await walk.type(page.getByLabel("Password", { exact: true }), acc.resetPassword);
      await walk.type(page.getByLabel("Authentication code"), await kept.phone!.nextCode());
      await walk.click(page.getByRole("button", { name: "Turn off", exact: true }));
      await expect(page.getByRole("status").filter({ hasText: "Two-step verification is off" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Set up two-step verification" })).toBeVisible();
    },
  );
}
