import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { portalGate } from "@/lib/portal/guard";
import { getStudentPortalLms } from "@/lib/portal/service";

/**
 * GET /api/v1/portal/students/[studentId]/lms
 * Retrieves published coursework, assignments, and learning materials for a student.
 */
export async function GET(req: NextRequest, context?: { params?: Promise<{ studentId: string }> }) {
  const params = await context?.params;
  const gate = await portalGate(req, params?.studentId, "materials");
  if (!gate.ok) return gate.response;
  const { session, access } = gate;
  const studentId = params!.studentId;

  try {
    const lms = await getStudentPortalLms(studentId, session.allowedStudentIds);
    // An actor who may not take quizzes is not shown them either (task 0040): the questions are the pupil's to sit.
    return noStore(ok(access.takeQuizzes ? lms : { ...lms, quizzes: [] }));
  } catch (err: unknown) {
    console.error("Portal LMS error:", err);
    return noStore(fail("Failed to load coursework and materials", 500));
  }
}
