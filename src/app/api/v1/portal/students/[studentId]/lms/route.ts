import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { getPortalSession } from "@/lib/portal/auth";
import { getStudentPortalLms } from "@/lib/portal/service";

/**
 * GET /api/v1/portal/students/[studentId]/lms
 * Retrieves published coursework, assignments, and learning materials for a student.
 */
export async function GET(req: NextRequest, context?: { params?: Promise<{ studentId: string }> }) {
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
    const lms = await getStudentPortalLms(studentId, session.allowedStudentIds);
    return noStore(ok(lms));
  } catch (err: unknown) {
    console.error("Portal LMS error:", err);
    return noStore(fail("Failed to load coursework and materials", 500));
  }
}
