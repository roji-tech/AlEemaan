import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { fail } from "@/lib/api/envelope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { changePersonStanding, personStandingHistory } from "@/lib/programs/people-service";
import { personStandingSchema } from "@/lib/programs/people-validation";
import { toAction } from "@/lib/standing/http";

type Ctx = { params: Promise<{ id: string; personId: string }> };
const PER_WINDOW = 60;

/** GET /api/v1/programs/[id]/people/[personId]/standing - the standing of a person who was typed in, and its history (newest first). */
export const GET = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, personId } = await params;
    return respond(await personStandingHistory(auth.userId, id, personId));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);

/**
 * POST /api/v1/programs/[id]/people/[personId]/standing { action: "suspend" | "lift" | "expel" | "reinstate", reason, until? }
 * For a person who was typed in (a pupil's or a member of staff's standing is the school's: 409 LINKED, change it on the Students or Users page). Suspend and lift: a super admin, a
 * program admin or a branch administrator of the person's branch, while the school's switch allows it. Expel and reinstate: a super admin. A reason is required and kept in the history.
 */
export const POST = withAuth(
  validate({ body: personStandingSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    if (!(await reserveAttempt(`standing:${auth.userId}`, PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const { id, personId } = await params;
    return respond(
      await changePersonStanding(auth.userId, id, personId, toAction(body.action) as "SUSPEND" | "LIFT" | "EXPEL" | "REINSTATE", {
        reason: body.reason,
        until: body.until ?? null,
      }),
    );
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
