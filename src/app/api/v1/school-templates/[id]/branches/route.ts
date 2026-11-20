import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { addSchoolTemplateToBranches } from "@/lib/results/school-templates";
import { addToBranchesInput } from "@/lib/results/school-templates-rules";

type Context = { params: Promise<{ id: string }> };

// POST /api/v1/school-templates/[id]/branches { branchIds: [..] }   (task 0120) SUPERADMIN only. Gives each chosen branch (at most 50) its own template that follows the master. Each branch is its own
// transaction and is reported: added, already (it follows this master), clash (a template of the branch's own has the name: rename or detach it first), gone (no such branch), failed (with the reason).
// 409 for an archived master.
const WRITES_PER_WINDOW = 60;

export const POST = withAuth<Context>(
  validate({ body: addToBranchesInput }, async (_req, auth, ctx, { body }) => {
    if (!(await reserveAttempt(`school-template:${auth.userId}`, WRITES_PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("SCHOOL_TEMPLATE_BRANCHES", async () => {
      const results = await addSchoolTemplateToBranches(auth.userId, (await ctx.params).id, body.branchIds);
      return results ? ok({ results }) : notFound("School template");
    });
  }),
  { superAdmin: true },
);
