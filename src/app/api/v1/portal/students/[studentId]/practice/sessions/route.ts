import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import { readJsonBody } from "@/lib/api/validate";
import { startPracticeSessionSchema } from "@/lib/question-bank/validation";
import { startPracticeSession, PracticeError } from "@/lib/question-bank/practice-service";

/**
 * POST /api/v1/portal/students/[studentId]/practice/sessions
 * Starts a randomized pupil practice session with questions scrubbed of answers.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ studentId: string }> }) {
  if (!validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const { studentId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);
  const parsed = startPracticeSessionSchema.safeParse(read.json ?? {});
  if (!parsed.success) {
    return noStore(fail(parsed.error.issues[0]?.message ?? "Invalid session options", 400, "VALIDATION"));
  }

  try {
    const result = await startPracticeSession({
      studentId,
      branchId: gate.branchId,
      actor: gate.session.actor,
      subjectLabel: parsed.data.subjectLabel,
      topic: parsed.data.topic,
      size: parsed.data.size,
      feedbackMode: parsed.data.feedbackMode,
    });
    return noStore(ok(result, {}, 201));
  } catch (err) {
    if (err instanceof PracticeError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal practice start error:", err);
    return noStore(fail("Failed to start practice session", 500));
  }
}
