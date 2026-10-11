import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { resolveBranchRole } from "@/lib/auth/branch-access";
import { bulkMarkAttendanceSchema, rollCallQuerySchema, attendanceFailure } from "@/lib/attendance/http";
import { getBranchRollCall, markBranchAttendance } from "@/lib/attendance/service";

const STAFF_ROLES = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] as const;
const WRITE_ROLES = [Role.ADMIN, Role.TEACHING_STAFF] as const;

/**
 * GET /api/v1/attendance?branchId=...&className=...&arm=...&date=YYYY-MM-DD
 * Staff only. Retrieves the daily roll-call roster and attendance summary.
 */
export const GET = withAuth(
  async (req, auth: AuthContext) => {
    try {
      const { searchParams } = new URL(req.url);
      const query = rollCallQuerySchema.safeParse({
        branchId: searchParams.get("branchId") ?? undefined,
        className: searchParams.get("className") ?? undefined,
        arm: searchParams.get("arm") || undefined,
        date: searchParams.get("date") || undefined,
      });
      if (!query.success) {
        return fail(
          query.error.issues[0]?.message ?? "Invalid query",
          400,
          "VALIDATION",
          query.error.issues.map((i) => ({ path: `query.${i.path.join(".")}`, message: i.message })),
        );
      }
      const { branchId, className, arm } = query.data;
      const dateStr = query.data.date ?? new Date().toISOString().slice(0, 10);

      // The caller's role IN THIS BRANCH (an ADMIN anywhere reaches all); none = the same 404 as an unknown branch.
      const role = await resolveBranchRole(auth.userId, branchId);
      if (!role) return attendanceFailure("NOT_FOUND");

      const result = await getBranchRollCall({
        branchId,
        className,
        arm,
        dateStr,
        actorRole: role,
      });

      if (!result.ok) {
        return attendanceFailure(result.failure);
      }

      return ok(result.data);
    } catch (error) {
      console.error("[ATTENDANCE_GET_ERROR]", error);
      return fail("Unable to retrieve attendance roll call", 500, "INTERNAL");
    }
  },
  { roles: STAFF_ROLES },
);

/**
 * POST /api/v1/attendance
 * Staff only. Records or updates attendance roll call.
 */
export const POST = withAuth(
  async (req, auth: AuthContext) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON body", 400, "INVALID_BODY");
    }

    const parsed = bulkMarkAttendanceSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid attendance payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    const role = await resolveBranchRole(auth.userId, parsed.data.branchId);
    if (!role) return attendanceFailure("NOT_FOUND");
    // The route-level roles say "a teacher somewhere"; marking needs a teaching (or admin) role in THIS branch.
    if (!WRITE_ROLES.some((r) => r === role)) return attendanceFailure("UNAUTHORIZED");

    const result = await markBranchAttendance({
      branchId: parsed.data.branchId,
      actorUserId: auth.userId,
      actorRole: role,
      input: parsed.data,
    });

    if (!result.ok) {
      return attendanceFailure(result.failure);
    }

    return ok(result.data);
  },
  { roles: WRITE_ROLES },
);
