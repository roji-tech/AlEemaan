import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { armBranchId } from "@/lib/academics/structure";
import { armRoster } from "@/lib/academics/results";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };
const query = z.object({ periodId: z.string().min(1, "periodId is required") });

// GET /api/v1/academics/arms/[id]/roster?periodId=   the students enrolled in this arm for the term's session. Any staff role held in the arm's branch; an arm of another
// branch is the same 404 as an unknown id.
export const GET = withAuth<Context>(
  validate(
    { query },
    withBranch<Parsed<undefined, z.infer<typeof query>>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => armBranchId((await ctx.params).id), as: "staff-read", refuse: () => notFound("Class arm") },
      async (_req, _auth, ctx, { query }, branch) =>
        structureCall("ARM_ROSTER", async () => ok({ students: await armRoster(branch.branchId, (await ctx.params).id, query.periodId) })),
    ),
  ),
  { roles: READ_ROLES },
);
