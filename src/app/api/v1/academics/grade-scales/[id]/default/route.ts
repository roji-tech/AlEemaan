// POST /api/v1/academics/grade-scales/[id]/default   make this the branch's default grade scale. Administrators of its branch. Safe to repeat.
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { scaleBranchId, makeDefaultScale } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => scaleBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Grade scale") },
    async (_req, auth, ctx) =>
      structureCall("SCALE_DEFAULT", async () => {
        const result = await makeDefaultScale(auth.userId, (await ctx.params).id);
        return result ? ok(result) : notFound("Grade scale");
      }),
  ),
  { roles: [Role.ADMIN] },
);
