import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import {
  listAvailableQuestionnairesForPupil,
} from "@/lib/forms/questionnaires-service";
import { FormsServiceError } from "@/lib/forms/forms-service";

/**
 * GET /api/v1/portal/students/[studentId]/forms/questionnaires
 * Lists published questionnaires open for this pupil.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  try {
    const questionnaires = await listAvailableQuestionnairesForPupil({
      studentId,
      branchId: gate.branchId,
    });
    return noStore(ok({ questionnaires }));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal list questionnaires error:", err);
    return noStore(fail("Failed to load questionnaires", 500));
  }
}
