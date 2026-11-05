import { withAuth } from "@/lib/auth/with-auth";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { endProgramStaff } from "@/lib/programs/staff-service";

type Ctx = { params: Promise<{ id: string; staffId: string }> };

/** DELETE /api/v1/programs/[id]/staff/[staffId] - end a place in the program's staff (kept as history). A program admin's: a super admin only; any other: a super admin or a program admin. */
export const DELETE = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, staffId } = await params;
    return respond(await endProgramStaff(auth.userId, id, staffId));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);
