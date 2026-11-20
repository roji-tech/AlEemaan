import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { pupilFeeItems } from "@/lib/finance/fee-items";
import { feeItemFailure } from "@/lib/finance/fee-items-http";

type Context = { params: Promise<{ studentId: string }> };
const query = z.object({ branchId: z.string().trim().min(1).max(64), periodId: z.string().trim().max(64).optional() });

/// GET /api/v1/finance/students/[studentId]/fee-items?branchId=&periodId= (task 0122; no periodId = the current term)
/// The period's fee lines for this pupil's class: each with whether the pupil is billed it, opted out of it, or it is for another kind of pupil, and whether a tracked item was handed over.
/// An administrator of the branch's (fees are financial); a branch that is not theirs is a 404.
export const GET = withAuth<Context>(
  validate<undefined, z.infer<typeof query>, AuthContext, Context>(
    { query },
    withBranch<Parsed<undefined, z.infer<typeof query>>, AuthContext, Context>(
      { of: ({ query: q }) => q.branchId, as: "administer" },
      async (_req, _auth, ctx, { query: q }) => {
        try {
          const { studentId } = await ctx.params;
          return noStore(ok(await pupilFeeItems(q.branchId, studentId, q.periodId || null)));
        } catch (error) {
          const known = feeItemFailure(error);
          if (known) return known;
          console.error("[PUPIL_FEE_ITEMS_GET_ERROR]", error);
          return fail("Unable to load the pupil's fee lines", 500, "INTERNAL");
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
