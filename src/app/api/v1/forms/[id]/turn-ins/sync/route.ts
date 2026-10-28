import { ok, fail } from "@/lib/api/envelope";
import { withAuthGated } from "@/lib/auth/branch-gate";
import {
  syncRosterForPaperWork,
  PaperWorkError,
} from "@/lib/forms/paper-work-service";
import { BANK_STAFF_ROLES, badId } from "@/lib/question-bank/items-http";

/**
 * POST /api/v1/forms/[id]/turn-ins/sync
 * Synchronizes newly enrolled pupils into the paper work roll call roster.
 */
export const POST = withAuthGated(
  "staff-write",
  async (req, _auth, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const bad = badId(id);
    if (bad) return bad;

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    try {
      const result = await syncRosterForPaperWork(branchId, id);
      return ok(result);
    } catch (err) {
      if (err instanceof PaperWorkError) {
        return fail(err.message, err.statusCode);
      }
      console.error("Sync roll call roster error:", err);
      return fail("Failed to sync roster", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
