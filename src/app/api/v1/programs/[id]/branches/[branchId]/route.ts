import { withAuth } from "@/lib/auth/with-auth";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { unlinkBranch } from "@/lib/programs/service";

type Ctx = { params: Promise<{ id: string; branchId: string }> };

/** DELETE /api/v1/programs/[id]/branches/[branchId] - stop running the program in a branch (never its own branch, never the last one). Super admin only. */
export const DELETE = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, branchId } = await params;
    return respond(await unlinkBranch(auth.userId, id, branchId));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);
