import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { addEntryToBranches } from "@/lib/academics/subject-catalog";
import { addToBranchesInput } from "@/lib/academics/subject-catalog-rules";

type Context = { params: Promise<{ id: string }> };

// POST /api/v1/subject-catalog/[id]/branches { branchIds: [..] }   (task 0119) SUPERADMIN only. Puts the subject in each of those branches (at most 50). Each branch is its own transaction and is
// reported: added, linked (the branch already had a subject of that name: it is linked, not duplicated), already, clash (another subject of the branch has that name), gone (no such branch).
const WRITES_PER_WINDOW = 200; // one request per subject when many are chosen

export const POST = withAuth<Context>(
  validate({ body: addToBranchesInput }, async (_req, auth, ctx, { body }) => {
    if (!(await reserveAttempt(`catalog:${auth.userId}`, WRITES_PER_WINDOW)))
      return fail("Too many changes. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("SUBJECT_CATALOG_BRANCHES", async () => {
      const results = await addEntryToBranches(auth.userId, (await ctx.params).id, body.branchIds);
      return results ? ok({ results }) : notFound("Subject");
    });
  }),
  { superAdmin: true },
);
