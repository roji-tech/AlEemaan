import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { getInvoice } from "@/lib/finance/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/finance/invoices/[id]?branchId=...
 */
export const GET = withAuth(
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const invoice = await getInvoice(branchId, id);
      return ok(invoice);
    } catch (error) {
      console.error("[INVOICE_GET_ERROR]", error);
      return fail("Invoice not found or access denied", 404, "NOT_FOUND");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT] },
);
