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
import { subjectKind } from "@/lib/bulk/subjects-server";

// POST /api/v1/academics/subjects/import { branchId, dryRun, rows: [{ line, values: {...} }] }   (task 0084)
// Administrators of that branch (a branch named in the body that is not theirs: 403). `dryRun: true` checks every row and writes nothing (200, a verdict per row). `dryRun: false` checks
// everything again inside one transaction and saves ALL the rows or NONE: 201, or 422 `BULK_PROBLEMS` with every row's verdict.
const body = z.strictObject({ branchId: z.string().min(1), ...bulkBodyShape() });
const PER_WINDOW = 30; // per administrator per 5 minutes: a dry run and a save are both requests

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) => {
        if (!(await reserveAttempt(`bulk:subjects:${auth.userId}`, PER_WINDOW)))
          return fail("Too many bulk requests. Please try again in a few minutes.", 429, "RATE_LIMITED");
        return structureCall("SUBJECTS_BULK", async () =>
          bulkResponse(await runBulk(subjectKind, { branchId: body.branchId }, { dryRun: body.dryRun, rows: body.rows }, auth.userId)),
        );
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
