import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, noStore } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { unlistedMembers } from "@/lib/academics/staff-accounts";

// GET /api/v1/staff/unlisted?branchId=   the people who sign in to this branch with a staff role (administrator, teaching, non-teaching) and are on none of its staff records
// (task 0112). An administrator of that branch or a superadmin; another branch's id is a 404.
const query = z.object({ branchId: z.string().trim().min(1).max(64) });

export const GET = withAuth(
  validate(
    { query },
    withBranch<Parsed<undefined, z.infer<typeof query>>, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "administer" },
      async (_req, _auth, _ctx, { query: q }) => noStore(ok({ members: await unlistedMembers(q.branchId) })),
    ),
  ),
  { roles: [Role.ADMIN] },
);
