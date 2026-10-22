import { NextRequest } from "next/server";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { getPortalSession } from "@/lib/portal/auth";
import { attemptPortalQuiz, PortalLmsError } from "@/lib/portal/service";
import { LmsError } from "@/lib/lms/service";
import { submitQuizAttemptSchema } from "@/lib/lms/validation";
import { readJsonBody } from "@/lib/api/validate";

/**
 * POST /api/v1/portal/students/[studentId]/quizzes/[quizId]/attempt
 * A pupil takes a quiz. Graded on the server against the answer key, which is never sent to the browser.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ studentId: string; quizId: string }> }) {
  if (!validateCSRF(req)) return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  const session = getPortalSession(req);
  if (!session) return noStore(fail("Portal session expired or unauthorized", 401));

  const { studentId, quizId } = await context.params;
  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);
  const body = read.json;
  const parsed = submitQuizAttemptSchema.safeParse(body);
  if (!parsed.success) return noStore(fail(parsed.error.issues[0]?.message ?? "Invalid attempt", 400, "VALIDATION"));

  try {
    return noStore(ok(await attemptPortalQuiz(studentId, session.allowedStudentIds, quizId, parsed.data.answers), {}, 201));
  } catch (err) {
    if (err instanceof PortalLmsError || err instanceof LmsError) {
      return noStore(fail(err.message, err instanceof PortalLmsError ? err.status : err.statusCode));
    }
    console.error("Portal quiz error:", err);
    return noStore(fail("Unable to submit this quiz", 500));
  }
}
