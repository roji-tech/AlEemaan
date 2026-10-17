import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { getPortalSession } from "@/lib/portal/auth";
import { getStudentPortalOverview } from "@/lib/portal/service";

/**
 * GET /api/v1/portal/students/[studentId]/overview
 * Retrieves student enrollment, attendance summary, recent announcements, and invoice totals.
 */
export async function GET(
  req: NextRequest,
  context?: { params?: Promise<{ studentId: string }> }
) {
  const session = getPortalSession(req);
  if (!session) {
    return noStore(fail("Portal session expired or unauthorized", 401));
  }

  const params = await context?.params;
  const studentId = params?.studentId;
  if (!studentId) {
    return noStore(fail("Student ID is required", 400));
  }

  if (!session.allowedStudentIds.includes(studentId)) {
    return noStore(fail("You are not authorized to view this student", 403));
  }

  try {
    const overview = await getStudentPortalOverview(studentId, session.allowedStudentIds);
    return noStore(ok(overview));
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "STUDENT_NOT_FOUND") {
      return noStore(fail("Student record not found", 404));
    }
    console.error("Portal overview error:", err);
    return noStore(fail("Failed to load student overview", 500));
  }
}
