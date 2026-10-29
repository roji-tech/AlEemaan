import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import { startPracticeSetForPupil, FormsServiceError } from "@/lib/forms/forms-service";

/**
 * POST /api/v1/portal/students/[studentId]/forms/practice-sets/[id]/start
 * Starts or resumes a response session for a practice set.
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

  try {
    const result = await startPracticeSetForPupil({
      formId,
      studentId,
      branchId: gate.branchId,
    });
    return noStore(ok(result, {}, 201));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal start practice set error:", err);
    return noStore(fail("Failed to start practice set", 500));
  }
}
