import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { getSchoolSettings, updateSchoolSettings, schoolSettingsUpdateSchema } from "@/lib/settings/school-settings";

/**
 * GET /api/v1/settings/school
 * Authenticated. Returns current school profile / settings.
 */
export const GET = withAuth(async () => {
  try {
    const settings = await getSchoolSettings();
    return ok({ settings });
  } catch (error) {
    console.error("[SCHOOL_SETTINGS_GET_ERROR]", error);
    return fail("Unable to load school settings", 500, "INTERNAL");
  }
});

/**
 * PATCH /api/v1/settings/school
 * Superadmin only. Updates school profile / contact info.
 */
export const PATCH = withAuth(
  validate({ body: schoolSettingsUpdateSchema }, async (_req, admin: { userId: string }, _ctx: unknown, { body }) => {
    try {
      const before = await getSchoolSettings();
      const updated = await updateSchoolSettings(body);

      await prisma.auditLog.create({
        data: {
          actorUserId: admin.userId,
          action: "SCHOOL_SETTINGS_UPDATED",
          targetType: "SchoolSettings",
          targetId: "global",
          beforeValue: before as object,
          afterValue: updated as object,
        },
      });

      return ok({ settings: updated });
    } catch (error) {
      console.error("[SCHOOL_SETTINGS_PATCH_ERROR]", error);
      return fail("Failed to update school settings", 500, "INTERNAL");
    }
  }),
  { superAdmin: true },
);
