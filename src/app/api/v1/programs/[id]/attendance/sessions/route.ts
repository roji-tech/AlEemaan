import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { listSessions } from "@/lib/programs/attendance-service";
import { sessionsQuery } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/attendance/sessions?from=&to=&groupId= - the sessions held in the range (at most 366 days), newest first, with how many were marked each way. */
export const GET = withAuth(
  validate({ query: sessionsQuery }, async (_req, auth, { params }: Ctx, { query }) =>
    respond(await listSessions(auth.userId, (await params).id, query)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
