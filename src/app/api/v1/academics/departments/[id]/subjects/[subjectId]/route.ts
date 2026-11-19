import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";
import { canManageDepartment, departmentBranchId, removeSubject } from "@/lib/academics/departments";

type Context = { params: Promise<{ id: string; subjectId: string }> };

// DELETE /api/v1/academics/departments/[id]/subjects/[subjectId]   Takes a subject out of the department: an administrator of its branch, or ITS head (task 0101 D7). A subject that is not in it
// is a 404.
export const DELETE = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => departmentBranchId((await ctx.params).id), as: "staff-read", refuse: () => notFound("Department") },
    async (_req, auth, ctx) =>
      structureCall("DEPARTMENT_SUBJECT_REMOVE", async () => {
        const { id, subjectId } = await ctx.params;
        if (!(await canManageDepartment(auth, id)))
          return fail("Only an administrator or the head of this department can change it.", 403, "FORBIDDEN");
        const done = await removeSubject(auth.userId, id, subjectId);
        return done ? ok(done) : notFound("Subject");
      }),
  ),
  { roles: READ_ROLES },
);
