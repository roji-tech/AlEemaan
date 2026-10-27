import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate } from "@/lib/portal/guard";
import { getPracticeHistory, PracticeError } from "@/lib/question-bank/practice-service";

/**
 * GET /api/v1/portal/students/[studentId]/practice/history
 * Returns pupil practice history: full detailed history for pupil, or aggregated summary for guardian.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const archived = url.searchParams.get("archived") === "true";

  try {
    const result = await getPracticeHistory({
      studentId,
      branchId: gate.branchId,
      actor: gate.session.actor,
      archived,
    });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof PracticeError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal practice history error:", err);
    return noStore(fail("Failed to load practice history", 500));
  }
}
