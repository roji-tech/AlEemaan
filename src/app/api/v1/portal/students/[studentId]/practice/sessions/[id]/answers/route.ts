import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import { readJsonBody } from "@/lib/api/validate";
import { submitPracticeAnswerSchema } from "@/lib/question-bank/validation";
import { submitPracticeAnswer, PracticeError } from "@/lib/question-bank/practice-service";

/**
 * POST /api/v1/portal/students/[studentId]/practice/sessions/[id]/answers
 * Submits an answer for a question in a practice session.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ studentId: string; id: string }> },
) {
  if (!validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const { studentId, id: sessionId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);
  const parsed = submitPracticeAnswerSchema.safeParse(read.json);
  if (!parsed.success) {
    return noStore(fail(parsed.error.issues[0]?.message ?? "Invalid answer payload", 400, "VALIDATION"));
  }

  try {
    const result = await submitPracticeAnswer({
      studentId,
      branchId: gate.branchId,
      actor: gate.session.actor,
      sessionId,
      bankItemId: parsed.data.bankItemId,
      answer: parsed.data.answer,
    });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof PracticeError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal practice answer error:", err);
    return noStore(fail("Failed to submit practice answer", 500));
  }
}
