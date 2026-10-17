import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { gradeSubmissionSchema } from "@/lib/lms/validation";
import { gradeSubmission, LmsError } from "@/lib/lms/service";

interface RouteParams {
  params: Promise<{ id: string; subId: string }>;
}

/**
 * PATCH /api/v1/lms/assignments/[id]/submissions/[subId]/grade
 */
export const PATCH = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { id: assignmentId, subId } = await params;
      const body = await req.json();
      const branchId = body.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = gradeSubmissionSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid grade payload", 400, "VALIDATION");
      }

      const graded = await gradeSubmission(
        branchId,
        assignmentId,
        subId,
        parsed.data,
        auth.userId
      );

      return ok(graded);
    } catch (error) {
      if (error instanceof LmsError) {
        return fail(error.message, error.statusCode);
      }
      return fail("Unable to grade submission", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] }
);
