import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import { getQuestionnaireForMember } from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

/**
 * GET /api/v1/portal/students/[studentId]/forms/questionnaires/[id]
 * Retrieves a questionnaire for a pupil.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ studentId: string; id: string }> },
) {
  const { studentId, id: formId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  try {
    const questionnaire = await getQuestionnaireForMember({
      formId,
      memberId: studentId,
      memberRole: "STUDENT",
      branchId: gate.branchId,
    });
    return noStore(ok({ questionnaire }));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal get questionnaire error:", err);
    return noStore(fail("Failed to load questionnaire", 500));
  }
}
