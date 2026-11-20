import { Role } from "@prisma/client";
import { ok, noStore } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { archiveTemplate, templateBranchId } from "@/lib/results/templates";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Result template");

// POST /api/v1/results/templates/[id]/archive   Administrators of the template's branch (another branch's template is a 404). Archives a template. Refused (409) while it holds classes (it names them) and for the branch's default template; archiving moves nothing. Repeating it is safe.
export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => templateBranchId((await ctx.params).id), as: "administer", refuse: gone },
    async (_req, auth, ctx) =>
      structureCall("RESULT_TEMPLATE_ARCHIVE", async () => {
        const done = await archiveTemplate(auth.userId, (await ctx.params).id);
        return done ? noStore(ok(done)) : gone();
      }),
  ),
  { roles: [Role.ADMIN] },
);
