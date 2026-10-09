import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { bulkMarkAttendanceSchema, attendanceFailure } from "@/lib/attendance/http";
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
      const branchId = searchParams.get("branchId");
      const className = searchParams.get("className");
      const arm = searchParams.get("arm") || undefined;
      const dateStr = searchParams.get("date") || new Date().toISOString().slice(0, 10);

      if (!branchId || !className) {
        return fail("branchId and className are required query parameters.", 400, "VALIDATION");
      }

      // Determine highest role for caller (ADMIN crosses all branches in AlEemaan)
      const memberships = await prisma.membership.findMany({
        where: { userId: auth.userId, deactivatedAt: null },
        select: { role: true, branchId: true },
      });
      const hasAdmin = memberships.some((m) => m.role === Role.ADMIN);
      const branchMembership = memberships.find((m) => m.branchId === branchId);
      const role = hasAdmin ? Role.ADMIN : (branchMembership?.role ?? Role.TEACHING_STAFF);

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

    // Determine role for edit window check (ADMIN crosses all branches in AlEemaan)
    const memberships = await prisma.membership.findMany({
      where: { userId: auth.userId, deactivatedAt: null },
      select: { role: true, branchId: true },
    });
    const hasAdmin = memberships.some((m) => m.role === Role.ADMIN);
    const branchMembership = memberships.find((m) => m.branchId === parsed.data.branchId);
    const role = hasAdmin ? Role.ADMIN : (branchMembership?.role ?? Role.TEACHING_STAFF);

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
