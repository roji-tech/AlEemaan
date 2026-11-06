import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { fail } from "@/lib/api/envelope";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { startProgramGatewayPayment } from "@/lib/programs/fees-payments";
import { gatewaySchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ id: string; invoiceId: string }> };

/**
 * POST /api/v1/programs/[id]/fees/invoices/[invoiceId]/pay { email, amount? }
 * Starts a payment through the gateway (the whole balance unless an amount is given, subject to the part-payment rule). Returns the gateway's address for the payer; the signed webhook
 * completes it. No callback address is taken from the request. Same people as recording a payment; rate limited.
 */
export const POST = withAuth(
  validate({ body: gatewaySchema }, async (_req, auth, { params }: Ctx, { body }) => {
    if (!(await reserveAttempt(`program-payment:${auth.userId}`, 120)))
      return fail("Too many payments. Please try again in a few minutes.", 429, "RATE_LIMITED");
    const { id, invoiceId } = await params;
    return respond(await startProgramGatewayPayment(auth.userId, id, invoiceId, body), 201);
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
