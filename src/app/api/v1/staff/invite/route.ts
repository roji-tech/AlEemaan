import { after } from "next/server";
import { z } from "zod";
import { fail, ok, noStore } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { scopeOrForbidden } from "@/lib/members/http";
import { mailInvitation } from "@/lib/invitations/mail";
import { STAFF_INVITE_MAX, inviteStaffRecords } from "@/lib/academics/staff-invite";

// POST /api/v1/staff/invite { branchId, staffIds }   invite one or many staff records of one branch to sign in, at the address on each record (task 0114). Administrators of THAT branch and
// superadmins (403 otherwise). The answer says, record by record, invited / linked / skipped and why; it never carries a token. The e-mails go out after the response.
// Limits: STAFF_INVITE_MAX records per request, and the same per administrator per 5 minutes; each address keeps its own mail limit (lib/invitations/mail.ts).
const body = z.strictObject({
  branchId: z.string().trim().min(1).max(64),
  staffIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, "Choose at least one person.")
    .max(STAFF_INVITE_MAX, `At most ${STAFF_INVITE_MAX} at once.`),
});

export const POST = withAuth(
  validate({ body }, async (_req, auth: AuthContext, _ctx: unknown, { body: input }) => {
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    for (let i = 0; i < input.staffIds.length; i++) {
      if (!(await reserveAttempt(`invite:staff:${auth.userId}`, STAFF_INVITE_MAX))) {
        return noStore(fail("Too many invitations in a few minutes. Please wait and try again.", 429, "RATE_LIMITED"));
      }
    }
    const done = await inviteStaffRecords(auth.userId, scope, input.branchId, input.staffIds);
    if (!done.ok) return noStore(fail("You can only invite the staff of the branches you administer.", 403, "FORBIDDEN"));

    const toMail = done.outcomes.flatMap((o) => (o.result === "invited" ? [o] : []));
    if (toMail.length > 0) {
      after(async () => {
        for (const o of toMail) {
          try {
            await mailInvitation({ email: o.email, token: o.token, branchName: o.branchName, role: o.role, inviterName: auth.user.name });
          } catch (error) {
            console.error("[staff invite] mail failed:", error instanceof Error ? error.message : error);
          }
        }
      });
    }
    return noStore(
      ok({
        outcomes: done.outcomes.map((o) =>
          o.result === "invited"
            ? { staffId: o.staffId, name: o.name, result: o.result, email: o.email }
            : o.result === "linked"
              ? { staffId: o.staffId, name: o.name, result: o.result, email: o.email }
              : { staffId: o.staffId, name: o.name, result: o.result, why: o.why },
        ),
        invited: toMail.length,
        linked: done.outcomes.filter((o) => o.result === "linked").length,
        skipped: done.outcomes.filter((o) => o.result === "skipped").length,
      }),
    );
  }),
  { roles: ["ADMIN"] },
);
