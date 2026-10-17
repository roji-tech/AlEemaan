// POST /api/v1/academics/grade-scales/[id]/archive   archive (never the default one). Administrators of its branch. Safe to repeat.
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { scaleBranchId, archiveScale } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => scaleBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Grade scale") },
    async (_req, auth, ctx) =>
      structureCall("SCALE_ARCHIVE", async () => {
        const result = await archiveScale(auth.userId, (await ctx.params).id);
        return result ? ok({ scale: result }) : notFound("Grade scale");
      }),
  ),
  { roles: [Role.ADMIN] },
);
