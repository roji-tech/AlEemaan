import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { setFeeAdmission } from "@/lib/finance/fee-items";
import { feeItemFailure } from "@/lib/finance/fee-items-http";

type Context = { params: Promise<{ studentId: string }> };
const query = z.object({ branchId: z.string().trim().min(1).max(64) });
const body = z.strictObject({ admission: z.enum(["NEW", "RETURNING"]).nullable() });

/// PUT /api/v1/finance/students/[studentId]/admission-status?branchId= { admission: "NEW" | "RETURNING" | null } (task 0122)
/// How the fee lines see the pupil: new or returning, or null to work it out from their enrolments. For invoices still to be made. An administrator's.
export const PUT = withAuth<Context>(
  validate<z.infer<typeof body>, z.infer<typeof query>, AuthContext, Context>(
    { body, query },
    withBranch<Parsed<z.infer<typeof body>, z.infer<typeof query>>, AuthContext, Context>(
      { of: ({ query: q }) => q.branchId, as: "administer" },
      async (_req, auth, ctx, { body: b, query: q }) => {
        try {
          const { studentId } = await ctx.params;
          return noStore(ok(await setFeeAdmission(q.branchId, studentId, b.admission, auth.userId)));
        } catch (error) {
          const known = feeItemFailure(error);
          if (known) return known;
          console.error("[FEE_ADMISSION_ERROR]", error);
          return fail("Unable to change how the fee lines see this pupil", 500, "INTERNAL");
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
