import { ok, fail } from "@/lib/api/envelope";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { closePracticeSet, FormsServiceError } from "@/lib/forms/forms-service";
import { badId, FORM_STAFF_ROLES } from "@/lib/question-bank/items-http";

/**
 * POST /api/v1/forms/[id]/close
 * Closes a practice set so pupils can no longer submit answers.
 */
export const POST = withAuthGated(
  "staff-write",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const bad = badId(id);
    if (bad) return bad;

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    try {
      const result = await closePracticeSet({
        formId: id,
        branchId,
        userId: auth.userId,
      });
      return ok(result);
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Close form error:", err);
      return fail("Failed to close form", 500);
    }
  },
  { roles: FORM_STAFF_ROLES },
);
