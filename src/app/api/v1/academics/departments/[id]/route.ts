import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { departmentBranchId, departmentPatch, updateDepartment } from "@/lib/academics/departments";

type Context = { params: Promise<{ id: string }> };

// PATCH /api/v1/academics/departments/[id] { name?, description?, archived? }   Administrators of the department's branch only (a head may not rename or archive their department);
// another branch's department is the same 404 as an unknown id. Archiving keeps the members, the head and the subjects.
export const PATCH = withAuth<Context>(
  validate(
    { body: departmentPatch },
    withBranch<Parsed<z.infer<typeof departmentPatch>, undefined>, AuthContext, Context>(
      {
        of: async (_input, _req, ctx) => departmentBranchId((await ctx.params).id),
        as: "administer",
        refuse: () => notFound("Department"),
      },
      async (_req, auth, ctx, { body }) =>
        structureCall("DEPARTMENT_UPDATE", async () => {
          const updated = await updateDepartment(auth.userId, (await ctx.params).id, body);
          return updated
            ? ok({ department: { id: updated.id, name: updated.name, archived: updated.archivedAt !== null } })
            : notFound("Department");
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
