import { portalFor } from "@/lib/portals";
import type { Role } from "@prisma/client";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { invitationEmail } from "@/lib/email/messages";
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
