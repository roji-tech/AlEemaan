import { ok, fail } from "@/lib/api/envelope";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";
import { canManageDepartment, departmentBranchId, removeMember } from "@/lib/academics/departments";

type Context = { params: Promise<{ id: string; staffId: string }> };

// DELETE /api/v1/academics/departments/[id]/members/[staffId]   Takes a person out of the department: an administrator of its branch, or ITS head (task 0101 D7). If they were the head, the
// department has no head now. A person who is not in it is a 404.
export const DELETE = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => departmentBranchId((await ctx.params).id), as: "staff-read", refuse: () => notFound("Department") },
    async (_req, auth, ctx) =>
      structureCall("DEPARTMENT_MEMBER_REMOVE", async () => {
        const { id, staffId } = await ctx.params;
        if (!(await canManageDepartment(auth, id)))
          return fail("Only an administrator or the head of this department can change it.", 403, "FORBIDDEN");
        const done = await removeMember(auth.userId, id, staffId);
        return done ? ok(done) : notFound("Member");
      }),
  ),
  { roles: READ_ROLES },
);
