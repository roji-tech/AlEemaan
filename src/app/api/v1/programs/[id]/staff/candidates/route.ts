import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { candidatesFor } from "@/lib/programs/staff-service";
import { staffCandidatesQuery } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/programs/[id]/staff/candidates?role= - who could be named to a role (the active staff of the program's branches who do not hold it yet). For ADMIN (the default): a
 * super admin only. For SUPERVISOR, TEACHER or RECORDER: a super admin or a program admin.
 */
export const GET = withAuth(
  validate({ query: staffCandidatesQuery }, async (_req, auth, { params }: Ctx, { query }) =>
    respond(await candidatesFor(auth.userId, (await params).id, query.role)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
