import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { personAttendance } from "@/lib/programs/attendance-service";
import { historyQuery } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/** GET /api/v1/programs/[id]/attendance/people/[personId]?from=&to= - one person's marks, newest first, each with the corrections made to it (who, when, from what, to what, why). */
export const GET = withAuth(
  validate({ query: historyQuery }, async (_req, auth, { params }: Ctx, { query }) => {
    const { id, personId } = await params;
    return respond(await personAttendance(auth.userId, id, personId, query));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
