import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { submitQuizAttemptSchema } from "@/lib/lms/validation";
import { attemptQuiz, LmsError } from "@/lib/lms/service";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/lms/quizzes/[id]/attempt
 */
export const POST = withAuthGated(
  "read-any",
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { id: quizId } = await params;
      const body = await req.json();
      const branchId = body.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = submitQuizAttemptSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid attempt payload", 400, "VALIDATION");
      }

      let studentId = body.studentId;
      if (!studentId) {
        const studentRec = await prisma.studentRecord.findFirst({
          where: { branchId, id: auth.userId },
        });
        studentId = studentRec?.id;
      }

      if (!studentId) {
        return fail("studentId is required to attempt a quiz", 400, "VALIDATION");
      }

      const attempt = await attemptQuiz(branchId, quizId, studentId, parsed.data.answers);
      return ok(attempt, {}, 201);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to submit quiz attempt", 500, "INTERNAL");
    }
  },
  { roles: [Role.STUDENT, Role.ADMIN, Role.TEACHING_STAFF] },
);
