import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import {
  listAvailablePaperWorkForPupil,
  PaperWorkError,
} from "@/lib/forms/paper-work-service";

/**
 * GET /api/v1/portal/students/[studentId]/forms/paper-work
 * Lists paper work assignments open for this pupil.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  try {
    const forms = await listAvailablePaperWorkForPupil(
      gate.branchId,
      studentId
    );
    return noStore(ok({ forms }));
  } catch (err) {
    if (err instanceof PaperWorkError) {
      return noStore(fail(err.message, err.statusCode));
    }
    console.error("Portal list paper work error:", err);
    return noStore(fail("Failed to load paper work", 500));
  }
}
