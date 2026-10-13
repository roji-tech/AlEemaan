import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
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
      // The caller's role IN THIS BRANCH (an ADMIN anywhere reaches all); none = the same 404 as an unknown branch.
      return rollCallInBranch(req, auth, undefined, query.data);
    } catch (error) {
      console.error("[ATTENDANCE_GET_ERROR]", error);
      return fail("Unable to retrieve attendance roll call", 500, "INTERNAL");
    }
  },
  { roles: STAFF_ROLES },
);

const NOT_FOUND = () => attendanceFailure("NOT_FOUND");

const rollCallInBranch = withBranch<z.infer<typeof rollCallQuerySchema>, AuthContext, unknown>(
  { of: (query) => query.branchId, as: "staff-read", refuse: NOT_FOUND },
  async (_req, _auth, _ctx, query, { role }) => {
    try {
      const { branchId, className, arm } = query;
      const dateStr = query.date ?? new Date().toISOString().slice(0, 10);

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
);

/**
 * POST /api/v1/attendance
 * Staff only. Records or updates attendance roll call.
 */
export const POST = withAuth(
  validate(
    { body: bulkMarkAttendanceSchema },
    withBranch<Parsed<z.infer<typeof bulkMarkAttendanceSchema>, undefined>, AuthContext, unknown>(
      {
        of: ({ body }) => body.branchId,
        as: "staff-write", // marking needs a teaching (or admin) role in THIS branch; the route-level roles only say "a teacher somewhere"
        refuse: (why) => attendanceFailure(why === "FORBIDDEN" ? "UNAUTHORIZED" : "NOT_FOUND"),
      },
      async (_req, auth, _ctx, { body }, { role }) => {
        const result = await markBranchAttendance({
          branchId: body.branchId,
          actorUserId: auth.userId,
          actorRole: role,
          input: body,
        });

        if (!result.ok) {
          return attendanceFailure(result.failure);
        }

        return ok(result.data);
      },
    ),
  ),
  { roles: WRITE_ROLES },
);
