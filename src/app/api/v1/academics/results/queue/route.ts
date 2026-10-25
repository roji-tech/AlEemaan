import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { approverScope } from "@/lib/academics/approver-scope";
import { queueQuery, reviewQueue } from "@/lib/academics/results-workflow";
import { notFound, structureCall } from "@/lib/academics/structure-http";

// GET /api/v1/academics/results/queue?branchId=&periodId=   for a term: each arm and subject with how many results are in each status. Administrators of the branch see
// all of it; an approver (task 0039) sees the arms in their scope, and nothing when they have not been given anywhere to approve. Anyone else, and another branch's id, is a 404.
export const GET = withAuth(
  validate(
    { query: queueQuery },
    withBranch<Parsed<undefined, z.infer<typeof queueQuery>>, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "staff-read" },
      async (_req, auth, _ctx, { query }, branch) =>
        structureCall("RESULT_QUEUE", async () => {
          if (branch.role === Role.ADMIN) return ok({ queue: await reviewQueue(query.branchId, query.periodId) });
          const scope = await approverScope(query.branchId, auth.userId);
          if (!scope.approver) return notFound("Branch");
          return ok({ queue: await reviewQueue(query.branchId, query.periodId, scope) });
        }),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);
