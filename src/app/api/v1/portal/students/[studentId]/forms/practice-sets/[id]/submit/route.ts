import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import { readJsonBody } from "@/lib/api/validate";
import { submitFormAnswersSchema, idSchema } from "@/lib/forms/validation";
import { submitPracticeSetForPupil, FormsServiceError } from "@/lib/forms/forms-service";

const SubmitBody = submitFormAnswersSchema.extend({
  responseId: idSchema,
});

/**
 * POST /api/v1/portal/students/[studentId]/forms/practice-sets/[id]/submit
 * Submits pupil answers, evaluates accuracy, and reveals full explanations and answer keys.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ studentId: string; id: string }> },
) {
  if (!validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const { studentId, id: formId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);

  const parsed = SubmitBody.safeParse(read.json);
  if (!parsed.success) {
    return noStore(fail(parsed.error.issues[0]?.message ?? "Invalid submission payload", 400, "VALIDATION"));
  }

  try {
    const result = await submitPracticeSetForPupil({
      formId,
      responseId: parsed.data.responseId,
      studentId,
      branchId: gate.branchId,
      answers: parsed.data.answers,
    });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal submit practice set error:", err);
    return noStore(fail("Failed to submit practice set", 500));
  }
}
