import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { setFeeOptOut } from "@/lib/finance/fee-items";
import { feeItemFailure, optOutBody } from "@/lib/finance/fee-items-http";

type Context = { params: Promise<{ studentId: string; feeId: string }> };
const query = z.object({ branchId: z.string().trim().min(1).max(64) });

/// PUT /api/v1/finance/students/[studentId]/fee-items/[feeId]/opt-out?branchId= { optedOut, note? } (task 0122)
/// Opt a pupil out of an optional fee line, or back in. The invoice, if there is one, is changed too, but only while nothing was paid on it (409 INVOICE_LOCKED says why otherwise).
export const PUT = withAuth<Context>(
  validate<z.infer<typeof optOutBody>, z.infer<typeof query>, AuthContext, Context>(
    { body: optOutBody, query },
    withBranch<Parsed<z.infer<typeof optOutBody>, z.infer<typeof query>>, AuthContext, Context>(
      { of: ({ query: q }) => q.branchId, as: "administer" },
      async (_req, auth, ctx, { body, query: q }) => {
        try {
          const { studentId, feeId } = await ctx.params;
          return noStore(ok(await setFeeOptOut(q.branchId, studentId, feeId, body.optedOut, auth.userId, body.note)));
        } catch (error) {
          const known = feeItemFailure(error);
          if (known) return known;
          console.error("[FEE_OPT_OUT_ERROR]", error);
          return fail("Unable to change the pupil's fee line", 500, "INTERNAL");
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
