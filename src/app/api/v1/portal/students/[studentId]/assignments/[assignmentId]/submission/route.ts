import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { getPortalSession } from "@/lib/portal/auth";
import { submitPortalAssignment, PortalLmsError } from "@/lib/portal/service";
import { LmsError } from "@/lib/lms/service";
import { submitAssignmentSchema } from "@/lib/lms/validation";
import { readJsonBody } from "@/lib/api/validate";

/**
 * POST /api/v1/portal/students/[studentId]/assignments/[assignmentId]/submission
 * A pupil (or a guardian for a linked pupil) hands in coursework. The pupil is the one the portal session is for, never one named by the client.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ studentId: string; assignmentId: string }> }) {
  if (!validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const session = getPortalSession(req);
  if (!session) return noStore(fail("Portal session expired or unauthorized", 401));

  const { studentId, assignmentId } = await context.params;
  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);
  const body = read.json;
  const parsed = submitAssignmentSchema.safeParse(body);
  if (!parsed.success) return noStore(fail(parsed.error.issues[0]?.message ?? "Invalid submission", 400, "VALIDATION"));

  try {
    const submission = await submitPortalAssignment(studentId, session.allowedStudentIds, assignmentId, parsed.data);
    return noStore(ok({ status: submission.status, submittedAt: submission.submittedAt }, {}, 201));
  } catch (err) {
    if (err instanceof PortalLmsError || err instanceof LmsError) {
      return noStore(fail(err.message, err instanceof PortalLmsError ? err.status : err.statusCode));
    }
    console.error("Portal submission error:", err);
    return noStore(fail("Unable to hand in this work", 500));
  }
}
