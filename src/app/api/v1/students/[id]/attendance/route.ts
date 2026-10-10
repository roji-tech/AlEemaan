import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { attendanceFailure } from "@/lib/attendance/http";
import { getStudentAttendanceHistory } from "@/lib/attendance/service";

const STAFF_ROLES = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] as const;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/students/[id]/attendance
 * Authenticated staff. Retrieves attendance history and rate for a student.
 */
export const GET = withAuth(
  async (_req, _auth, ctx: RouteContext) => {
    try {
      const { id } = await ctx.params;
      if (!id) {
        return fail("Student ID is required", 400, "VALIDATION");
      }

      const result = await getStudentAttendanceHistory(id);
      if (!result.ok) {
        return attendanceFailure(result.failure);
      }

      return ok(result.data);
    } catch (error) {
      console.error("[STUDENT_ATTENDANCE_GET_ERROR]", error);
      return fail("Unable to retrieve student attendance history", 500, "INTERNAL");
    }
  },
  { roles: STAFF_ROLES },
);
