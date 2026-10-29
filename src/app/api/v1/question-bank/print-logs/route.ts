import { withAuthGated } from "@/lib/auth/branch-gate";
import { ok, fail } from "@/lib/api/envelope";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";
import { listPrintLogs } from "@/lib/question-bank/printing-service";
import { PrintTargetKind } from "@prisma/client";

/**
 * GET /api/v1/question-bank/print-logs
 * Retrieves print audit logs for a branch (ADR 0014 branch-scoped).
 */
export const GET = withAuthGated(
  "staff-read",
  async (req) => {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId");
    if (!branchId) {
      return fail("branchId query parameter is required", 400, "VALIDATION");
    }

    const userId = searchParams.get("userId") || undefined;
    const targetKindParam = searchParams.get("targetKind");
    const targetKind = targetKindParam && Object.values(PrintTargetKind).includes(targetKindParam as PrintTargetKind)
      ? (targetKindParam as PrintTargetKind)
      : undefined;
    const targetId = searchParams.get("targetId") || undefined;

    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);

    const result = await listPrintLogs({
      branchId,
      userId,
      targetKind,
      targetId,
      page,
      pageSize,
    });

    return ok(result);
  },
  { roles: BANK_STAFF_ROLES },
);
