import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { studentBranchId, studentNotFound } from "@/lib/students/scope";
import { completeStudent } from "@/lib/students/service";
import { missingText } from "@/lib/drafts/rules";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/students/[id]/complete
 * Admin-only (task 0101 D1). Clears the draft flag when the pupil has what a finished record needs (first and last name, gender, date of birth, an active class, and a guardian name with
 * a phone or an e-mail); otherwise 409 INCOMPLETE listing what is missing (one detail per missing item, path "missing") and nothing changes. A pupil who is not a draft is returned as
 * they are. A pupil of another branch is the same 404 as an unknown id.
 */
export const POST = withAuth<Context>(
  withBranch<undefined, { userId: string }, Context>(
    { of: async (_input, _req, context) => studentBranchId((await context.params).id), as: "administer", refuse: studentNotFound },
    async (_req, admin, context) => {
      const { id } = await context.params;
      try {
        const result = await completeStudent(admin.userId, id);
        if (!result.ok) {
          if ("missing" in result)
            return fail(
              `This record is not complete yet. ${missingText(result.missing)}.`,
              409,
              "INCOMPLETE",
              result.missing.map((message) => ({ path: "missing", message })),
            );
          if (result.code === "NOT_FOUND") return fail(result.error, 404, "NOT_FOUND");
          if (result.code === "ARCHIVED") return fail(result.error, 409, "ARCHIVED");
          return fail(result.error, 400, result.code);
        }
        return ok(result.data);
      } catch (error: unknown) {
        console.error("[STUDENT_COMPLETE_ERROR]", error);
        // a fixed message: the exception's own text can name tables, columns and values (ISS-0006)
        return fail("Failed to complete the record.", 500, "INTERNAL");
      }
    },
  ),
  { roles: [Role.ADMIN] },
);
