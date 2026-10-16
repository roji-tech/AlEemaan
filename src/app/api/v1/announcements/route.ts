import { NextRequest } from "next/server";
import { Role, AnnouncementStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { createAnnouncementSchema } from "@/lib/announcements/validation";
import {
  listAnnouncements,
  createAnnouncement,
  AnnouncementPermissionError,
} from "@/lib/announcements/service";
import type { ViewerProfile } from "@/lib/announcements/rules";

async function resolveViewer(userId: string, requestedBranchId?: string | null): Promise<ViewerProfile> {
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
  const membership = requestedBranchId
    ? user?.memberships.find((m) => m.branchId === requestedBranchId)
    : user?.memberships[0];

  return {
    userId,
    role: isSuper ? Role.ADMIN : (membership?.role ?? user?.memberships[0]?.role ?? Role.STUDENT),
    isSuperAdmin: isSuper,
    branchId: membership?.branchId ?? user?.memberships[0]?.branchId ?? null,
  };
}

/**
 * GET /api/v1/announcements?branchId=...&status=...
 */
export const GET = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId") ?? undefined;
      const statusParam = searchParams.get("status");
      const status = statusParam ? (statusParam.toUpperCase() as AnnouncementStatus) : undefined;

      const viewer = await resolveViewer(auth.userId, branchId);
      const items = await listAnnouncements(viewer, { branchId, status });

      return ok(items);
    } catch (error) {
      console.error("[ANNOUNCEMENTS_LIST_ERROR]", error);
      return fail("Unable to retrieve announcements", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF, Role.STUDENT, Role.PARENT] },
);

/**
 * POST /api/v1/announcements
 * Publishes or drafts a targeted announcement.
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const body = await req.json();
      const parsed = createAnnouncementSchema.safeParse(body);

      if (!parsed.success) {
        return fail(
          parsed.error.issues[0]?.message ?? "Invalid announcement payload",
          400,
          "VALIDATION",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }

      const viewer = await resolveViewer(auth.userId, parsed.data.branchId);
      const created = await createAnnouncement(auth.userId, viewer, parsed.data);

      return ok(created, {}, 201);
    } catch (error) {
      if (error instanceof AnnouncementPermissionError) {
        return fail(error.message, 403, "FORBIDDEN");
      }
      console.error("[ANNOUNCEMENT_CREATE_ERROR]", error);
      return fail("Unable to create announcement", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
