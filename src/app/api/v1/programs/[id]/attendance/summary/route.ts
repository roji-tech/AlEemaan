import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { summarise } from "@/lib/programs/attendance-service";
import { summaryQuery } from "@/lib/programs/attendance-validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/programs/[id]/attendance/summary?from=&to=&groupId=
 * Per person over the range: sessions marked, each way, the percentage (present and late over present, late and absent; excused left out of both) and whether it is under the
 * program's threshold. Computed from the marks, never stored; only the people the caller may see.
 */
export const GET = withAuth(
  validate({ query: summaryQuery }, async (_req, auth, { params }: Ctx, { query }) =>
    respond(await summarise(auth.userId, (await params).id, query)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
