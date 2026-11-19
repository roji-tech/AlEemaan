import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";
import { addMembers, canManageDepartment, departmentBranchId, membersInput } from "@/lib/academics/departments";

type Context = { params: Promise<{ id: string }> };

// POST /api/v1/academics/departments/[id]/members { staffIds }   Adds people to the department: an administrator of its branch, or ITS head (task 0101 D7); another staff member of the branch is
// a 403, another branch's department a 404. Only live staff of the same branch; anyone else makes the whole request a 409 and nothing is added.
export const POST = withAuth<Context>(
  validate(
    { body: membersInput },
    withBranch<Parsed<z.infer<typeof membersInput>, undefined>, AuthContext, Context>(
      {
        of: async (_input, _req, ctx) => departmentBranchId((await ctx.params).id),
        as: "staff-read",
        refuse: () => notFound("Department"),
      },
      async (_req, auth, ctx, { body }) =>
        structureCall("DEPARTMENT_MEMBERS_ADD", async () => {
          const id = (await ctx.params).id;
          if (!(await canManageDepartment(auth, id)))
            return fail("Only an administrator or the head of this department can change it.", 403, "FORBIDDEN");
          const done = await addMembers(auth.userId, id, body.staffIds);
          return done ? ok(done) : notFound("Department");
        }),
    ),
  ),
  { roles: READ_ROLES },
);
