import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { createFeeStructureSchema } from "@/lib/finance/validation";
import { listFeeStructures, createFeeStructure, FinanceError } from "@/lib/finance/service";
import { readJsonBody } from "@/lib/api/validate";

/**
 * GET /api/v1/finance/fee-structures?branchId=...&periodId=...&classGroupId=...
 */
export const GET = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      // Fees are an administrator's: a teacher, or an administrator of another branch, is refused (this used to answer anyone signed in with any branch's fees).
      if (!(await canAdminister(auth.userId, branchId))) {
        return fail("Forbidden: you do not administer this branch", 403, "FORBIDDEN");
      }

      const periodId = searchParams.get("periodId") ?? undefined;
      const classGroupId = searchParams.get("classGroupId") ?? undefined;

      const items = await listFeeStructures(branchId, { periodId, classGroupId });
      return ok(items);
    } catch (error) {
      console.error("[FEE_STRUCTURES_GET_ERROR]", error);
      return fail("Unable to retrieve fee structures", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);

/**
 * POST /api/v1/finance/fee-structures
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const read = await readJsonBody(req);
      if (!read.ok) return read.response;
      const body = read.json;
      const parsed = createFeeStructureSchema.safeParse(body);

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid fee structure payload", 400, "VALIDATION");
      }

      const { branchId, periodId, classGroupId, name, amount } = parsed.data;

      if (!(await canAdminister(auth.userId, branchId))) {
        return fail("Forbidden: You do not have permission to manage finance for this branch", 403, "FORBIDDEN");
      }

      const item = await createFeeStructure(branchId, {
        periodId,
        classGroupId: classGroupId ?? null,
        name,
        amount,
      });

      return ok(item, {}, 201);
    } catch (error) {
      if (error instanceof FinanceError) {
        return fail(error.message, 400, "FINANCE_ERROR");
      }
      console.error("[FEE_STRUCTURE_CREATE_ERROR]", error);
      return fail("Failed to create fee structure", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
