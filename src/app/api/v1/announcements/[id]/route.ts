import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { updateAnnouncementSchema } from "@/lib/announcements/validation";
import { getAnnouncement, updateAnnouncement, deleteAnnouncement, AnnouncementPermissionError } from "@/lib/announcements/service";
import type { ViewerProfile } from "@/lib/announcements/rules";
import { readJsonBody } from "@/lib/api/validate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function resolveViewer(userId: string): Promise<ViewerProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      memberships: {
        where: { deactivatedAt: null },
        select: { role: true, branchId: true },
      },
    },
  });

  const isSuper = Boolean(user?.isSuperAdmin);
  const membership = user?.memberships[0];

  return {
    userId,
    role: isSuper ? Role.ADMIN : (membership?.role ?? Role.STUDENT),
    isSuperAdmin: isSuper,
    branchId: membership?.branchId ?? null,
  };
}

/**
 * GET /api/v1/announcements/[id]
 */
export const GET = withAuthGated<RouteParams>(
  "read-any",
  async (_req: NextRequest, auth: AuthContext, { params }) => {
    try {
      const { id } = await params;
      const viewer = await resolveViewer(auth.userId);
      const item = await getAnnouncement(id, viewer);

      if (!item) {
        return fail("Announcement not found", 404, "NOT_FOUND");
      }

      return ok(item);
    } catch (error) {
      console.error("[ANNOUNCEMENT_GET_ERROR]", error);
      return fail("Unable to retrieve announcement", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT] },
);

/**
 * PATCH /api/v1/announcements/[id]
 */
export const PATCH = withAuthGated<RouteParams>(
  "staff-write",
  async (req: NextRequest, auth: AuthContext, { params }) => {
    try {
      const { id } = await params;
      const read = await readJsonBody(req);
      if (!read.ok) return read.response;
      const body = read.json;
      const parsed = updateAnnouncementSchema.safeParse(body);

      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid update payload",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const viewer = await resolveViewer(auth.userId);
      const updated = await updateAnnouncement(id, viewer, parsed.data);

      if (!updated) {
        return fail("Announcement not found", 404, "NOT_FOUND");
      }

      return ok(updated);
    } catch (error) {
      if (error instanceof AnnouncementPermissionError) {
        return fail(error.message, 403, "FORBIDDEN");
      }
      console.error("[ANNOUNCEMENT_UPDATE_ERROR]", error);
      return fail("Unable to update announcement", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);

/**
 * DELETE /api/v1/announcements/[id]
 */
export const DELETE = withAuthGated<RouteParams>(
  "staff-write",
  async (_req: NextRequest, auth: AuthContext, { params }) => {
    try {
      const { id } = await params;
      const viewer = await resolveViewer(auth.userId);
      const deleted = await deleteAnnouncement(id, viewer);

      if (!deleted) {
        return fail("Announcement not found", 404, "NOT_FOUND");
      }

      return ok({ success: true, id: deleted.id });
    } catch (error) {
      if (error instanceof AnnouncementPermissionError) {
        return fail(error.message, 403, "FORBIDDEN");
      }
      console.error("[ANNOUNCEMENT_DELETE_ERROR]", error);
      return fail("Unable to delete announcement", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
