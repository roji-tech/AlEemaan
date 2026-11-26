// POST /api/v1/academics/assessment-schemes/[id]/restore   (task 0128) brings an archived scheme back. Administrators of its branch. Safe to repeat. A scheme a newer version replaced, one whose name or place
// (the branch default, or its class's scheme) is held by another live scheme, or one of an archived class, is a 409 that says why. Audited ASSESSMENT_SCHEME_RESTORED.
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { schemeBranchId, restoreScheme } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => schemeBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Scheme") },
    async (_req, auth, ctx) =>
      structureCall("SCHEME_RESTORE", async () => {
        const result = await restoreScheme(auth.userId, (await ctx.params).id);
        return result ? ok({ scheme: result }) : notFound("Scheme");
      }),
  ),
  { roles: [Role.ADMIN] },
);
