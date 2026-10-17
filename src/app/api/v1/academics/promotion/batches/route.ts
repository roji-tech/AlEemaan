import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { listPromotionBatches } from "@/lib/promotion/service";

/**
 * GET /api/v1/academics/promotion/batches
 * Lists promotion audit batches for a branch.
 */
export const GET = withAuth(
  async (req: NextRequest) => {
    try {
      const url = new URL(req.url);
      const branchId = url.searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const batches = await listPromotionBatches(branchId);
      return ok({ batches });
    } catch (error) {
      console.error("[PROMOTION_BATCHES_LIST_ERROR]", error);
      return fail("Unable to list promotion batches", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
