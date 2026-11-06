import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { addFeeToOpenInvoices } from "@/lib/programs/fees-service";
import { addToOpenSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** POST /api/v1/programs/[id]/fees/items/[itemId]/add-to-open { periodKey } - add a fee made later to the invoices of that period that have no payment and no discount (never to a paid or part-paid one). Audited. */
export const POST = withAuth(
  validate({ body: addToOpenSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, itemId } = await params;
    return respond(await addFeeToOpenInvoices(auth.userId, id, itemId, body.periodKey));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
