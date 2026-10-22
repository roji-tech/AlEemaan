import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { branchIdsFor } from "@/lib/auth/branch-access";
import { withBranch } from "@/lib/auth/with-branch";
import { listSessions, createSession, createSessionSchema, DomainError } from "@/lib/academics/sessions";
import { readJsonBody } from "@/lib/api/validate";

/**
 * GET /api/v1/academics/sessions
 * Authenticated. Lists academic sessions (optionally filtered by ?branchId=...).
 */
export const GET = withAuth(async (req, auth) => {
  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || undefined;

    // Only the caller's own branches (a superadmin: all). Found by the browser security run: with no `?branchId=` every branch's calendar came back to anyone.
    const mine = await branchIdsFor(auth.userId);
    if (mine !== "all" && branchId && !mine.includes(branchId)) return fail("Not found", 404, "NOT_FOUND");
    const sessions = (await listSessions(branchId)).filter((s) => mine === "all" || mine.includes(s.branchId));
    return ok({ sessions });
  } catch (error) {
    console.error("[ACADEMIC_SESSIONS_GET_ERROR]", error);
    return fail("Unable to list academic sessions", 500, "INTERNAL");
  }
});

/**
 * POST /api/v1/academics/sessions
 * Administrators only (a branch administrator: their own branches). Creates a new academic session with automated periods/terms.
 */
export const POST = withAuth(
  async (req, admin) => {
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const body = read.json;

    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid session payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    // After the body is checked (as before): the caller must administer the branch they name (403 otherwise).
    return createInBranch(req, admin, undefined, parsed.data);
  },
  { roles: [Role.ADMIN] },
);

const createInBranch = withBranch<z.infer<typeof createSessionSchema>, { userId: string }, unknown>(
  { of: (input) => input.branchId, as: "administer", where: "body" },
  async (_req, admin, _ctx, data) => {
    try {
      const created = await createSession(data);

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
      const msg = error instanceof DomainError ? error.message : "Failed to create academic session";
      if (msg.includes("already exists")) {
        return fail(msg, 409, "DUPLICATE_SESSION");
      }
      console.error("[ACADEMIC_SESSION_CREATE_ERROR]", error);
      return fail(msg, 400, "SESSION_CREATE_FAILED");
    }
  },
);
