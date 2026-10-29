import { z } from "zod";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { resultsBranchId, transitionInput, transitionResults } from "@/lib/academics/results-workflow";
import { structureCall } from "@/lib/academics/structure-http";

// POST /api/v1/academics/results/transition { action, resultIds, reason? }
//   action: submit (the author or an administrator) | return | approve (not your own) | revert | publish | lock | unlock (reason required) - the last six are for an
//   administrator of the branch; all but unlock are also for an approver (task 0039) on results in their scope. All or nothing. Results that do not exist, or belong to
//   different branches, are the same 404; anyone else asking for one of those actions, or an approver for a result outside their scope, is a 403.
export const POST = withAuth(
  validate(
    { body: transitionInput },
    withBranch<Parsed<z.infer<typeof transitionInput>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => resultsBranchId(body.resultIds), as: "staff-read" },
      async (_req, auth, _ctx, { body }, branch) =>
        structureCall("RESULT_TRANSITION", async () => ok(await transitionResults(auth.userId, branch.role, branch.branchId, body))),
    ),
  ),
  { roles: [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF] },
);
