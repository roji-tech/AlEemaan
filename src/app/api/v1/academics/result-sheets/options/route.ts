import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { entryOptions, optionsQuery } from "@/lib/academics/results";
import { structureCall } from "@/lib/academics/structure-http";

// GET /api/v1/academics/result-sheets/options?branchId=   what the entry screen offers: the terms of the active session and the (class arm, subject) pairs this person
// may enter results for - all offered pairs for an administrator of the branch, only assigned ones for a teacher. Same people as the sheet itself; another branch is a 404.
export const GET = withAuth(
  validate(
    { query: optionsQuery },
    withBranch<Parsed<undefined, z.infer<typeof optionsQuery>>, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "staff-write" },
      async (_req, auth, _ctx, { query }, branch) =>
        structureCall("RESULT_OPTIONS", async () => ok(await entryOptions(auth.userId, branch.role, query.branchId))),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF] },
);
