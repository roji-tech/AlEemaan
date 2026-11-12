import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { fail } from "@/lib/api/envelope";
import { respond, toAction } from "@/lib/standing/http";
import { changeStaffStanding, staffStandingHistory } from "@/lib/standing/staff-service";
import { staffStandingSchema } from "@/lib/standing/validation";

type Ctx = { params: Promise<{ id: string }> };
const PER_WINDOW = 60;

/** GET /api/v1/staff/[id]/standing - the standing and its history (newest first). `[id]` is the staff record's id. An administrator of that branch; any other answers 404. */
export const GET = withAuth(
  async (_req, auth, ctx: Ctx) => respond(await staffStandingHistory(auth.userId, { staffRecordId: (await ctx.params).id })),
  { roles: [Role.ADMIN] },
);

/**
 * POST /api/v1/staff/[id]/standing { action: "suspend" | "lift" | "terminate" | "reinstate", reason, until?, scope?: "BRANCH" | "SCHOOL" }
 * Suspend and lift: a super admin, or an administrator of that branch while the school allows it, never on another administrator. Terminate, reinstate and a school-wide
 * scope: a super admin. Never on yourself; never the last super admin. A reason is required and kept in an append-only history. Suspending or terminating signs the person
 * out of the branch (and out altogether when it was their last one).
 */
export const POST = withAuth(
  validate({ body: staffStandingSchema }, async (_req, auth, ctx: Ctx, { body }) => {
    if (!(await reserveAttempt(`standing:${auth.userId}`, PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return respond(
      await changeStaffStanding(
        auth.userId,
        { staffRecordId: (await ctx.params).id },
        toAction(body.action) as "SUSPEND" | "LIFT" | "TERMINATE" | "REINSTATE",
        { reason: body.reason, until: body.until ?? null, scope: body.scope },
      ),
    );
  }),
  { roles: [Role.ADMIN] },
);
