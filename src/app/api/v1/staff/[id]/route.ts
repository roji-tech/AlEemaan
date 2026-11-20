import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";
import { getStaff, staffBranchId, staffPatch, updateStaff } from "@/lib/academics/staff";
import { deleteStaffRecord } from "@/lib/academics/staff-delete";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// GET   /api/v1/staff/[id]   one record with its assignments. Any staff role held in the record's branch; a record of another branch is the same 404 as an unknown id.
// PATCH /api/v1/staff/[id] { category?, firstName?, lastName?, phone?, email? }   Administrators of the record's branch. A record with a sign-in account keeps its category.
// DELETE /api/v1/staff/[id]   a SUPERADMIN only (task 0117; an administrator of the branch is 403): permanently deletes a record that has no history; one that teaches, is a class teacher, holds
//                              attendance grants or timetable slots, takes part in a program or authored coursework is 409 with the reasons (archive it instead). Never touches the account.
export const GET = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "staff-read", refuse: gone },
    async (_req, _auth, ctx) =>
      structureCall("STAFF_GET", async () => {
        const found = await getStaff((await ctx.params).id);
        return found ? ok(found) : gone();
      }),
  ),
  { roles: READ_ROLES },
);

export const PATCH = withAuth<Context>(
  validate(
    { body: staffPatch },
    withBranch<Parsed<z.infer<typeof staffPatch>, undefined>, AuthContext, Context>(
      { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "administer", refuse: gone },
      async (_req, auth, ctx, { body }) =>
        structureCall("STAFF_UPDATE", async () => {
          const staff = await updateStaff(auth.userId, (await ctx.params).id, body);
          return staff ? ok({ staff }) : gone();
        }),
    ),
  ),
  { roles: [Role.ADMIN] },
);

export const DELETE = withAuth<Context>(
  withBranch<undefined, AuthContext, Context>(
    { of: async (_input, _req, ctx) => staffBranchId((await ctx.params).id), as: "administer", refuse: gone },
    async (_req, auth, ctx) => {
      if (!(await isSuperAdmin(auth.userId)))
        return fail("Only a superadmin can delete a staff record. Archive it instead.", 403, "FORBIDDEN");
      return structureCall("STAFF_DELETE", async () => {
        const deleted = await deleteStaffRecord(auth.userId, (await ctx.params).id);
        return deleted ? ok({ deleted }) : gone();
      });
    },
  ),
  { roles: [Role.ADMIN] },
);
