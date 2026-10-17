import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { recordPaymentSchema } from "@/lib/finance/validation";
import { recordManualPayment, FinanceError } from "@/lib/finance/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/finance/invoices/[id]/record-payment?branchId=...
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

      if (!(await canAdminister(auth.userId, branchId))) {
        return fail("Forbidden: You do not have permission to record payments for this branch", 403, "FORBIDDEN");
      }

      const body = await req.json();
      const parsed = recordPaymentSchema.safeParse(body);

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid payment record payload", 400, "VALIDATION");
      }

      const payment = await recordManualPayment(branchId, id, {
        amount: parsed.data.amount,
        channel: parsed.data.channel,
        reference: parsed.data.reference,
        paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
        notes: parsed.data.notes,
        recordedByUserId: auth.user.id,
      });

      return ok(payment, {}, 201);
    } catch (error) {
      if (error instanceof FinanceError) {
        return fail(error.message, 400, "FINANCE_ERROR");
      }
      console.error("[INVOICE_RECORD_PAYMENT_ERROR]", error);
      return fail("Failed to record manual payment", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
