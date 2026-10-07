import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { branchIdField, isPlausibleId, memberFailure, notFound, roleField } from "@/lib/members/http";
import { changeMember } from "@/lib/members/service";

// PATCH /api/v1/members/[id]  { role?, branchId? }                      (Users pages — a port of Octalve Edu's 0.5.4)
// Change a member's role and/or branch — ADMIN only, audited with before/after. The body is STRICT: a key it does not name (a `userId`,
// a `passwordHash`) is refused, never ignored. Authority rules live in lib/members/service.ts: nobody changes themselves, the last
// administrator cannot be demoted, a branch must be one of the school's. `[id]` is the MEMBERSHIP's id.
const CHANGES_PER_WINDOW = 60;
type Ctx = { params: Promise<{ id: string }> };

const body = z
  .strictObject({ role: roleField.optional(), branchId: branchIdField.optional() })
  .refine((value) => value.role !== undefined || value.branchId !== undefined, "Give a role, a branch, or both.");

export const PATCH = withAuth(
  validate({ body }, async (_req, auth: AuthContext, ctx: Ctx, { body: change }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("member");
    if (!(await reserveAttempt(`member:change:${auth.userId}`, CHANGES_PER_WINDOW))) {
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    }
    const result = await changeMember(auth.userId, id, change);
    return result.ok ? ok({ member: result.member, changed: result.changed }) : memberFailure(result.reason);
  }),
  { roles: ["ADMIN"] },
);
