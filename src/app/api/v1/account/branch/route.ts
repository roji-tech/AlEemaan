import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { isSuperAdmin } from "@/lib/auth/branch-access";

// PUT /api/v1/account/branch { branchId }   (task 0127) The branch this person last chose on a page with a branch picker, kept for the person (so it follows them to another browser or device) and
// not for one browser. A person's own preference: it changes nothing but which branch their pages open on, and a page uses it only when it is one of the branches they may see. Stored only for a
// branch the person belongs to (an active membership) or, for a superadmin, any branch; anything else is a 404, the same as an unknown id.
const body = z.strictObject({ branchId: z.string().trim().min(1).max(64) });
const PER_WINDOW = 120; // per account per 5 minutes: a picker is changed by hand

export const PUT = withAuth(
  validate({ body }, async (_req, auth: AuthContext, _ctx: unknown, input) => {
    if (!(await reserveAttempt(`branch-memory:user:${auth.userId}`, PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const id = input.body.branchId;
    const allowed =
      (await isSuperAdmin(auth.userId)) ||
      (await prisma.membership.count({ where: { userId: auth.userId, branchId: id, deactivatedAt: null } })) > 0;
    if (!allowed || !(await prisma.branch.findUnique({ where: { id }, select: { id: true } })))
      return fail("Branch not found.", 404, "NOT_FOUND");
    await prisma.user.update({ where: { id: auth.userId }, data: { lastBranchId: id } });
    return ok({ branchId: id });
  }),
);
