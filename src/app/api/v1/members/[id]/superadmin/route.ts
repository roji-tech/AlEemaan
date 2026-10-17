import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { PASSWORD_MAX_LENGTH, verifyPassword } from "@/lib/auth/password";
import { refundAttempt, reserveAttempt } from "@/lib/auth/rate-limit";
import { isPlausibleId, memberFailure, notFound } from "@/lib/members/http";
import { setSuperAdmin } from "@/lib/members/service";

// PATCH /api/v1/members/[id]/superadmin  { superAdmin: boolean, password }                (branch administrators and superadmins, plan S3/S5)
// Grants or revokes a person's school-wide authority — superadmins only, and the caller re-types THEIR OWN password first (a stolen session
// cannot hand out the keys to the school). Audited; nobody changes their own; the school's last superadmin cannot be revoked. `[id]` is one
// of the person's memberships (a grant needs it to be active). Idempotent: setting what already holds is a quiet success.
const FAILED_PASSWORDS_PER_WINDOW = 5; // wrong passwords per superadmin per 5 minutes; a correct one is refunded
type Ctx = { params: Promise<{ id: string }> };

const body = z.strictObject({ superAdmin: z.boolean(), password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });

export const PATCH = withAuth(
  validate({ body }, async (_req, auth: AuthContext, ctx: Ctx, { body: input }) => {
    const { id } = await ctx.params;
    if (!isPlausibleId(id)) return notFound("member");
    const key = `superadmin:set:${auth.userId}`;
    if (!(await reserveAttempt(key, FAILED_PASSWORDS_PER_WINDOW))) {
      return fail("Too many attempts. Please try again in a few minutes.", 429, "RATE_LIMITED");
    }
    const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { passwordHash: true } });
    if (!(await verifyPassword(input.password, me?.passwordHash ?? null))) {
      return fail("Your password is incorrect.", 400, "INVALID_PASSWORD");
    }
    await refundAttempt(key); // a correct password is not a guess
    const result = await setSuperAdmin(auth.userId, id, input.superAdmin);
    return result.ok ? ok({ member: result.member, changed: result.changed }) : memberFailure(result.reason);
  }),
  { superAdmin: true },
);
