import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import { getPracticeSetForPupil, FormsServiceError } from "@/lib/forms/forms-service";

/**
 * GET /api/v1/portal/students/[studentId]/forms/practice-sets/[id]
 * Retrieves a practice set with scrubbed questions (no answer keys or explanations).
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
    const practiceSet = await getPracticeSetForPupil({
      formId,
      studentId,
      branchId: gate.branchId,
    });
    return noStore(ok({ practiceSet }));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal get practice set error:", err);
    return noStore(fail("Failed to load practice set", 500));
  }
}
