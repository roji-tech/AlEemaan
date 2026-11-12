import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { getInvoice } from "@/lib/finance/service";
import { loadEffectivePolicy } from "@/lib/finance/part-payment-service";
import { describePolicy, minimumFor } from "@/lib/finance/part-payment";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/finance/invoices/[id]?branchId=...
 */
export const GET = withAuth(
  async (req: NextRequest, auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      // One invoice: an administrator of the branch it belongs to (any signed-in staff or student account could read any invoice by id before).
      if (!(await canAdminister(auth.userId, branchId))) {
        return fail("Invoice not found or access denied", 404, "NOT_FOUND");
      }

      const invoice = await getInvoice(branchId, id);
      // What may be paid on it now (task 0046): the sentence, and whether and how small a part can be (the screens show the sentence; the payment routes decide).
      const policy = await loadEffectivePolicy(prisma, branchId);
      const partsAllowed = policy.allowed && !invoice.payInFull;
      return ok({
        ...invoice,
        partPayment: {
          allowed: partsAllowed,
          smallest: partsAllowed ? minimumFor(policy, invoice.totalAmount).toString() : null,
          text: describePolicy(policy, invoice.totalAmount, invoice.payInFull),
        },
      });
    } catch (error) {
      console.error("[INVOICE_GET_ERROR]", error);
      return fail("Invoice not found or access denied", 404, "NOT_FOUND");
    }
  },
  { roles: [Role.ADMIN] },
);
