import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
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
 * Admin-only. Updates school profile / contact info.
 */
export const PATCH = withAuth(
  async (req, admin) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON body", 400, "INVALID_BODY");
    }

    const parsed = schoolSettingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid settings payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    try {
      const before = await getSchoolSettings();
      const updated = await updateSchoolSettings(parsed.data);

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
  },
  { roles: [Role.ADMIN] },
);
