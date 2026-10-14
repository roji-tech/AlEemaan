import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { resultHistory, resultsBranchId } from "@/lib/academics/results-workflow";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// GET /api/v1/academics/results/[id]/history   who did what to this result, oldest first. Administrators of its branch; anyone else, and another branch, get the same 404.
export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => resultsBranchId([(await ctx.params).id]), as: "administer", refuse: () => notFound("Result") },
    async (_req, _auth, ctx, _input, branch) =>
      structureCall("RESULT_HISTORY", async () => ok({ history: await resultHistory(branch.branchId, (await ctx.params).id) })),
  ),
  { roles: [Role.ADMIN] },
);
