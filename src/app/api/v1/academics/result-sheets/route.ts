import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { approverScope, covers } from "@/lib/academics/approver-scope";
import { armBranchOf, getSheet, mayEnterResults, saveSheet, sheetInput, sheetQuery } from "@/lib/academics/results";
import { structureCall } from "@/lib/academics/structure-http";

// GET /api/v1/academics/result-sheets?periodId=&classArmId=&subjectId=   the sheet for one subject in one arm and term: the students, the scheme's parts, what is
//   entered so far. An administrator of the arm's branch, or a teacher ASSIGNED to that subject and arm; anyone else in the branch is refused (403), another
//   branch's arm is the same 404 as an unknown one. To READ it (not to save it), an approver whose scope (task 0039) reaches the arm may too.
// PUT /api/v1/academics/result-sheets { periodId, classArmId, subjectId, entries, removeStudentIds? }   saves DRAFT results (all or nothing). Same people.
const ROLES = [Role.ADMIN, Role.TEACHING_STAFF];
const READ_ROLES = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];
const notAssigned = () => fail("You are not assigned to teach this subject to this class.", 403, "FORBIDDEN");

export const GET = withAuth(
  validate(
    { query: sheetQuery },
    withBranch<Parsed<undefined, z.infer<typeof sheetQuery>>, AuthContext, unknown>(
      { of: ({ query }) => armBranchOf(query.classArmId), as: "staff-read" },
      async (_req, auth, _ctx, { query }, branch) =>
        structureCall("RESULT_SHEET", async () => {
          if (!(await mayEnterResults(auth.userId, branch.role, branch.branchId, query.subjectId, query.classArmId))) {
            if (!covers(await approverScope(branch.branchId, auth.userId), query.classArmId)) return notAssigned();
          }
          return ok({ sheet: await getSheet(branch.branchId, query) });
        }),
    ),
  ),
  { roles: READ_ROLES },
);

export const PUT = withAuth(
  validate(
    { body: sheetInput },
    withBranch<Parsed<z.infer<typeof sheetInput>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => armBranchOf(body.classArmId), as: "staff-write" },
      async (_req, auth, _ctx, { body }, branch) =>
        structureCall("RESULT_SHEET_SAVE", async () => {
          if (!(await mayEnterResults(auth.userId, branch.role, branch.branchId, body.subjectId, body.classArmId))) return notAssigned();
          return ok(await saveSheet(auth.userId, branch.branchId, body));
        }),
    ),
  ),
  { roles: ROLES },
);
