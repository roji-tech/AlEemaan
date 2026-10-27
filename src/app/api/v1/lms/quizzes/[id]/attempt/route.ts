import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { submitQuizAttemptSchema } from "@/lib/lms/validation";
import { attemptQuiz, LmsError } from "@/lib/lms/service";
import { resolveSubmitter } from "@/lib/lms/submitter";
import { readJsonObject } from "@/lib/api/validate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/lms/quizzes/[id]/attempt
 */
export const POST = withAuthGated(
  "staff-write",
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { id: quizId } = await params;
      const read = await readJsonObject(req);
      if (!read.ok) return read.response;
      const body = read.json as { branchId?: string } & Record<string, unknown>;
      const branchId = body.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = submitQuizAttemptSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid attempt payload", 400, "VALIDATION");
      }

      const who = await resolveSubmitter(auth.userId, branchId, body.studentId);
      if (!who.ok) return fail(who.message, who.status, who.status === 403 ? "FORBIDDEN" : "VALIDATION");
      const studentId = who.studentId;

      const attempt = await attemptQuiz(branchId, quizId, studentId, parsed.data.answers);
      return ok(attempt, {}, 201);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to submit quiz attempt", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
