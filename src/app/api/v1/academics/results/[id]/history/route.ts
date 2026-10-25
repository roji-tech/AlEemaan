import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { approverScope, covers } from "@/lib/academics/approver-scope";
import { prisma } from "@/lib/db";
import { resultHistory, resultsBranchId } from "@/lib/academics/results-workflow";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

// GET /api/v1/academics/results/[id]/history   who did what to this result, oldest first. Administrators of its branch, and an approver whose scope (task 0039) reaches the
// result; anyone else, and another branch, get the same 404.
export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => resultsBranchId([(await ctx.params).id]), as: "staff-read", refuse: () => notFound("Result") },
    async (_req, auth, ctx, _input, branch) =>
      structureCall("RESULT_HISTORY", async () => {
        const id = (await ctx.params).id;
        if (branch.role !== Role.ADMIN) {
          const scope = await approverScope(branch.branchId, auth.userId);
          const result = scope.approver
            ? await prisma.result.findFirst({ where: { id, branchId: branch.branchId }, select: { classArmId: true } })
            : null;
          if (!result || !covers(scope, result.classArmId)) return notFound("Result");
        }
        return ok({ history: await resultHistory(branch.branchId, id) });
      }),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);
