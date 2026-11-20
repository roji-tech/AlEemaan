import { Role } from "@prisma/client";
import { ok, noStore } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { restoreTemplate, templateBranchId } from "@/lib/results/templates";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Result template");

// POST /api/v1/results/templates/[id]/restore   Administrators of the template's branch (another branch's template is a 404). Restores an archived template (409 when a live template already has its name). Repeating it is safe.
export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => templateBranchId((await ctx.params).id), as: "administer", refuse: gone },
    async (_req, auth, ctx) =>
      structureCall("RESULT_TEMPLATE_RESTORE", async () => {
        const done = await restoreTemplate(auth.userId, (await ctx.params).id);
        return done ? noStore(ok(done)) : gone();
      }),
  ),
  { roles: [Role.ADMIN] },
);
