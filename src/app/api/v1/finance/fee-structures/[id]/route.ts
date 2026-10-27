import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { updateFeeStructureSchema } from "@/lib/finance/validation";
import { updateFeeStructure, deleteFeeStructure, FinanceError } from "@/lib/finance/service";
import { readJsonBody } from "@/lib/api/validate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/finance/fee-structures/[id]?branchId=...
 */
export const PATCH = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      if (!(await canAdminister(auth.userId, branchId))) {
        return fail("Forbidden: You do not have permission to manage finance for this branch", 403, "FORBIDDEN");
      }

      const read = await readJsonBody(req);
      if (!read.ok) return read.response;
      const body = read.json;
      const parsed = updateFeeStructureSchema.safeParse(body);

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid update payload", 400, "VALIDATION");
      }

      const updated = await updateFeeStructure(branchId, id, parsed.data);
      return ok(updated);
    } catch (error) {
      if (error instanceof FinanceError) {
        return fail(error.message, 400, "FINANCE_ERROR");
      }
      console.error("[FEE_STRUCTURE_UPDATE_ERROR]", error);
      return fail("Failed to update fee structure", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);

/**
 * DELETE /api/v1/finance/fee-structures/[id]?branchId=...
 */
export const DELETE = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      if (!(await canAdminister(auth.userId, branchId))) {
        return fail("Forbidden: You do not have permission to manage finance for this branch", 403, "FORBIDDEN");
      }

      await deleteFeeStructure(branchId, id);
      return ok({ deleted: true });
    } catch (error) {
      console.error("[FEE_STRUCTURE_DELETE_ERROR]", error);
      return fail("Failed to delete fee structure", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
