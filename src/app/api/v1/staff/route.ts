import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { READ_ROLES, structureCall } from "@/lib/academics/structure-http";
import { createStaff, listStaff, staffInput } from "@/lib/academics/staff";

// GET  /api/v1/staff?branchId=&status=live|archived|all&q=   the branch's staff records. Any staff role held IN that branch; another branch's id is a 404.
// POST /api/v1/staff { branchId, category, firstName, lastName, phone?, email? }   Administrators of that branch (a branch named in the body that is not theirs: 403).
//                                                            Creating a record never creates a sign-in account.
const query = z.object({
  branchId: z.string().min(1, "branchId is required"),
  status: z.enum(["live", "archived", "all"]).optional(),
  q: z.string().max(100).optional(),
});
type Query = Parsed<undefined, z.infer<typeof query>>;

export const GET = withAuth(
  validate(
    { query },
    withBranch<Query, AuthContext, unknown>({ of: ({ query }) => query.branchId, as: "staff-read" }, async (_req, _auth, _ctx, { query }) =>
      structureCall("STAFF_LIST", async () => ok({ staff: await listStaff(query.branchId, { status: query.status, q: query.q }) })),
    ),
  ),
  { roles: READ_ROLES },
);

export const POST = withAuth(
  validate(
    { body: staffInput },
    withBranch<Parsed<z.infer<typeof staffInput>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) =>
        structureCall("STAFF_CREATE", async () => ok({ staff: await createStaff(auth.userId, body) }, {}, 201)),
    ),
  ),
  { roles: [Role.ADMIN] },
);
