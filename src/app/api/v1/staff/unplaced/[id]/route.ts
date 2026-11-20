import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { notFound, structureCall } from "@/lib/academics/structure-http";
import { isUnplaced, staffPatch, updateStaff } from "@/lib/academics/staff";
import { deleteStaffRecord } from "@/lib/academics/staff-delete";

type Context = { params: Promise<{ id: string }> };
const gone = () => notFound("Staff record");

// A record that is not placed in a branch (task 0101 D3). A SUPERADMIN only; for anyone else, and for a record that IS placed, it is the same 404 as an unknown id, so the existence of a
// record is never shown to someone with no authority over it. A placed record is changed through /api/v1/staff/[id].
// PATCH  /api/v1/staff/unplaced/[id] { ...staffPatch }   changes the record (as for any record; a PATCH never clears the draft flag).
// DELETE /api/v1/staff/unplaced/[id]                      permanently deletes it (it can have no history: nothing can point at a record with no branch); the one deletion, as task 0117.
async function guard(userId: string, id: string): Promise<Response | null> {
  if (!(await isSuperAdmin(userId))) return gone();
  return (await isUnplaced(id)) === true ? null : gone();
}

export const PATCH = withAuth<Context>(
  validate({ body: staffPatch }, async (_req, auth: AuthContext, ctx: Context, input) => {
    const id = (await ctx.params).id;
    const refused = await guard(auth.userId, id);
    if (refused) return refused;
    return structureCall("STAFF_UNPLACED_UPDATE", async () => {
      const staff = await updateStaff(auth.userId, id, input.body);
      return staff ? ok({ staff }) : gone();
    });
  }),
  { roles: [Role.ADMIN] },
);

export const DELETE = withAuth<Context>(
  async (_req, auth: AuthContext, ctx: Context) => {
    const id = (await ctx.params).id;
    const refused = await guard(auth.userId, id);
    if (refused) return refused;
    return structureCall("STAFF_UNPLACED_DELETE", async () => {
      const deleted = await deleteStaffRecord(auth.userId, id);
      return deleted ? ok({ deleted }) : fail("Staff record not found.", 404, "NOT_FOUND");
    });
  },
  { roles: [Role.ADMIN] },
);
