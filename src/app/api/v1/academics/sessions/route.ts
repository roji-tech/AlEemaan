import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { listSessions, createSession, createSessionSchema } from "@/lib/academics/sessions";

/**
 * GET /api/v1/academics/sessions
 * Authenticated. Lists academic sessions (optionally filtered by ?branchId=...).
 */
export const GET = withAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || undefined;

    const sessions = await listSessions(branchId);
    return ok({ sessions });
  } catch (error) {
    console.error("[ACADEMIC_SESSIONS_GET_ERROR]", error);
    return fail("Unable to list academic sessions", 500, "INTERNAL");
  }
});

/**
 * POST /api/v1/academics/sessions
 * Admin-only. Creates a new academic session with automated periods/terms.
 */
export const POST = withAuth(
  async (req, admin) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Invalid JSON body", 400, "INVALID_BODY");
    }

    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid session payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    try {
      const created = await createSession(parsed.data);

      await prisma.auditLog.create({
        data: {
          actorUserId: admin.userId,
          action: "ACADEMIC_SESSION_CREATED",
          targetType: "AcademicSession",
          targetId: created!.id,
          afterValue: {
            id: created!.id,
            label: created!.label,
            branchId: created!.branchId,
            status: created!.status,
            periodCount: created!.periods.length,
          },
        },
      });

      return ok({ session: created }, {}, 201);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to create academic session";
      if (msg.includes("already exists")) {
        return fail(msg, 409, "DUPLICATE_SESSION");
      }
      console.error("[ACADEMIC_SESSION_CREATE_ERROR]", error);
      return fail(msg, 400, "SESSION_CREATE_FAILED");
    }
  },
  { roles: [Role.ADMIN] },
);
