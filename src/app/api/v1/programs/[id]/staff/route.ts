import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { nameProgramStaff } from "@/lib/programs/staff-service";
import { nameStaffSchema } from "@/lib/programs/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/programs/[id]/staff { userId, branchId, role? } - name a member of staff of a branch the program runs in to a role: ADMIN (the default; a super admin only),
 * SUPERVISOR, TEACHER or RECORDER (a super admin or a program admin).
 */
export const POST = withAuth(
  validate({ body: nameStaffSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await nameProgramStaff(auth.userId, (await params).id, body), 201),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
