import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { revokeAttendanceGrant } from "@/lib/attendance/access";

const ADMIN_ROLES = [Role.ADMIN] as const;

const querySchema = z.object({
  branchId: z.string().min(1, "branchId is required"),
});

/**
 * DELETE /api/v1/academics/attendance/grants/[id]?branchId=...
 * Admin only. Revokes an explicit attendance grant.
 */
export const DELETE = withAuth(
  async (req, auth: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
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

      return revokeInBranch(req, auth, { id }, query.data);
    } catch (error) {
      console.error("[ATTENDANCE_GRANT_DELETE_ERROR]", error);
      return fail("Unable to revoke attendance grant", 500, "INTERNAL");
    }
  },
  { roles: ADMIN_ROLES },
);

const revokeInBranch = withBranch<z.infer<typeof querySchema>, AuthContext, { id: string }>(
  { of: (q) => q.branchId, as: "administer" },
  async (_req, auth, ctx, { branchId }) => {
    try {
      await revokeAttendanceGrant({
        branchId,
        actorUserId: auth.userId,
        grantId: ctx.id,
      });
      return ok({ revoked: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to revoke attendance grant";
      return fail(msg, 400, "BAD_REQUEST");
    }
  },
);
