import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { studentBranchId, studentNotFound } from "@/lib/students/scope";
import { restoreStudent } from "@/lib/students/service";
import { readBoundedText } from "@/lib/api/read-body";
import { MAX_BODY_BYTES } from "@/lib/api/validate";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/students/[id]/restore
 * Admin-only. Restores an archived student record with namesake conflict check & override.
 */
export const POST = withAuth<Context>(
  withBranch<undefined, { userId: string }, Context>(
    { of: async (_input, _req, context) => studentBranchId((await context.params).id), as: "administer", refuse: studentNotFound },
    async (req, admin, context) => {
      const { id } = await context.params;

      let body: { allowDuplicate?: boolean } = {};
      // The body is optional ({ allowDuplicate }): an empty or non-JSON body keeps the default. It is read no further than the cap.
      const text = await readBoundedText(req, MAX_BODY_BYTES).catch(() => "");
      if (text === null) return fail("That request is too large.", 413, "PAYLOAD_TOO_LARGE");
      if (text.trim()) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object") body = parsed;
        } catch {
          // not JSON: keep the default
        }
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
        console.error("[STUDENT_RESTORE_ERROR]", error);
        // a fixed message: the exception's own text can name tables, columns and values (ISS-0006)
        return fail("Failed to restore student.", 500, "INTERNAL");
      }
    },
  ),
  { roles: [Role.ADMIN] },
);
