import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { setFeeAdmissionMany } from "@/lib/finance/fee-items";
import { feeItemFailure } from "@/lib/finance/fee-items-http";

const query = z.object({ branchId: z.string().trim().min(1).max(64) });
const body = z.strictObject({
  admission: z.enum(["NEW", "RETURNING"]).nullable(),
  classGroupId: z.string().trim().min(1).max(64).nullable().optional(),
  onlyUnset: z.boolean(),
  dryRun: z.boolean(),
});

/// POST /api/v1/finance/admission-status?branchId= { admission, classGroupId?, onlyUnset, dryRun } (task 0125)
/// New or Returning for many pupils at once, for invoices still to be made; a dry run only counts. An administrator of the branch's.
export const POST = withAuth(
  validate(
    { body, query },
    withBranch<Parsed<z.infer<typeof body>, z.infer<typeof query>>, AuthContext, unknown>(
      { of: ({ query: q }) => q.branchId, as: "administer" },
      async (_req, auth, _ctx, { body: b, query: q }) => {
        try {
          return noStore(ok(await setFeeAdmissionMany(q.branchId, b, auth.userId)));
        } catch (error) {
          const known = feeItemFailure(error);
          if (known) return known;
          console.error("[FEE_ADMISSION_MANY_ERROR]", error);
          return fail("Unable to change how the fee lines see these pupils", 500, "INTERNAL");
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
