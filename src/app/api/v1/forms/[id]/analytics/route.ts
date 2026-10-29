import { ok, fail } from "@/lib/api/envelope";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { getQuestionnaireAnalytics } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";
import { BANK_STAFF_ROLES, badId } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/forms/[id]/analytics
 * Staff analytics endpoint returning statistical aggregates and option distributions for questionnaires.
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
      const analytics = await getQuestionnaireAnalytics({
        formId: id,
        branchId,
        actorUserId: auth.userId,
      });
      return ok({ analytics });
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Get questionnaire analytics error:", err);
      return fail("Failed to load questionnaire analytics", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
