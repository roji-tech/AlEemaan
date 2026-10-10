import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { restoreStudent } from "@/lib/students/service";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/students/[id]/restore
 * Admin-only. Restores an archived student record with namesake conflict check & override.
 */
export const POST = withAuth<Context>(
  async (req, admin, context) => {
    const { id } = await context.params;

    let body: { allowDuplicate?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable
    }

    try {
      const result = await restoreStudent(admin.userId, id, Boolean(body.allowDuplicate));

      if (!result.ok) {
        if (result.code === "POSSIBLE_DUPLICATE") {
          return fail(result.error, 409, "POSSIBLE_DUPLICATE", [{ path: "allowDuplicate", message: result.error }]);
        }
        if (result.code === "NOT_FOUND") {
          return fail(result.error, 404, "NOT_FOUND");
        }
        return fail(result.error, 400, result.code);
      }

      return ok(result.data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to restore student";
      console.error("[STUDENT_RESTORE_ERROR]", error);
      return fail(msg, 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
