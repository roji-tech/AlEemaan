import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { applyDiscountSchema } from "@/lib/finance/validation";
import { applyDiscount, FinanceError } from "@/lib/finance/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/finance/invoices/[id]/discount?branchId=...
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
        return fail("Forbidden: You do not have permission to apply discounts for this branch", 403, "FORBIDDEN");
      }

      const body = await req.json();
      const parsed = applyDiscountSchema.safeParse(body);

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid discount payload", 400, "VALIDATION");
      }

      const discount = await applyDiscount(branchId, id, {
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        mode: parsed.data.mode,
        appliedByUserId: auth.user.id,
      });

      return ok(discount, {}, 201);
    } catch (error) {
      if (error instanceof FinanceError) {
        return fail(error.message, 400, "FINANCE_ERROR");
      }
      console.error("[INVOICE_APPLY_DISCOUNT_ERROR]", error);
      return fail("Failed to apply discount", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
