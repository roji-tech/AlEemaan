import { z } from "zod";
import { Role } from "@prisma/client";
import { fail, noStore, ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { handoverList } from "@/lib/finance/fee-items";
import { feeItemFailure } from "@/lib/finance/fee-items-http";

const query = z.object({
  branchId: z.string().trim().min(1).max(64),
  periodId: z.string().trim().min(1).max(64),
  feeId: z.string().trim().min(1).max(64),
});

/// GET /api/v1/finance/handovers?branchId=&periodId=&feeId= (task 0122)
/// The pupils with a tracked line (the uniform) on their invoice, each with the invoice's status and money paid, and whether the item was received: the list worked down when items are given out.
export const GET = withAuth(
  validate(
    { query },
    withBranch<Parsed<undefined, z.infer<typeof query>>, AuthContext, unknown>(
      { of: ({ query: q }) => q.branchId, as: "administer" },
      async (_req, _auth, _ctx, { query: q }) => {
        try {
          return noStore(ok(await handoverList(q.branchId, q.periodId, q.feeId)));
        } catch (error) {
          const known = feeItemFailure(error);
          if (known) return known;
          console.error("[HANDOVERS_GET_ERROR]", error);
          return fail("Unable to load the handover list", 500, "INTERNAL");
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
