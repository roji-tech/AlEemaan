import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { setStaffArchived, staffBranchId } from "@/lib/academics/staff";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// POST /api/v1/staff/[id]/restore   Administrators of the record's branch. Nothing is deleted; restore is idempotent.
export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "administer", refuse: gone },
    async (_req, auth, ctx) =>
      structureCall("STAFF_RESTORE", async () => {
        const staff = await setStaffArchived(auth.userId, (await ctx.params).id, false);
        return staff ? ok({ staff }) : gone();
      }),
  ),
  { roles: [Role.ADMIN] },
);
