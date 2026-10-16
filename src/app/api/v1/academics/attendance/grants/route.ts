import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { listAttendanceGrants, createAttendanceGrant } from "@/lib/attendance/access";

const ADMIN_ROLES = [Role.ADMIN] as const;

const querySchema = z.object({
  branchId: z.string().min(1, "branchId is required"),
});

const createGrantSchema = z.strictObject({
  branchId: z.string().min(1, "branchId is required"),
  staffRecordId: z.string().min(1, "staffRecordId is required"),
  classArmId: z.string().min(1, "classArmId is required"),
});

/**
 * GET /api/v1/academics/attendance/grants?branchId=...
 * Admin only. Lists all explicit attendance grants in the branch.
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

      return listInBranch(req, auth, undefined, query.data);
    } catch (error) {
      console.error("[ATTENDANCE_GRANTS_GET_ERROR]", error);
      return fail("Unable to retrieve attendance grants", 500, "INTERNAL");
    }
  },
  { roles: ADMIN_ROLES },
);

const listInBranch = withBranch<z.infer<typeof querySchema>, AuthContext, unknown>(
  { of: (q) => q.branchId, as: "administer" },
  async (_req, auth, _ctx, { branchId }) => {
    const grants = await listAttendanceGrants(branchId, auth.userId);
    return ok(grants);
  },
);

/**
 * POST /api/v1/academics/attendance/grants
 * Admin only. Creates an explicit attendance grant.
 */
export const POST = withAuth(
  validate(
    { body: createGrantSchema },
    withBranch<Parsed<z.infer<typeof createGrantSchema>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer" },
      async (_req, auth, _ctx, { body }) => {
        try {
          const grant = await createAttendanceGrant({
            branchId: body.branchId,
            actorUserId: auth.userId,
            staffRecordId: body.staffRecordId,
            classArmId: body.classArmId,
          });
          return ok({ grant }, {}, 201);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Failed to create attendance grant";
          return fail(msg, 400, "BAD_REQUEST");
        }
      },
    ),
  ),
  { roles: ADMIN_ROLES },
);
