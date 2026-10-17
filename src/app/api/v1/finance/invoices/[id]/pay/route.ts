import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { initializePaymentSchema } from "@/lib/finance/validation";
import { initializeGatewayPayment, FinanceError } from "@/lib/finance/service";

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

      const body = await req.json();
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
      console.error("[INVOICE_PAY_INIT_ERROR]", error);
      return fail("Failed to initialize payment", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT] },
);
