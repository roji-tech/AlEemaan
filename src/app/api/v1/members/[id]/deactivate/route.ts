import { fail, ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { isPlausibleId, memberFailure, notFound } from "@/lib/members/http";
import { deactivateMember } from "@/lib/members/service";

// POST /api/v1/members/[id]/deactivate                                (Users pages — a port of Octalve Edu's 0.5.4)
// ADMIN only, audited, idempotent (doing it twice is a quiet success). Nobody does this to themselves, and the school's last
// active administrator cannot be deactivated. Deactivating a person's LAST active membership also signs them out (deletes their sessions). `[id]` is the MEMBERSHIP's id.
const PER_WINDOW = 60;
type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth(
  async (_req, auth: AuthContext, ctx: Ctx) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("member");
    if (!(await reserveAttempt(`member:deactivate:${auth.userId}`, PER_WINDOW))) {
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    }
    const result = await deactivateMember(auth.userId, id);
    return result.ok ? ok({ member: result.member, changed: result.changed }) : memberFailure(result.reason);
  },
  { roles: ["ADMIN"] },
);
