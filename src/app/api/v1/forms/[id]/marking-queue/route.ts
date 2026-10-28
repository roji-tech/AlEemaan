import { ok, fail } from "@/lib/api/envelope";
import { withAuthGated } from "@/lib/auth/branch-gate";
import {
  listPendingMarkingResponses,
  ManualMarkingError,
} from "@/lib/forms/manual-marking-service";
import { BANK_STAFF_ROLES, badId } from "@/lib/question-bank/items-http";
import { FormMarkingStatus } from "@prisma/client";

/**
 * GET /api/v1/forms/[id]/marking-queue?branchId=...&status=...
 * Lists responses requiring manual marking for a specific form.
 */
export const GET = withAuthGated(
  "staff-read",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const bad = badId(id);
    if (bad) return bad;

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    const statusParam = url.searchParams.get("status") as FormMarkingStatus | null;
    const markingStatus = statusParam && Object.values(FormMarkingStatus).includes(statusParam)
      ? statusParam
      : undefined;

    try {
      const data = await listPendingMarkingResponses({
        branchId,
        formId: id,
        markingStatus,
        actorUserId: auth.userId,
      });
      return ok({ responses: data });
    } catch (err) {
      if (err instanceof ManualMarkingError) {
        return fail(err.message, err.statusCode);
      }
      console.error("Get form marking queue error:", err);
      return fail("Failed to load marking queue", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
