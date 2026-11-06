import { z } from "zod";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { setPayInFull } from "@/lib/finance/part-payment-service";
import { payInFullSchema } from "@/lib/finance/part-payment-validation";

type Ctx = { params: Promise<{ id: string }> };

const branchQuery = z.object({ branchId: z.string().min(1, "branchId query parameter is required") });
type Input = Parsed<z.infer<typeof payInFullSchema>, z.infer<typeof branchQuery>>;

/**
 * PATCH /api/v1/finance/invoices/[id]/pay-in-full?branchId=... { payInFull: boolean }
 * An administrator of the invoice's branch marks one open invoice "pay in full" (no part payments on it), or clears the mark. It only tightens what the school's rule says,
 * and never allows what it forbids. Audited. A branch that is not the caller's to administer answers 404, the same as an invoice that does not exist.
 */
export const PATCH = withAuth(
  validate(
    { body: payInFullSchema, query: branchQuery },
    withBranch<Input, AuthContext, Ctx>(
      {
        of: ({ query }) => query.branchId,
        as: "administer",
        refuse: () => fail("Invoice not found or access denied", 404, "NOT_FOUND"),
      },
      async (_req, auth, { params }, { body }, { branchId }) => {
        const result = await setPayInFull(auth.userId, branchId, (await params).id, body.payInFull);
        return result.ok ? ok(result.data) : fail(result.message, result.status, result.code);
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
