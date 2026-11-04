import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { fail } from "@/lib/api/envelope";
import { respond, toAction } from "@/lib/standing/http";
import { changeStudentStanding, studentStandingHistory } from "@/lib/standing/student-service";
import { studentStandingSchema } from "@/lib/standing/validation";

type Ctx = { params: Promise<{ id: string }> };
const PER_WINDOW = 60;

/** GET /api/v1/students/[id]/standing - the pupil's standing and its history (newest first). An administrator of the pupil's branch; any other answers 404. */
export const GET = withAuth(async (_req, auth, ctx: Ctx) => respond(await studentStandingHistory(auth.userId, (await ctx.params).id)), {
  roles: [Role.ADMIN],
});

/**
 * POST /api/v1/students/[id]/standing { action: "suspend" | "lift" | "expel" | "reinstate", reason, until? }
 * Suspend and lift: a super admin, or an administrator of the pupil's branch while the school allows it. Expel and reinstate: a super admin. A reason is required and kept in
 * an append-only history. `until` (suspend only) is the last day of the suspension; with none it lasts until someone lifts it.
 */
export const POST = withAuth(
  validate({ body: studentStandingSchema }, async (_req, auth, ctx: Ctx, { body }) => {
    if (!(await reserveAttempt(`standing:${auth.userId}`, PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return respond(
      await changeStudentStanding(auth.userId, (await ctx.params).id, toAction(body.action) as "SUSPEND" | "LIFT" | "EXPEL" | "REINSTATE", {
        reason: body.reason,
        until: body.until ?? null,
      }),
    );
  }),
  { roles: [Role.ADMIN] },
);
