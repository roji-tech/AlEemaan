// POST /api/v1/academics/assessment-schemes/[id]/archive   archive (never delete). Administrators of its branch. Safe to repeat.
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { schemeBranchId, archiveScheme } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => schemeBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Scheme") },
    async (_req, auth, ctx) =>
      structureCall("SCHEME_ARCHIVE", async () => {
        const result = await archiveScheme(auth.userId, (await ctx.params).id);
        return result ? ok({ scheme: result }) : notFound("Scheme");
      }),
  ),
  { roles: [Role.ADMIN] },
);
