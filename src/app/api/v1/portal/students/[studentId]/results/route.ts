import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate } from "@/lib/portal/guard";
import { getStudentPortalResults } from "@/lib/portal/service";

/**
 * GET /api/v1/portal/students/[studentId]/results
 * Retrieves published academic results and report cards for a student.
 */
export async function GET(req: NextRequest, context?: { params?: Promise<{ studentId: string }> }) {
  const params = await context?.params;
  const gate = await portalGate(req, params?.studentId, "results");
  if (!gate.ok) return gate.response;
  const { session, access } = gate;
  const studentId = params!.studentId;

  try {
    const results = await getStudentPortalResults(studentId, session.allowedStudentIds, access.invoices);
    return noStore(ok(results));
  } catch (err: unknown) {
    console.error("Portal results error:", err);
    return noStore(fail("Failed to load student results", 500));
  }
}
