import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { applyProgramDiscount } from "@/lib/programs/fees-service";
import { discountSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ id: string; invoiceId: string }> };

/** POST /api/v1/programs/[id]/fees/invoices/[invoiceId]/discounts { amount, reason } - a discount, kept with who and why; never below what was paid (409 `DISCOUNT_TOO_LARGE`). A super admin, a program admin, or the administrator of the invoice's branch. */
export const POST = withAuth(
  validate({ body: discountSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, invoiceId } = await params;
    return respond(await applyProgramDiscount(auth.userId, id, invoiceId, body), 201);
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
