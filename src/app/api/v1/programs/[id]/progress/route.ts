import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { getOverview } from "@/lib/programs/progress-service";
import { peopleQuery } from "@/lib/programs/progress-validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/programs/[id]/progress?q=&groupId=&page=
 * The people whose progress record the caller may see (a super admin and a program admin all; a supervisor all; a teacher or a recorder those in their groups; a branch administrator
 * those through their own branch), with each one's last entry and how many are waiting to be verified; the program's template, settings, and what the caller may do. Reading never
 * creates anything and stays open when progress records are switched off: what was recorded stays readable.
 */
export const GET = withAuth(
  validate({ query: peopleQuery }, async (_req, auth, { params }: Ctx, { query }) =>
    respond(await getOverview(auth.userId, (await params).id, query)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
