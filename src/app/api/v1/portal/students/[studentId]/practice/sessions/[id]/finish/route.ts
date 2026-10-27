import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { portalGate } from "@/lib/portal/guard";
import { finishPracticeSession, PracticeError } from "@/lib/question-bank/practice-service";

/**
 * POST /api/v1/portal/students/[studentId]/practice/sessions/[id]/finish
 * Finalizes a practice session and returns performance summary and answer explanations.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ studentId: string; id: string }> },
) {
  if (!validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const { studentId, id: sessionId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  try {
    const result = await finishPracticeSession({
      studentId,
      branchId: gate.branchId,
      sessionId,
    });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof PracticeError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal practice finish error:", err);
    return noStore(fail("Failed to finish practice session", 500));
  }
}
