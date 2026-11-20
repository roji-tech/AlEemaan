import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { syncSchoolTemplate } from "@/lib/results/school-templates";
import { syncInput } from "@/lib/results/school-templates-rules";

type Context = { params: Promise<{ id: string }> };

// POST /api/v1/school-templates/[id]/sync { branchIds: [..], replaceLocal?: [branchId, ..] }   (task 0120) SUPERADMIN only. "Update branches": applies the master's current definition to each chosen
// branch's row that follows it (at most 50 branches). Each branch is its own transaction and is reported: ok (with what changed), up-to-date, skipped-customised (the row says "Customised here" and
// the branch is not in `replaceLocal`), not-following (use "add to branches"), gone (no such branch), failed (with the reason, e.g. the branch holds a scheme or default scale of that name).
// Class assignments are never touched. 409 for an archived master.
const WRITES_PER_WINDOW = 60;

export const POST = withAuth<Context>(
  validate({ body: syncInput }, async (_req, auth, ctx, { body }) => {
    if (!(await reserveAttempt(`school-template:${auth.userId}`, WRITES_PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("SCHOOL_TEMPLATE_SYNC", async () => {
      const results = await syncSchoolTemplate(auth.userId, (await ctx.params).id, body);
      return results ? ok({ results }) : notFound("School template");
    });
  }),
  { superAdmin: true },
);
