import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate } from "@/lib/portal/guard";
import { getPracticeSessionToResume, PracticeError } from "@/lib/question-bank/practice-service";

/**
 * GET /api/v1/portal/students/[studentId]/practice/sessions/[id]
 * Opens a session the pupil started and did not finish: the questions not yet answered (no keys), so they can carry on. Only the pupil's own session; a finished one is refused.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ studentId: string; id: string }> }) {
  const { studentId, id: sessionId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  try {
    const result = await getPracticeSessionToResume({
      studentId,
      branchId: gate.branchId,
      actor: gate.session.actor,
      sessionId,
    });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof PracticeError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal practice resume error:", err);
    return noStore(fail("Failed to open the practice session", 500));
  }
}
