import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { submitQuestionnaireForMember } from "@/lib/forms/questionnaires-service";
import { submitQuestionnaireSchema } from "@/lib/forms/validation";
import { heldRoleIn } from "@/lib/auth/branch-access";
import { FormsServiceError } from "@/lib/forms/forms-service";
import { BANK_STAFF_ROLES, badId } from "@/lib/question-bank/items-http";

/**
 * POST /api/v1/forms/[id]/submit
 * Signed-in staff member submits questionnaire responses.
 */
export const POST = withAuthGated(
  "staff-read",
  async (req, auth, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    const bad = badId(id);
    if (bad) return bad;

    const read = await readJsonBody(req);
    if (!read.ok) return read.response;

    const parsed = submitQuestionnaireSchema.safeParse(read.json);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid questionnaire submission", 400, "VALIDATION");
    }

    const url = new URL(req.url);
    const branchId = url.searchParams.get("branchId") || (read.json as { branchId?: string })?.branchId;
    if (!branchId) return fail("Branch ID is required", 400, "VALIDATION");

    const role = await heldRoleIn(auth.userId, branchId);
    const memberRole = role ?? "TEACHING_STAFF";

    try {
      const result = await submitQuestionnaireForMember({
        formId: id,
        memberId: auth.userId,
        isStudent: false,
        memberRole,
        branchId,
        answers: parsed.data.answers,
      });
      return ok(result);
    } catch (err) {
      if (err instanceof FormsServiceError) {
        return fail(err.message, err.statusCode, err.code);
      }
      console.error("Submit questionnaire error:", err);
      return fail("Failed to submit questionnaire", 500);
    }
  },
  { roles: BANK_STAFF_ROLES },
);
