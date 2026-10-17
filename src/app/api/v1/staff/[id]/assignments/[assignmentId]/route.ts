import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { removeAssignment, staffBranchId } from "@/lib/academics/staff";

type Context = { params: Promise<{ id: string; assignmentId: string }> };

// DELETE /api/v1/staff/[id]/assignments/[assignmentId]   Administrators of the record's branch. A real delete (nothing references an assignment yet).
export const DELETE = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Assignment") },
    async (_req, auth, ctx) =>
      structureCall("STAFF_UNASSIGN", async () => {
        const { id, assignmentId } = await ctx.params;
        return (await removeAssignment(auth.userId, id, assignmentId)) ? ok({ removed: true }) : notFound("Assignment");
      }),
  ),
  { roles: [Role.ADMIN] },
);
