import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { getInvoice, setProgramPayInFull } from "@/lib/programs/fees-service";
import { invoicePatchSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ id: string; invoiceId: string }> };

/** GET /api/v1/programs/[id]/fees/invoices/[invoiceId] - the invoice with its lines, payments, discounts and the part-payment rule in words. */
export const GET = withAuth(
  async (_req, auth, { params }: Ctx) => {
    const { id, invoiceId } = await params;
    return respond(await getInvoice(auth.userId, id, invoiceId));
  },
  { roles: PROGRAM_ROUTE_ROLES },
);

/** PATCH /api/v1/programs/[id]/fees/invoices/[invoiceId] { payInFull } - "pay in full only" on one invoice. A super admin, a program admin, or the administrator of the invoice's branch. */
export const PATCH = withAuth(
  validate({ body: invoicePatchSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, invoiceId } = await params;
    return respond(await setProgramPayInFull(auth.userId, id, invoiceId, body.payInFull));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
