import { ok, fail } from "@/lib/api/envelope";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { getPracticeSetResponsesForStaff, FormsServiceError } from "@/lib/forms/forms-service";
import { BANK_STAFF_ROLES, badId } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/forms/[id]/responses
 * Staff overview of pupil completions and scores.
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

    try {
      const responses = await getPracticeSetResponsesForStaff({
        formId: id,
        branchId,
      });
      return ok({ responses });
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Get form responses error:", err);
      return fail("Failed to load responses", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
