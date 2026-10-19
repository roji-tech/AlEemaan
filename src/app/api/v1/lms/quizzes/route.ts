import { NextRequest } from "next/server";
import { Role, QuizStatus } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { createQuizSchema } from "@/lib/lms/validation";
import { isBranchStaff, hideAnswerKey } from "@/lib/lms/audience";
import { listQuizzes, createQuiz } from "@/lib/lms/service";

/**
 * GET /api/v1/lms/quizzes?branchId=...&subjectId=...&status=...
 */
export const GET = withAuthGated(
  "read-any",
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const subjectId = searchParams.get("subjectId") ?? undefined;
      const status = searchParams.get("status") as QuizStatus | undefined;

      const staff = await isBranchStaff(auth.userId, branchId);
      const quizzes = await listQuizzes(branchId, {
        subjectId,
        status: staff ? (status && Object.values(QuizStatus).includes(status) ? status : undefined) : QuizStatus.PUBLISHED,
      });

      return ok(staff ? quizzes : quizzes.map(hideAnswerKey));
    } catch (error) {
      console.error("[LMS_QUIZZES_LIST_ERROR]", error);
      return fail("Unable to retrieve quizzes", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.STUDENT, Role.PARENT] },
);

/**
 * POST /api/v1/lms/quizzes
 */
export const POST = withAuthGated(
  "staff-write",
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const body = await req.json();
      const parsed = createQuizSchema.safeParse(body);

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid quiz payload", 400, "VALIDATION");
      }

      const quiz = await createQuiz({
        ...parsed.data,
        createdById: auth.userId,
      });

      return ok(quiz, {}, 201);
    } catch (error) {
      console.error("[LMS_QUIZ_CREATE_ERROR]", error);
      return fail("Unable to create quiz", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
