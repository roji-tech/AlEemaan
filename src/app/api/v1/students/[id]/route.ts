import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { getStudent, updateStudent, archiveStudent, studentUpdateSchema } from "@/lib/students/service";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/students/[id]
 * Authenticated. Retrieves student detail by ID.
 */
export const GET = withAuth<Context>(async (_req, _auth, context) => {
  const { id } = await context.params;
  try {
    const student = await getStudent(id);
    if (!student) {
      return fail(`Student "${id}" not found`, 404, "NOT_FOUND");
    }
    return ok({ student });
  } catch (error) {
    console.error("[STUDENT_GET_DETAIL_ERROR]", error);
    return fail("Unable to load student details", 500, "INTERNAL");
  }
});

/**
 * PATCH /api/v1/students/[id]
 * Admin-only. Updates student information with duplicate protection and override.
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

    const parsed = studentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid update payload",
        400,
        "VALIDATION",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }

    try {
      const result = await updateStudent(admin.userId, id, parsed.data);

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
      const msg = error instanceof Error ? error.message : "Failed to update student";
      console.error("[STUDENT_PATCH_ERROR]", error);
      return fail(msg, 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);

/**
 * DELETE /api/v1/students/[id]
 * Admin-only. Archives a student record (never physically deletes).
 */
export const DELETE = withAuth<Context>(
  async (_req, admin, context) => {
    const { id } = await context.params;
    try {
      const result = await archiveStudent(admin.userId, id);
      if (!result.ok) {
        return fail(result.error, 400, result.code);
      }
      return ok(result.data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to archive student";
      console.error("[STUDENT_ARCHIVE_ERROR]", error);
      return fail(msg, 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
