import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { fail } from "@/lib/api/envelope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { getRoll, markRoll } from "@/lib/programs/attendance-service";
import { markRollSchema, rollQuery } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ id: string }> };
const PER_WINDOW = 240;

/**
 * GET /api/v1/programs/[id]/attendance?groupId=&date=&label=
 * The roll of one group (and the groups inside it) on one day: who is on it, who is flagged suspended, the marks already made, and what the caller may do (`rights`). Reading never
 * opens a session. The roll shows only the people the caller may see.
 */
export const GET = withAuth(
  validate({ query: rollQuery }, async (_req, auth, { params }: Ctx, { query }) =>
    respond(await getRoll(auth.userId, (await params).id, query)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);

/**
 * PUT /api/v1/programs/[id]/attendance { groupId, date, label?, reason?, marks: [{ participantId, status, remarks?, version? }] }
 * Saves the roll: every mark or none. Opens the session on its first mark. A teacher or a recorder: their groups, today and the 6 days before; a program admin or a super admin: any
 * group, any past day; a supervisor: corrects existing marks, with a reason. 409 CHANGED for a stale `version`, NOT_ON_ROLL, NOT_MARKABLE (suspended), ATTENDANCE_OFF.
 */
export const PUT = withAuth(
  validate({ body: markRollSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    if (!(await reserveAttempt(`attendance:${auth.userId}`, PER_WINDOW)))
      return fail("Too many saves. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return respond(await markRoll(auth.userId, (await params).id, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
