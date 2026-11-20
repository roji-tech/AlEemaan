// POST /api/v1/academics/grade-scales/[id]/confirm   "Confirm these bands" (task 0116 D15): clears the "unconfirmed" mark of a scale whose cut-offs were a guess (the seeded junior scale).
// A branch administrator of the scale's branch, or a superadmin (everywhere); anyone else is 403 before the scale is looked up, and another branch's scale is a 404. Idempotent; audited
// (who and when). Works on an earlier version too. Results graded on an unconfirmed scale cannot be published until it is confirmed.
import { Role } from "@prisma/client";
import { ok, noStore } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { scaleBranchId, confirmScale } from "@/lib/academics/assessment";
import { notFound, structureCall } from "@/lib/academics/structure-http";

type Context = { params: Promise<{ id: string }> };

export const POST = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_i, _r, ctx) => scaleBranchId((await ctx.params).id), as: "administer", refuse: () => notFound("Grade scale") },
    async (_req, auth, ctx) =>
      structureCall("SCALE_CONFIRM", async () => {
        const result = await confirmScale(auth.userId, (await ctx.params).id);
        return result ? noStore(ok(result)) : notFound("Grade scale");
      }),
  ),
  { roles: [Role.ADMIN] },
);
