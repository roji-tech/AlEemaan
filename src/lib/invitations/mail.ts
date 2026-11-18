import { portalFor } from "@/lib/portals";
import type { Role } from "@prisma/client";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { invitationEmail, invitationsEmail } from "@/lib/email/messages";
import { sendEmailQuietly } from "@/lib/email/transport";
import { ROLE_LABELS } from "@/lib/roles";
import { INVITATION_TTL_DAYS } from "./token";

/// Nobody's inbox is a target: beyond this many in five minutes the invitation exists and the mail is withheld (the administrator can resend later).
export const MAIL_PER_ADDRESS = 5;

/// Mails one invitation link. Always called AFTER the response or the commit, so a failure here can never undo an invitation; a failed send is logged by the transport.
export async function mailInvitation(input: {
  email: string;
  token: string;
  branchName: string;
  role: Role;
  inviterName: string | null;
}): Promise<void> {
  if (!(await reserveAttempt(`invite:mail:${input.email}`, MAIL_PER_ADDRESS))) return;
  await sendEmailQuietly(
    invitationEmail({
      to: input.email,
      token: input.token,
      branchName: input.branchName,
      roleLabel: ROLE_LABELS[input.role],
      inviterName: input.inviterName,
      days: INVITATION_TTL_DAYS,
      portal: portalFor({ roles: [input.role], isSuperAdmin: false }),
    }),
  );
}

/// Mails ONE e-mail for several invitations of one person (task 0092): every branch named, one link per branch, counted ONCE against the address's mail limit (a person invited to four
/// branches is one message, not four). A single branch is the ordinary invitation e-mail, word for word. Called AFTER the response or the commit, like `mailInvitation`.
export async function mailInvitations(input: {
  email: string;
  role: Role;
  inviterName: string | null;
  invitations: readonly { branchName: string; token: string }[];
}): Promise<void> {
  if (input.invitations.length === 1) {
    const [only] = input.invitations;
    return mailInvitation({
      email: input.email,
      token: only.token,
      branchName: only.branchName,
      role: input.role,
      inviterName: input.inviterName,
    });
  }
  if (!(await reserveAttempt(`invite:mail:${input.email}`, MAIL_PER_ADDRESS))) return;
  await sendEmailQuietly(
    invitationsEmail({
      to: input.email,
      branches: input.invitations,
      roleLabel: ROLE_LABELS[input.role],
      inviterName: input.inviterName,
      days: INVITATION_TTL_DAYS,
      portal: portalFor({ roles: [input.role], isSuperAdmin: false }),
    }),
  );
}
