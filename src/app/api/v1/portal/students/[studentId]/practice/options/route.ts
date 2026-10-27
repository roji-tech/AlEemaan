import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate } from "@/lib/portal/guard";
import { getPracticeOptions, PracticeError } from "@/lib/question-bank/practice-service";

/**
 * GET /api/v1/portal/students/[studentId]/practice/options
 * Lists available practice subjects, topics, question pools, and remaining daily allowance.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await context.params;
  const gate = await portalGate(req, studentId, "overview");
  if (!gate.ok) return gate.response;

  try {
    const result = await getPracticeOptions({
      studentId,
      branchId: gate.branchId,
      actor: gate.session.actor,
    });
    return noStore(ok(result));
  } catch (err) {
    if (err instanceof PracticeError) {
      return noStore(fail(err.message, err.statusCode, err.code));
    }
    console.error("Portal practice options error:", err);
    return noStore(fail("Failed to load practice options", 500));
  }
}
