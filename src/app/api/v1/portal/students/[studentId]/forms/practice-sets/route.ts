import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import {
  listAvailablePracticeSetsForPupil,
  FormsServiceError,
} from "@/lib/forms/forms-service";

/**
 * GET /api/v1/portal/students/[studentId]/forms/practice-sets
 * Lists published practice sets open for this pupil's class.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  try {
    const practiceSets = await listAvailablePracticeSetsForPupil({
      studentId,
      branchId: gate.branchId,
    });
    return noStore(ok({ practiceSets }));
  } catch (err) {
    if (err instanceof FormsServiceError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal list practice sets error:", err);
    return noStore(fail("Failed to load practice sets", 500));
  }
}
