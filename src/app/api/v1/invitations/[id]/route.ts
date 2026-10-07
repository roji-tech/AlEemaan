import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { isPlausibleId, notFound } from "@/lib/members/http";
import { revokeInvitation } from "@/lib/invitations/service";

// DELETE /api/v1/invitations/[id]                                      (Users pages — a port of Octalve Edu's 0.5.4)
// Revokes an OPEN invitation — ADMIN only, audited. An accepted, already-revoked or unknown id is the same 404: "no such open invitation".
type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth(
  async (_req, auth: AuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("open invitation");
    return (await revokeInvitation(auth.userId, id)) ? ok({ revoked: true }) : notFound("open invitation");
  },
  { roles: ["ADMIN"] },
);
