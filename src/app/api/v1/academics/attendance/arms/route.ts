import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { listAvailableAttendanceArms } from "@/lib/attendance/access";

const STAFF_ROLES = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] as const;

const querySchema = z.object({
  branchId: z.string().min(1, "branchId is required"),
});

/**
 * GET /api/v1/academics/attendance/arms?branchId=...
 * Returns the list of arms the caller is authorized to view or mark attendance for,
 * annotated with their grantType ("ADMIN", "CLASS_TEACHER", "EXPLICIT_GRANT").
 */
export const GET = withAuth(
  async (req, auth: AuthContext) => {
    try {
      const { searchParams } = new URL(req.url);
      const query = querySchema.safeParse({
        branchId: searchParams.get("branchId") ?? undefined,
      });

      if (!query.success) {
        return fail(
          query.error.issues[0]?.message ?? "Invalid query",
          400,
          "VALIDATION",
          query.error.issues.map((i) => ({ path: `query.${i.path.join(".")}`, message: i.message })),
        );
      }

      return armsInBranch(req, auth, undefined, query.data);
    } catch (error) {
      console.error("[ATTENDANCE_ARMS_GET_ERROR]", error);
      return fail("Unable to retrieve authorized attendance arms", 500, "INTERNAL");
    }
  },
  { roles: STAFF_ROLES },
);

const armsInBranch = withBranch<z.infer<typeof querySchema>, AuthContext, unknown>(
  { of: (q) => q.branchId, as: "staff-read" },
  async (_req, auth, _ctx, { branchId }) => {
    const arms = await listAvailableAttendanceArms(branchId, auth.userId);
    return ok(arms);
  },
);
