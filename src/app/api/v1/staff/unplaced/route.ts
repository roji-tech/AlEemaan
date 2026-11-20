import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { structureCall } from "@/lib/academics/structure-http";
import { createUnplacedStaff, listUnplaced, unplacedInput } from "@/lib/academics/staff";

// Staff records that are not placed in a branch yet (task 0101 D3, the maintainer: "I wanna be able to add staff without adding them to any branch yet"). They belong to no branch, so no
// branch administrator has authority over them: a SUPERADMIN only (403 for anyone else; a single record is a 404, see ./[id]).
// GET  /api/v1/staff/unplaced?status=live|archived|all&q=   the unplaced records.
// POST /api/v1/staff/unplaced { category, firstName, lastName, phone?, email?, title?, gender?, designation?, qualification?, corpsMember?, role?, isDraft? }   makes one with no branch. It never
//      creates a sign-in account. The address must be unique among live unplaced records (409).
const query = z.object({ status: z.enum(["live", "archived", "all"]).optional(), q: z.string().max(100).optional() });
const SUPER_ONLY = () => fail("Only a superadmin can see or add staff who are not placed in a branch.", 403, "FORBIDDEN");

export const GET = withAuth(
  validate({ query }, async (_req, auth: AuthContext, _ctx: unknown, input) => {
    if (!(await isSuperAdmin(auth.userId))) return SUPER_ONLY();
    return structureCall("STAFF_UNPLACED_LIST", async () =>
      ok({ staff: await listUnplaced({ status: input.query.status, q: input.query.q }) }),
    );
  }),
  { roles: [Role.ADMIN] },
);

export const POST = withAuth(
  validate({ body: unplacedInput }, async (_req, auth: AuthContext, _ctx: unknown, input) => {
    if (!(await isSuperAdmin(auth.userId))) return SUPER_ONLY();
    return structureCall("STAFF_UNPLACED_CREATE", async () => ok({ staff: await createUnplacedStaff(auth.userId, input.body) }, {}, 201));
  }),
  { roles: [Role.ADMIN] },
);
