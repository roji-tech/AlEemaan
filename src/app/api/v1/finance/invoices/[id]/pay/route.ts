import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { initializePaymentSchema } from "@/lib/finance/validation";
import { initializeGatewayPayment, FinanceError } from "@/lib/finance/service";
import { PaymentsNotConfiguredError } from "@/lib/finance/paystack";
import { readJsonObject } from "@/lib/api/validate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/finance/invoices/[id]/pay?branchId=...
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      // Starting a gateway payment for an invoice is an administrator's act in the branch the invoice belongs to (any signed-in account could start one for any invoice).
      if (!(await canAdminister(auth.userId, branchId))) {
        return fail("Invoice not found or access denied", 404, "NOT_FOUND");
      }

      const read = await readJsonObject(req);
      if (!read.ok) return read.response;
      const body = read.json;
      const parsed = initializePaymentSchema.safeParse({ ...body, invoiceId: id });

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid payment initialization payload", 400, "VALIDATION");
      }

      const result = await initializeGatewayPayment(branchId, {
        invoiceId: id,
        email: parsed.data.email,
        amount: parsed.data.amount,
        callbackUrl: parsed.data.callbackUrl,
      });

      return ok(result);
    } catch (error) {
      if (error instanceof FinanceError) {
        return fail(error.message, 400, "FINANCE_ERROR");
      }
      // No Paystack key on a production-shaped server (or the mock forced there): say so plainly, and nothing was started (the payment row is rolled back).
      if (error instanceof PaymentsNotConfiguredError) {
        return fail("Online payments are not set up on this server yet.", 503, "PAYMENTS_NOT_CONFIGURED");
      }
      console.error("[INVOICE_PAY_INIT_ERROR]", error);
      return fail("Failed to initialize payment", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
