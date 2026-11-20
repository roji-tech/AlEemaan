import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { isPlausibleId, notFound, scopeOrForbidden } from "@/lib/members/http";
import { revokeInvitation, updateDraftInvitation } from "@/lib/invitations/service";
import { inviteEmail, inviteRole } from "@/lib/invitations/rules";

// DELETE /api/v1/invitations/[id]                                      (Users pages — a port of Octalve Edu's 0.5.4)
// Revokes an OPEN invitation — ADMIN only, audited. An accepted, already-revoked or unknown id is the same 404: "no such open invitation". A DRAFT is thrown away the same way
// (audited INVITATION_DRAFT_DELETED; the row stays, so the history can show it).
// PATCH /api/v1/invitations/[id] { email?, role? }   (task 0101 D2) edits a DRAFT: its address or its role. A sent invitation is revoked and made again, never edited (404 here).
type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth(
  async (_req, auth: AuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("open invitation");
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    return (await revokeInvitation(auth.userId, id, scope)) ? ok({ revoked: true }) : notFound("open invitation");
  },
  { roles: ["ADMIN"] },
);

const patch = z
  .strictObject({ email: inviteEmail.optional(), role: inviteRole.optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

export const PATCH = withAuth(
  validate({ body: patch }, async (_req, auth: AuthContext, ctx: Ctx, { body }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("draft invitation");
    if (!(await reserveAttempt(`invite:draft:${auth.userId}`, 60)))
      return fail("Too many changes to drafts. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const scope = await scopeOrForbidden(auth.userId);
    if (scope instanceof Response) return scope;
    const result = await updateDraftInvitation(auth.userId, id, body, scope);
    if (result.ok) return ok({ invitation: result.invitation });
    switch (result.reason) {
      case "NOT_FOUND":
        return notFound("draft invitation");
      case "ALREADY_MEMBER":
        return fail("That person is already a member.", 409, "ALREADY_MEMBER");
      case "DEACTIVATED_MEMBER":
        return fail("That person was deactivated. Reactivate them instead.", 409, "DEACTIVATED_MEMBER");
      case "OPEN_EXISTS":
        return fail("An invitation to that address is already open for this branch.", 409, "INVITATION_PENDING");
      case "ADMIN_ONLY":
        return fail("Only a superadmin can invite an administrator.", 403, "FORBIDDEN");
      default:
        return fail("You can only invite people to the branches you administer.", 403, "FORBIDDEN");
    }
  }),
  { roles: ["ADMIN"] },
);
