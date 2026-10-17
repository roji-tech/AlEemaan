import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { QueryDispatchesSchema } from "@/lib/communication/validation";
import { listDispatches } from "@/lib/communication/service";

/**
 * GET /api/v1/communication/dispatches?branchId=...&status=...&channel=...&search=...&page=...&limit=...
 */
export const GET = withAuth(
  async (req: NextRequest) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const parsed = QueryDispatchesSchema.safeParse(Object.fromEntries(searchParams.entries()));
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid query parameters", 400, "VALIDATION");
      }

      const dispatches = await listDispatches(branchId, parsed.data);
      return ok(dispatches);
    } catch (error) {
      console.error("[COMMUNICATION_DISPATCHES_LIST_ERROR]", error);
      return fail("Unable to retrieve communication dispatches", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] }
);
