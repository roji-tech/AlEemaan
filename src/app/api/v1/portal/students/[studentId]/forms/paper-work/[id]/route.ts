import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate, PORTAL_REFUSED } from "@/lib/portal/guard";
import {
  getPaperWorkForPupil,
  PaperWorkError,
} from "@/lib/forms/paper-work-service";
import { badId } from "@/lib/question-bank/items-http";

/**
 * GET /api/v1/portal/students/[studentId]/forms/paper-work/[id]
 * Gets paper work details and submission status for pupil.
 */
export async function GET(
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
    const data = await getPaperWorkForPupil(gate.branchId, studentId, id);
    return noStore(ok(data));
  } catch (err) {
    if (err instanceof PaperWorkError) {
      return noStore(fail(err.message, err.statusCode));
    }
    console.error("Portal get paper work error:", err);
    return noStore(fail("Failed to load paper work", 500));
  }
}
