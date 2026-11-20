import { Role } from "@prisma/client";
import { ok, noStore } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { detachTemplate } from "@/lib/results/school-templates";
import { templateBranchId } from "@/lib/results/templates";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Result template");

// POST /api/v1/results/templates/[id]/detach   (task 0120) Administrators of the template's branch (another branch's template is a 404). Stops the template following its school template: it becomes an
// ordinary template of the branch, nothing is copied or removed, and later updates of the school template no longer reach it. 409 when it follows none.
export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => templateBranchId((await ctx.params).id), as: "administer", refuse: gone },
    async (_req, auth, ctx) =>
      structureCall("RESULT_TEMPLATE_DETACH", async () => {
        const done = await detachTemplate(auth.userId, (await ctx.params).id);
        return done ? noStore(ok(done)) : gone();
      }),
  ),
  { roles: [Role.ADMIN] },
);
