import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { ok } from "@/lib/api/envelope";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { getProgram, updateProgram } from "@/lib/programs/service";
import { updateProgramSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id] - one program with its branches, levels, groups, program admins and (for those who manage it) its latest history. 404 when the caller has no place in it. */
export const GET = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const result = await getProgram(auth.userId, (await params).id);
    return result.ok ? ok(result.data) : respond(result);
  },
  { roles: PROGRAM_ROUTE_ROLES },
);

/** PATCH /api/v1/programs/[id] - name, description, dates. A super admin or a program admin; a draft or active program only. */
export const PATCH = withAuth(
  validate({ body: updateProgramSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await updateProgram(auth.userId, (await params).id, body)),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
