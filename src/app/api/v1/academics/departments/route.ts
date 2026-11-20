import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";
import { createDepartment, departmentInput, listDepartments } from "@/lib/academics/departments";
import { usesDepartments } from "@/lib/academics/departments-setting";

// GET  /api/v1/academics/departments?branchId=&includeArchived=   whether the branch uses departments, and its departments with their head, members and subjects (task 0101 D7). Any staff role
//                                                                 held IN that branch; another branch's id is a 404. Each department says whether THIS caller may change its members and subjects.
// POST /api/v1/academics/departments { branchId, name, description? }   Administrators of that branch (a branch named in the body that is not theirs: 403); 409 while the branch does not use them.
const query = z.object({ branchId: z.string().min(1, "branchId is required"), includeArchived: z.enum(["true", "false"]).optional() });
type Query = Parsed<undefined, z.infer<typeof query>>;

export const GET = withAuth(
  validate(
    { query },
    withBranch<Query, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "staff-read" },
      async (_req, auth, _ctx, { query }, branch) =>
        structureCall("DEPARTMENTS_LIST", async () =>
          ok({
            enabled: await usesDepartments(query.branchId),
            departments: await listDepartments(query.branchId, {
              includeArchived: query.includeArchived === "true",
              viewer: { userId: auth.userId, administers: branch.role === Role.ADMIN },
            }),
          }),
        ),
    ),
  ),
  { roles: READ_ROLES },
);

export const POST = withAuth(
  validate(
    { body: departmentInput },
    withBranch<Parsed<z.infer<typeof departmentInput>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("DEPARTMENT_CREATE", async () => {
          const created = await createDepartment(auth.userId, body);
          return ok({ department: { id: created.id, name: created.name } }, {}, 201);
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
