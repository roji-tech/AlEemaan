import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { isUnplaced, placeStaff } from "@/lib/academics/staff";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// POST /api/v1/staff/unplaced/[id]/place { branchId }   places a record that has no branch in one (task 0101 D3). A SUPERADMIN only: no branch administers an unplaced record, so a branch's
// administrator cannot pull one into their branch (the record is a 404 to them). A live record of that branch with the same e-mail address is a 409; a record that is already in a branch is a
// 409. Audited STAFF_PLACED. From then on the branch's administrators manage it.
const body = z.strictObject({ branchId: z.string().trim().min(1).max(64) });

export const POST = withAuth<Context>(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, Context>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, ctx, { body }) => {
        const id = (await ctx.params).id;
        if (!(await isSuperAdmin(auth.userId)) || (await isUnplaced(id)) === null) return gone();
        return structureCall("STAFF_PLACE", async () => {
          const staff = await placeStaff(auth.userId, id, body.branchId);
          return staff ? ok({ staff }) : gone();
        });
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
