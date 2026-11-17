import { portalBaseFromAppUrl, readPortalConfig, type Portal } from "@/lib/portals";
import { brand } from "@/lib/brand";

// Plain-text messages: accessible everywhere, nothing to track or render wrongly.

import { RESET_LINK_MINUTES } from "@/lib/auth/reset-constants";
import { EMAIL_CHANGE_LINK_MINUTES } from "@/lib/auth/email-change";
import { maskEmail } from "@/lib/auth/mask-email";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
/// Where a link for someone of this portal points: the portal's own address when sign-in portals are on (task 0086), the school's address otherwise, and the school's address too when the
/// builder was not told the portal. A link never names a portal the recipient was not given: the wrong one would refuse them. Read from the environment on each call (cheap), so a test can change it.
const base = (portal?: Portal | null) => (portal ? portalBaseFromAppUrl(portal, appUrl(), readPortalConfig().config) : null) ?? appUrl();

/// The token travels in the URL FRAGMENT: browsers never send it to the server, so it is not in access
/// logs and not in a Referer. The reset page reads it and removes it from the address bar.
export function resetLink(token: string, portal?: Portal | null): string {
  return `${base(portal)}/reset-password#token=${token}`;
}

export function resetEmail(to: string, token: string, portal?: Portal | null) {
  return {
    to,
    subject: `Reset your ${brand.name} password`,
    text: [
      `Someone asked to reset the password for your ${brand.name} account.`,
      ``,
      `To choose a new password, open this link within ${RESET_LINK_MINUTES} minutes:`,
      resetLink(token, portal),
      ``,
      `If you didn't ask for this, ignore this message — your password hasn't changed and the link stops working by itself.`,
    ].join("\n"),
  };
}

const SECURITY_ADVICE = `If this wasn't you, change your password straight away and tell your school administrator.`;

export function mfaEnabledEmail(to: string) {
  return {
    to,
    subject: `Two-step verification is on for your ${brand.name} account`,
    text: [
      `Two-step verification was just turned on for your ${brand.name} account, and you were signed out of your other devices.`,
      ``,
      `From now on, signing in needs a code from your authenticator app as well as your password. Keep your recovery codes somewhere safe.`,
      ``,
      SECURITY_ADVICE,
    ].join("\n"),
  };
}

export function mfaDisabledEmail(to: string) {
  return {
    to,
    subject: `Two-step verification was turned off for your ${brand.name} account`,
    text: [
      `Two-step verification was just turned off for your ${brand.name} account, and you were signed out of your other devices.`,
      ``,
      `Signing in now needs only your password. You can turn it back on from your account page.`,
      ``,
      SECURITY_ADVICE,
    ].join("\n"),
  };
}

export function recoveryCodeUsedEmail(to: string, remaining: number) {
  return {
    to,
    subject: `A recovery code was used to sign in to your ${brand.name} account`,
    text: [
      `A recovery code was just used to sign in to your ${brand.name} account. Each code works once; you have ${remaining} left.`,
      ``,
      remaining <= 2
        ? `You are running low. Sign in and generate new recovery codes from your account page.`
        : `If you lost your authenticator, set up a new one from your account page.`,
      ``,
      SECURITY_ADVICE,
    ].join("\n"),
  };
}

export function recoveryCodesReplacedEmail(to: string) {
  return {
    to,
    subject: `New recovery codes were created for your ${brand.name} account`,
    text: [
      `A new set of recovery codes was just created for your ${brand.name} account. The old codes no longer work.`,
      ``,
      SECURITY_ADVICE,
    ].join("\n"),
  };
}

export function passwordChangedEmail(to: string, portal?: Portal | null) {
  return {
    to,
    subject: `Your ${brand.name} password was changed`,
    text: [
      `The password for your ${brand.name} account was just changed, and you were signed out of your other devices.`,
      ``,
      `If this was you, there is nothing to do. If it wasn't, reset your password straight away at ${base(portal)}/forgot-password and tell your school administrator.`,
    ].join("\n"),
  };
}

