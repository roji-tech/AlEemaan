import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { getPromotionBatch } from "@/lib/promotion/service";

/**
 * GET /api/v1/academics/promotion/batches/[id]
 * Retrieves details and records for a promotion batch.
 */
export const GET = withAuth(
  async (req: NextRequest, _auth: AuthContext, context?: { params?: Promise<{ id: string }> }) => {
    try {
      const params = await context?.params;
      const id = params?.id;
      if (!id) {
        return fail("Promotion batch ID is required", 400, "VALIDATION");
      }

      const url = new URL(req.url);
      const branchId = url.searchParams.get("branchId");
      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const batch = await getPromotionBatch(branchId, id);
      if (!batch) {
        return fail("Promotion batch not found", 404, "NOT_FOUND");
      }

      return ok(batch);
    } catch (error) {
      console.error("[PROMOTION_BATCH_GET_ERROR]", error);
      return fail("Unable to get promotion batch", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] }
);
