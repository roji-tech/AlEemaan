import { after } from "next/server";
import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { mailInvitation } from "@/lib/invitations/mail";
import { sendDraftInvitation } from "@/lib/invitations/service";
import { isPlausibleId, notFound, scopeOrForbidden } from "@/lib/members/http";

// POST /api/v1/invitations/[id]/send   (task 0101 D2)
// Sends a DRAFT invitation: makes the link (a hashed, single-use, seven-day token) and e-mails it AFTER the response. ADMIN only, audited (INVITATION_DRAFT_SENT), limited like creating one.
// An id that is not a draft the caller can see (sent, accepted, revoked, another branch's, unknown) is the same 404. The membership rule is asked again: someone who joined since the draft was
// saved is a 409.
const CREATES_PER_WINDOW = 30; // per administrator per 5 minutes, shared with creating invitations
type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth(
  async (_req, auth: AuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("draft invitation");
    if (!(await reserveAttempt(`invite:create:${auth.userId}`, CREATES_PER_WINDOW)))
      return fail("Too many invitations. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const result = await sendDraftInvitation(auth.userId, id, scope);
    if (!result.ok) {
      switch (result.reason) {
        case "NOT_FOUND":
          return notFound("draft invitation");
        case "ALREADY_MEMBER":
          return fail("That person is already a member.", 409, "ALREADY_MEMBER");
        case "DEACTIVATED_MEMBER":
          return fail("That person was deactivated. Reactivate them instead.", 409, "DEACTIVATED_MEMBER");
        case "OUT_OF_SCOPE":
          return fail("You can only invite people to the branches you administer.", 403, "FORBIDDEN");
        case "ADMIN_ONLY":
          return fail("Only a superadmin can invite an administrator.", 403, "FORBIDDEN");
      }
    }
    const { invitation, token } = result;
    after(async () => {
      try {
        await mailInvitation({
          email: invitation.email,
          token,
          branchName: invitation.branchName,
          role: invitation.role,
          inviterName: auth.user.name,
        });
      } catch (error) {
        console.error("[invitations] mail failed:", error instanceof Error ? error.message : error);
      }
    });
    return ok({ invitation });
  },
  { roles: ["ADMIN"] },
);