// --- Change email (plan §0.5.E) ------------------------------------------------------------------------------

/// To the NEW address: following it proves the address is reachable. (Token in the URL fragment, like a reset.)
export function emailChangeConfirmEmail(to: string, token: string, portal?: Portal | null) {
  return {
    to,
    subject: `Confirm your new ${brand.name} email address`,
    text: [
      `Someone asked to use this address for a ${brand.name} account.`,
      ``,
      `To confirm it, open this link within ${EMAIL_CHANGE_LINK_MINUTES} minutes:`,
      `${base(portal)}/confirm-email#token=${token}`,
      ``,
      `Confirming signs the account out of every device, and from then on you sign in with this address.`,
      `If you didn't ask for this, ignore this message — nothing changes and the link stops working by itself.`,
    ].join("\n"),
  };
}

/// To the OLD address when a change is requested: they can stop it by changing their password.
export function emailChangeRequestedNotice(to: string, newEmail: string, portal?: Portal | null) {
  return {
    to,
    subject: `A change of email address was requested on your ${brand.name} account`,
    text: [
      `Someone who is signed in to your ${brand.name} account asked to change its email address to ${maskEmail(newEmail)}.`,
      ``,
      `Nothing changes until the link sent to that address is opened. This address keeps working until then.`,
      ``,
      `If this wasn't you, change your password straight away at ${base(portal)}/forgot-password and tell your school administrator.`,
    ].join("\n"),
  };
}

/// To the OLD address once it has happened.
export function emailChangedNotice(to: string, newEmail: string) {
  return {
    to,
    subject: `The email address on your ${brand.name} account was changed`,
    text: [
      `The email address on your ${brand.name} account was just changed to ${maskEmail(newEmail)}, and the account was signed out of every device.`,
      ``,
      `This address no longer signs in. If this wasn't you, contact your school administrator straight away.`,
    ].join("\n"),
  };
}

/// To an address that ALREADY has an account, when someone asks to use it for another account. (It is sent instead
/// of the confirmation link; the requester is told the same thing whether or not this happened.)
export function emailChangeTakenNotice(to: string, portal?: Portal | null) {
  return {
    to,
    subject: `Someone tried to use your email address on ${brand.name}`,
    text: [
      `Someone asked to use this address for a different ${brand.name} account. Because this address already has an account, nothing was changed and no link was sent.`,
      ``,
      `If that was you, you can simply sign in at ${base(portal)}/login (or reset your password at ${base(portal)}/forgot-password). If it wasn't, you can ignore this message.`,
    ].join("\n"),
  };
}

// --- Invitations (the Users pages) ----------------------------------------------------------------------------

/// A name goes into a header (the subject) and a line of text: never let it break either.
const oneLine = (value: string) => value.replace(/[\r\n\u2028\u2029]+/g, " ").trim();

/// The token travels in the URL FRAGMENT, like a reset link: no server log, no Referer.
export function invitationLink(token: string, portal?: Portal | null): string {
  return `${base(portal)}/accept-invite#token=${token}`;
}

/// To the invited address. Says the same whether or not that address already has an account (the invitee finds out when they open it) —
/// nothing here lets an administrator learn who is registered.
export function invitationEmail(input: {
  to: string;
  token: string;
  branchName: string;
  roleLabel: string;
  inviterName: string | null;
  days: number;
  /// The portal of the invited role (task 0086), so the link opens where that person signs in.
  portal?: Portal | null;
}) {
  const branch = oneLine(input.branchName);
  const inviter = input.inviterName ? oneLine(input.inviterName) : "An administrator";
  return {
    to: input.to,
    subject: `You're invited to join ${brand.name}`,
    text: [
      `${inviter} invited you to join ${brand.name} (${branch}) as ${input.roleLabel}.`,
      ``,
      `To accept, open this link within ${input.days} days:`,
      invitationLink(input.token, input.portal),
      ``,
      `If you weren't expecting this, ignore this message — nothing happens unless the link is opened, and it stops working by itself.`,
    ].join("\n"),
  };
}
