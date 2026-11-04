import { withAuth } from "@/lib/auth/with-auth";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { endProgramAdmin } from "@/lib/programs/staff-service";

type Ctx = { params: Promise<{ id: string; staffId: string }> };

/** DELETE /api/v1/programs/[id]/staff/[staffId] - end a program admin's place (kept as history). Super admin only. */
export const DELETE = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, staffId } = await params;
    return respond(await endProgramAdmin(auth.userId, id, staffId));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);
