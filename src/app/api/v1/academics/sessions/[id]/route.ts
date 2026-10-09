import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { getSession, updateSession, updateSessionSchema } from "@/lib/academics/sessions";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/academics/sessions/[id]
 * Authenticated. Retrieves session detail and periods.
 */
export const GET = withAuth<Context>(async (_req, _auth, context) => {
  const { id } = await context.params;
  try {
    const session = await getSession(id);
    if (!session) {
      return fail(`Academic session "${id}" not found`, 404, "NOT_FOUND");
    }
    return ok({ session });
  } catch (error) {
    console.error("[ACADEMIC_SESSION_GET_DETAIL_ERROR]", error);
    return fail("Unable to load academic session", 500, "INTERNAL");
  }
});

/**
 * PATCH /api/v1/academics/sessions/[id]
 * Admin-only. Updates session metadata or activates/closes it.
 */
export const PATCH = withAuth<Context>(
  async (req, admin, context) => {
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON body", 400, "INVALID_BODY");
    }

    const parsed = updateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid update payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    try {
      const before = await getSession(id);
      if (!before) {
        return fail(`Academic session "${id}" not found`, 404, "NOT_FOUND");
      }

      const updated = await updateSession(id, parsed.data);

      await prisma.auditLog.create({
        data: {
          actorUserId: admin.userId,
          action: "ACADEMIC_SESSION_UPDATED",
          targetType: "AcademicSession",
          targetId: id,
          beforeValue: { status: before.status, label: before.label },
          afterValue: { status: updated.status, label: updated.label },
        },
      });

      return ok({ session: updated });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to update academic session";
      console.error("[ACADEMIC_SESSION_PATCH_ERROR]", error);
      return fail(msg, 400, "SESSION_UPDATE_FAILED");
    }
  },
  { roles: [Role.ADMIN] },
);
