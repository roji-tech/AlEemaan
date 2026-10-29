import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate } from "@/lib/portal/guard";
import { getStudentPortalOverview } from "@/lib/portal/service";

/**
 * GET /api/v1/portal/students/[studentId]/overview
 * Retrieves student enrollment, attendance summary, recent announcements, and invoice totals.
 */
export async function GET(req: NextRequest, context?: { params?: Promise<{ studentId: string }> }) {
  const params = await context?.params;
  const gate = await portalGate(req, params?.studentId, "overview");
  if (!gate.ok) return gate.response;
  const { session, access } = gate;
  const studentId = params!.studentId;

  try {
    const overview = await getStudentPortalOverview(studentId, session.allowedStudentIds, access.invoices);
    return noStore(ok(overview));
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "STUDENT_NOT_FOUND") {
      return noStore(fail("Student record not found", 404));
    }
    console.error("Portal overview error:", err);
    return noStore(fail("Failed to load student overview", 500));
  }
}
