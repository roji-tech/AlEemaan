import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";
import { setUsesDepartments, usesDepartments } from "@/lib/academics/departments-setting";

// The branch's "Use departments" switch (task 0101 D7; setting `academics.useDepartments`, off until an administrator turns it on).
//
// GET /api/v1/settings/departments?branchId=            whether the branch uses departments. Any staff role held IN that branch; another branch's id is a 404.
// PUT /api/v1/settings/departments { branchId, enabled }  turns it on or off. Administrators of that branch (a branch named in the body that is not theirs: 403) and superadmins. Audited in
//                                                        SettingAudit when it changes. Turning it off deletes nothing.
const query = z.object({ branchId: z.string().min(1, "branchId is required") });
const body = z.strictObject({ branchId: z.string().min(1, "branchId is required"), enabled: z.boolean() });

export const GET = withAuth(
  validate(
    { query },
    withBranch<Parsed<undefined, z.infer<typeof query>>, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "staff-read" },
      async (_req, _auth, _ctx, { query }) =>
        structureCall("SETTINGS_DEPARTMENTS_GET", async () =>
          ok({ branchId: query.branchId, enabled: await usesDepartments(query.branchId) }),
        ),
    ),
  ),
  { roles: READ_ROLES },
);

export const PUT = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("SETTINGS_DEPARTMENTS_PUT", async () => {
          const change = await setUsesDepartments(body.branchId, body.enabled, auth.userId);
          return ok({ branchId: body.branchId, enabled: change.after, changed: change.changed });
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);
