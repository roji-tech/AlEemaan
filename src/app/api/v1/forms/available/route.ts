import { ok, fail } from "@/lib/api/envelope";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { listAvailableQuestionnairesForStaff } from "@/lib/forms/questionnaires-service";
import { heldRoleIn } from "@/lib/auth/branch-access";
import { FormsServiceError } from "@/lib/forms/forms-service";
import { BANK_STAFF_ROLES } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/forms/available
 * Lists published questionnaires available for the signed-in staff member.
 */
export const GET = withAuthGated(
  "staff-read",
  async (req, auth) => {
    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId");
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    const role = await heldRoleIn(auth.userId, branchId);
    const userRole = role ?? "TEACHING_STAFF";

    try {
      const questionnaires = await listAvailableQuestionnairesForStaff({
        userId: auth.userId,
        userRole,
        branchId,
      });
      return ok({ questionnaires });
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("List available questionnaires error:", err);
      return fail("Failed to list available questionnaires", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
