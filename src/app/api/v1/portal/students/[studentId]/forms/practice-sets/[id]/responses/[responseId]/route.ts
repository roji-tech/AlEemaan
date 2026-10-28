import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import {
  getPupilResponseWithMarking,
  ManualMarkingError,
} from "@/lib/forms/manual-marking-service";

/**
 * GET /api/v1/portal/students/[studentId]/forms/practice-sets/[id]/responses/[responseId]
 * Retrieves student's submission result with manual marking rules applied:
 * - Pending manual questions withhold scores, explanations, and answer keys.
 * - Marked manual questions reveal teacher feedback and awarded score.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ studentId: string; id: string; responseId: string }> },
) {
  const { studentId, id: formId, responseId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  try {
    const result = await getPupilResponseWithMarking({
      branchId: gate.branchId,
      studentId,
      formId,
      responseId,
    });
    return noStore(ok({ response: result }));
  } catch (err) {
    if (err instanceof ManualMarkingError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal get practice set response error:", err);
    return noStore(fail("Failed to load response result", 500));
  }
}
