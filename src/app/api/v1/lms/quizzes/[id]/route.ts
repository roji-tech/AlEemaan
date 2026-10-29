import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { ok, fail } from "@/lib/api/envelope";
import { isBranchStaff, hideAnswerKey } from "@/lib/lms/audience";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { getQuizById, updateQuiz, archiveQuiz, LmsError } from "@/lib/lms/service";
import { updateQuizSchema } from "@/lib/lms/validation";
import { readJsonBody } from "@/lib/api/validate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/lms/quizzes/[id]?branchId=...
 */
export const GET = withAuthGated(
  "read-any",
  async (req: NextRequest, auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId query parameter is required", 400, "VALIDATION");
      }

      const superAdmin = await isSuperAdmin(auth.userId);
      const quiz = await getQuizById(branchId, id, {
        userId: auth.userId,
        isSuperAdmin: superAdmin,
      });
      if (await isBranchStaff(auth.userId, branchId)) return ok(quiz);
      if (quiz.status !== "PUBLISHED") return fail("Quiz not found", 404, "NOT_FOUND");
      return ok(hideAnswerKey(quiz));
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to retrieve quiz", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.STUDENT, Role.PARENT] },
);

/**
 * PATCH /api/v1/lms/quizzes/[id]?branchId=...
 */
export const PATCH = withAuthGated(
  "staff-write",
  async (req: NextRequest, auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const read = await readJsonBody(req);
      if (!read.ok) return read.response;
      const parsed = updateQuizSchema.safeParse(read.json);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid update payload", 400, "VALIDATION");
      }
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");
      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }
      const superAdmin = await isSuperAdmin(auth.userId);
      const updated = await updateQuiz(branchId, id, parsed.data, {
        userId: auth.userId,
        isSuperAdmin: superAdmin,
      });
      return ok(updated);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to update quiz", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);

/**
 * DELETE /api/v1/lms/quizzes/[id]?branchId=...
 */
export const DELETE = withAuthGated(
  "staff-write",
  async (req: NextRequest, _auth, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      await archiveQuiz(branchId, id);
      return ok({ archived: true });
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to archive quiz", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
