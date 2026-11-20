import { z } from "zod";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";
import { addSubjects, canManageDepartment, departmentBranchId, subjectsInput } from "@/lib/academics/departments";

type Context = { params: Promise<{ id: string }> };

// POST /api/v1/academics/departments/[id]/subjects { subjectIds }   Puts subjects in the department: an administrator of its branch, or ITS head (task 0101 D7). A subject is in at most one
// department, so one that is in another is moved here (the answer counts them). Only live subjects of the same branch; anything else is a 409 and nothing changes.
export const POST = withAuth<Context>(
  validate(
    { body: subjectsInput },
    withBranch<Parsed<z.infer<typeof subjectsInput>, undefined>, AuthContext, Context>(
      {
        of: async (_input, _req, ctx) => departmentBranchId((await ctx.params).id),
        as: "staff-read",
        refuse: () => notFound("Department"),
      },
      async (_req, auth, ctx, { body }) =>
        structureCall("DEPARTMENT_SUBJECTS_ADD", async () => {
          const id = (await ctx.params).id;
          if (!(await canManageDepartment(auth, id)))
            return fail("Only an administrator or the head of this department can change it.", 403, "FORBIDDEN");
          const done = await addSubjects(auth.userId, id, body.subjectIds);
          return done ? ok(done) : notFound("Department");
        }),
    ),
  ),
  { roles: READ_ROLES },
);
