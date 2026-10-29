import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { portalGate } from "@/lib/portal/guard";
import { readJsonBody } from "@/lib/api/validate";
import { archivePracticeAttemptSchema } from "@/lib/question-bank/validation";
import { archivePracticeAttempt, PracticeError } from "@/lib/question-bank/practice-service";

/**
 * PATCH /api/v1/portal/students/[studentId]/practice/history/[id]
 * Sets the archived status of a practice attempt.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ studentId: string; id: string }> },
) {
  if (!validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const { studentId, id: attemptId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);
  const parsed = archivePracticeAttemptSchema.safeParse(read.json);
  if (!parsed.success) {
    return noStore(fail(parsed.error.issues[0]?.message ?? "Invalid archive payload", 400, "VALIDATION"));
  }

  try {
    const result = await archivePracticeAttempt({
      studentId,
      branchId: gate.branchId,
      actor: gate.session.actor,
      attemptId,
      archived: parsed.data.archived,
    });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof PracticeError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal practice archive error:", err);
    return noStore(fail("Failed to update archive status", 500));
  }
}
