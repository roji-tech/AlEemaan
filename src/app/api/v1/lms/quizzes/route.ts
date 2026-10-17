import { NextRequest } from "next/server";
import { Role, QuizStatus } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { createQuizSchema } from "@/lib/lms/validation";
import { listQuizzes, createQuiz } from "@/lib/lms/service";

/**
 * GET /api/v1/lms/quizzes?branchId=...&subjectId=...&status=...
 */
export const GET = withAuth(
  async (req: NextRequest) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const subjectId = searchParams.get("subjectId") ?? undefined;
      const status = searchParams.get("status") as QuizStatus | undefined;

      const quizzes = await listQuizzes(branchId, {
        subjectId,
        status: status && Object.values(QuizStatus).includes(status) ? status : undefined,
      });

      return ok(quizzes);
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
export const POST = withAuth(
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
