import { z } from "zod";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { bulkBodyShape, bulkResponse } from "@/lib/bulk/http";
import { runBulk } from "@/lib/bulk/server";
import { staffKind } from "@/lib/bulk/staff-server";

// POST /api/v1/staff/import { branchId, dryRun, rows: [{ line, values: { category, firstName, lastName, phone?, email? } }] }   (task 0084)
// Administrators of that branch (a branch named in the body that is not theirs: 403). `dryRun: true` checks every row and writes nothing (200, a verdict per row). `dryRun: false`
// checks everything again inside one transaction and saves ALL the rows or NONE: 201, or 422 `BULK_PROBLEMS` with every row's verdict. Creating a record never creates a sign-in.
// `asDraft: true` (task 0101 D1) saves every row as a draft: the rows' own rules still apply, the completeness rules do not. Default false.
const body = z.strictObject({ branchId: z.string().min(1), asDraft: z.boolean().optional().default(false), ...bulkBodyShape() });
const PER_WINDOW = 150; // per administrator per 5 minutes: a dry run, and each batch of 20 rows of a save (task 0095), is a request: 150 is 3,000 rows

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) => {
        if (!(await reserveAttempt(`bulk:staff:${auth.userId}`, PER_WINDOW)))
          return fail("Too many bulk requests. Please try again in a few minutes.", 429, "RATE_LIMITED");
        return structureCall("STAFF_BULK", async () =>
          bulkResponse(
            await runBulk(
              staffKind,
              { branchId: body.branchId, asDraft: body.asDraft },
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
