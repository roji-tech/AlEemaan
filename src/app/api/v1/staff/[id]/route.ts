import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, notFound, structureCall } from "@/lib/academics/structure-http";
import { getStaff, staffBranchId, staffPatch, updateStaff } from "@/lib/academics/staff";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// GET   /api/v1/staff/[id]   one record with its assignments. Any staff role held in the record's branch; a record of another branch is the same 404 as an unknown id.
// PATCH /api/v1/staff/[id] { category?, firstName?, lastName?, phone?, email? }   Administrators of the record's branch. A record with a sign-in account keeps its category.
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
