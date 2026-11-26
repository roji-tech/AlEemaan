// POST /api/v1/academics/assessment-schemes/[id]/make-default   (task 0131) makes a live scheme the branch's default: the one used for a class with no scheme of its own and no template scheme. The scheme
// that was the default stops being it (nothing is archived or deleted; no result changes). Administrators of its branch. Safe to repeat. 409 in words for an archived scheme, a class's own scheme, a
// school-wide or teacher level scheme, or one a newer version replaced. Audited ASSESSMENT_SCHEME_MADE_DEFAULT with the previous default.
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { schemeBranchId, makeSchemeDefault } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => schemeBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Scheme") },
    async (_req, auth, ctx) =>
      structureCall("SCHEME_MAKE_DEFAULT", async () => {
        const result = await makeSchemeDefault(auth.userId, (await ctx.params).id);
        return result ? ok({ scheme: result }) : notFound("Scheme");
      }),
  ),
  { roles: [Role.ADMIN] },
);
