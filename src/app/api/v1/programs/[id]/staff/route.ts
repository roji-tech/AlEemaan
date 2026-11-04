import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { nameProgramAdmin } from "@/lib/programs/staff-service";
import { nameAdminSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/v1/programs/[id]/staff { userId, branchId } - name a program admin (a member of staff of a branch the program runs in). Super admin only. */
export const POST = withAuth(
  validate({ body: nameAdminSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await nameProgramAdmin(auth.userId, (await params).id, body), 201),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
