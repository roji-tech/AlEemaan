import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import {
  requestMarkingForPupil,
  PaperWorkError,
} from "@/lib/forms/paper-work-service";
import { badId } from "@/lib/question-bank/items-http";

/**
 * POST /api/v1/portal/students/[studentId]/forms/paper-work/[id]/request-marking
 * Pupil requests marking on a pending paper work assignment.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ studentId: string; id: string }> }
) {
  const { studentId, id } = await context.params;
  const bad = badId(id);
  if (bad) return bad;

  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  if (gate.session.actor !== "PUPIL") {
    return noStore(fail(PORTAL_REFUSED, 403, "PORTAL_ACCESS"));
  }

  try {
    const result = await requestMarkingForPupil(
      gate.branchId,
      studentId,
      id
    );
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof PaperWorkError) {
      return noStore(fail(err.message, err.statusCode));
    }
    console.error("Portal request marking error:", err);
    return noStore(fail("Failed to request marking", 500));
  }
}
