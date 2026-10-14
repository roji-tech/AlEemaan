import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { queueQuery, reviewQueue } from "@/lib/academics/results-workflow";
import { structureCall } from "@/lib/academics/structure-http";

// GET /api/v1/academics/results/queue?branchId=&periodId=   for a term: each arm and subject with how many results are in each status. Administrators of the branch;
// another branch's id is a 404.
export const GET = withAuth(
  validate(
    { query: queueQuery },
    withBranch<Parsed<undefined, z.infer<typeof queueQuery>>, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "administer" },
      async (_req, _auth, _ctx, { query }) =>
        structureCall("RESULT_QUEUE", async () => ok({ queue: await reviewQueue(query.branchId, query.periodId) })),
    ),
  ),
  { roles: [Role.ADMIN] },
);
