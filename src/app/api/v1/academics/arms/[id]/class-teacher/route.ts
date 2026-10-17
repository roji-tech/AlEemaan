import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { assignClassTeacher } from "@/lib/attendance/access";

const ADMIN_ROLES = [Role.ADMIN] as const;

type Context = { params: Promise<{ id: string }> };

const patchSchema = z.strictObject({
  branchId: z.string().min(1, "branchId is required"),
  staffRecordId: z.string().nullable(),
});

/**
 * PATCH /api/v1/academics/arms/[id]/class-teacher
 * Admin only. Assigns or removes the designated form/class teacher of the arm.
 */
export const PATCH = withAuth<Context>(
  validate(
    { body: patchSchema },
    withBranch<Parsed<z.infer<typeof patchSchema>, undefined>, AuthContext, Context>(
      { of: ({ body }) => body.branchId, as: "administer" },
      async (_req, auth, ctx, { body }) => {
        try {
          const armId = (await ctx.params).id;
          const updated = await assignClassTeacher({
            branchId: body.branchId,
            actorUserId: auth.userId,
            classArmId: armId,
            staffRecordId: body.staffRecordId,
          });
          return ok(updated);
        } catch (error) {
          console.error("[class-teacher] assign failed:", error);
          return fail("Failed to assign class teacher", 400, "BAD_REQUEST");
        }
      },
    ),
  ),
  { roles: ADMIN_ROLES },
);
