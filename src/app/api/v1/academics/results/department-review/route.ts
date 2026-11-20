import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { resultsBranchId, queueQuery } from "@/lib/academics/results-workflow";
import { reviewInput, reviewQueue, reviewResults } from "@/lib/academics/department-review";
import { structureCall } from "@/lib/academics/structure-http";

// The head of department's review of results (task 0101 F), behind the branch's switch `results.departmentHeadReview` (off by default).
// GET  /api/v1/academics/results/department-review?branchId=&periodId=   the SUBMITTED results of the term in the departments the caller reviews (an administrator: all of them; a head: their own),
//      grouped by department, arm and subject, with the ids still waiting. Empty while the switch is off, and for anyone who heads no department. Any staff role held in the branch.
// POST /api/v1/academics/results/department-review { action: "pass" | "return", resultIds, reason? }   pass: the head of the subject's department, or an administrator, records the review a result
//      needs before it can be approved; return: sends them back to the teacher (a reason of 5+ characters). Never for results the caller entered or submitted themselves. All or nothing. This route
//      NEVER approves or publishes: those stay with `/results/transition`. A result of another branch, or ids spanning branches, is a 404; a head acting outside their department is a 403.
export const GET = withAuth(
  validate(
    { query: queueQuery },
    withBranch<Parsed<undefined, z.infer<typeof queueQuery>>, AuthContext, unknown>(
      { of: ({ query }) => query.branchId, as: "staff-read" },
      async (_req, auth, _ctx, { query }, branch) =>
        structureCall("RESULT_DEPARTMENT_QUEUE", async () =>
          ok({ queue: await reviewQueue(auth.userId, branch.role, query.branchId, query.periodId) }),
        ),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);

export const POST = withAuth(
  validate(
    { body: reviewInput },
    withBranch<Parsed<z.infer<typeof reviewInput>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => resultsBranchId(body.resultIds), as: "staff-read" },
      async (_req, auth, _ctx, { body }, branch) =>
        structureCall("RESULT_DEPARTMENT_REVIEW", async () => ok(await reviewResults(auth.userId, branch.role, branch.branchId, body))),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);
