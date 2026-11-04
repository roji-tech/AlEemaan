import { withAuth } from "@/lib/auth/with-auth";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { fail, ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { createProgram, listPrograms } from "@/lib/programs/service";
import { createProgramSchema } from "@/lib/programs/validation";

/**
 * GET /api/v1/programs
 * The programs the caller may see: all of them for a super admin, the ones they run as a program admin, and the ones that run in a branch they administer.
 * An empty list is the answer for anyone with no place in a program (never an error that says one exists).
 */
export const GET = withAuth(async (_req, auth) => ok(await listPrograms(auth.userId)), { roles: PROGRAM_ROUTE_ROLES });

/**
 * POST /api/v1/programs
 * Super admin only: a program reaches across branches, which is school-wide authority. Creates it as a draft, with its levels, its branches and (optionally) a branch of its own.
 */
export const POST = withAuth(
  validate({ body: createProgramSchema }, async (_req, auth, _ctx, { body }) => {
    if (!(await isSuperAdmin(auth.userId))) return fail("You don't have permission to do that", 403, "FORBIDDEN");
    return respond(await createProgram(auth.userId, body), 201);
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
