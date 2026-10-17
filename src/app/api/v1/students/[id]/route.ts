import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { studentBranchId, studentNotFound } from "@/lib/students/scope";
import { withBranch } from "@/lib/auth/with-branch";
import { branchIdsFor } from "@/lib/auth/branch-access";
import { getStudent, updateStudent, archiveStudent, studentUpdateSchema } from "@/lib/students/service";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/students/[id]
 * Staff only. Retrieves student detail by ID (a branch the caller does not belong to is a 404).
 */
export const GET = withAuth<Context>(
  async (_req, auth, context) => {
    const { id } = await context.params;
    try {
      const student = await getStudent(id, await branchIdsFor(auth.userId));
      if (!student) {
        return fail(`Student "${id}" not found`, 404, "NOT_FOUND");
      }
      return ok({ student });
    } catch (error) {
      console.error("[STUDENT_GET_DETAIL_ERROR]", error);
      return fail("Unable to load student details", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);

/**
 * PATCH /api/v1/students/[id]
 * Admin-only. Updates student information with duplicate protection and override.
 */
export const PATCH = withAuth<Context>(
  async (req, admin, context) => {
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

    // After the body is checked (as before): the caller must administer the student's branch - a student of another branch is "no such student".
    return updateInBranch(req, admin, context, parsed.data);
  },
  { roles: [Role.ADMIN] },
);

const updateInBranch = withBranch<z.infer<typeof studentUpdateSchema>, { userId: string }, Context>(
  { of: async (_input, _req, context) => studentBranchId((await context.params).id), as: "administer", refuse: studentNotFound },
  async (_req, admin, context, data) => {
    const { id } = await context.params;
    try {
      const result = await updateStudent(admin.userId, id, data);

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
      console.error("[STUDENT_PATCH_ERROR]", error);
      // a fixed message: the exception's own text can name tables, columns and values (ISS-0006)
      return fail("Failed to update student.", 500, "INTERNAL");
    }
  },
);

/**
 * DELETE /api/v1/students/[id]
 * Admin-only. Archives a student record (never physically deletes).
 */
export const DELETE = withAuth<Context>(
  withBranch<undefined, { userId: string }, Context>(
    { of: async (_input, _req, context) => studentBranchId((await context.params).id), as: "administer", refuse: studentNotFound },
    async (_req, admin, context) => {
      const { id } = await context.params;
      try {
        const result = await archiveStudent(admin.userId, id);
        if (!result.ok) {
          return fail(result.error, 400, result.code);
        }
        return ok(result.data);
      } catch (error: unknown) {
        console.error("[STUDENT_ARCHIVE_ERROR]", error);
        // a fixed message: the exception's own text can name tables, columns and values (ISS-0006)
        return fail("Failed to archive student.", 500, "INTERNAL");
      }
    },
  ),
  { roles: [Role.ADMIN] },
);
