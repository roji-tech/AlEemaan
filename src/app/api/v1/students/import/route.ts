import { Role } from "@prisma/client";
import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { bulkBodyShape, bulkResponse } from "@/lib/bulk/http";
import { pupilKind } from "@/lib/bulk/pupils-server";
import { runBulk } from "@/lib/bulk/server";

// POST /api/v1/students/import { branchId, dryRun, allowDuplicates?, rows: [{ line, values: { firstName, lastName, gender, dateOfBirth, ... } }] }   (task 0084)
// Administrators of that branch (a branch named in the body that is not theirs: 403). `dryRun: true` checks every row (the shared rules, repeats inside the file, a class and arm of
// this branch, an admission number already taken, a namesake) and writes nothing: 200, a verdict per row. `dryRun: false` checks again inside one transaction and saves ALL the rows
// or NONE: 201, or 422 `BULK_PROBLEMS` with every row's verdict. `allowDuplicates` adds a pupil whose name (and date of birth, when both have one) is already in the branch, recorded against the caller. The date of birth is not required.
// (This used to save every good row and skip the rest, with no dry run: that is gone, and so is the body it took.)
const body = z.strictObject({
  branchId: z.string().min(1, "Branch ID is required"),
  allowDuplicates: z.boolean().optional().default(false),
  ...bulkBodyShape(),
});
const PER_WINDOW = 150; // per administrator per 5 minutes: a dry run, and each batch of 20 rows of a save (task 0095), is a request: 150 is 3,000 rows

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) => {
        if (!(await reserveAttempt(`bulk:pupils:${auth.userId}`, PER_WINDOW)))
          return fail("Too many bulk requests. Please try again in a few minutes.", 429, "RATE_LIMITED");
        return structureCall("STUDENTS_BULK", async () =>
          bulkResponse(
            await runBulk(
              pupilKind,
              { branchId: body.branchId, allowDuplicates: body.allowDuplicates },
              { dryRun: body.dryRun, rows: body.rows },
              auth.userId,
            ),
          ),
        );
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
