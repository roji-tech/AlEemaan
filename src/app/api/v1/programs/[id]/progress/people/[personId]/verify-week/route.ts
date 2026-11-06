import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { verifyWeek } from "@/lib/programs/progress-service";
import { verifyWeekSchema } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/** POST /api/v1/programs/[id]/progress/people/[personId]/verify-week { weekStart } - verify every submitted entry of one person in one week, in one step; all or nothing (403 `FOUR_EYES` if any is the caller's own). */
export const POST = withAuth(
  validate({ body: verifyWeekSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, personId } = await params;
    return respond(await verifyWeek(auth.userId, id, personId, body.weekStart));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
