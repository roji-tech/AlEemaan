import { NextRequest } from "next/server";
import { Role, AssignmentStatus } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { createAssignmentSchema } from "@/lib/lms/validation";
import { isBranchStaff, hideSubmissionCount } from "@/lib/lms/audience";
import { listAssignments, createAssignment, PUPIL_VISIBLE_ASSIGNMENT_STATUSES } from "@/lib/lms/service";
import { readJsonBody } from "@/lib/api/validate";

/**
 * GET /api/v1/lms/assignments?branchId=...&subjectId=...&classGroupId=...&status=...
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
      const classGroupId = searchParams.get("classGroupId") ?? undefined;
      const status = searchParams.get("status") as AssignmentStatus | undefined;

      const staff = await isBranchStaff(auth.userId, branchId);
      const assignments = await listAssignments(branchId, {
        subjectId,
        classGroupId,
        ...(staff
          ? { status: status && Object.values(AssignmentStatus).includes(status) ? status : undefined }
          : { statuses: PUPIL_VISIBLE_ASSIGNMENT_STATUSES }),
      });

      return ok(staff ? assignments : assignments.map((assignment) => hideSubmissionCount(assignment)));
    } catch (error) {
      console.error("[LMS_ASSIGNMENT_LIST_ERROR]", error);
      return fail("Unable to retrieve assignments", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.STUDENT, Role.PARENT] },
);

/**
 * POST /api/v1/lms/assignments
 */
export const POST = withAuthGated(
  "staff-write",
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const read = await readJsonBody(req);
      if (!read.ok) return read.response;
      const body = read.json;
      const parsed = createAssignmentSchema.safeParse(body);

      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid assignment payload", 400, "VALIDATION");
      }

      const assignment = await createAssignment({
        ...parsed.data,
        createdById: auth.userId,
      });

      return ok(assignment, {}, 201);
    } catch (error) {
      console.error("[LMS_ASSIGNMENT_CREATE_ERROR]", error);
      return fail("Unable to create assignment", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
