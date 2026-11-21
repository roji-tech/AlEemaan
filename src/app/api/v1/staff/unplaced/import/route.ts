import { z } from "zod";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { bulkBodyShape, bulkResponse } from "@/lib/bulk/http";
import { runBulk } from "@/lib/bulk/server";
import { unplacedStaffKind } from "@/lib/bulk/staff-server";

// POST /api/v1/staff/unplaced/import { asDraft?, dryRun, rows: [{ line, values: { category, firstName, lastName, phone?, email?, ... } }] }   (task 0126)
// Staff with no branch yet, in bulk. They belong to no branch, so no branch administrator has authority over them: a SUPERADMIN only (403 for anyone else). `dryRun: true` checks every row
// and writes nothing; `dryRun: false` checks again inside one transaction and saves ALL the rows or NONE (201, or 422 `BULK_PROBLEMS` with every row's verdict). Never creates a sign-in.
const body = z.strictObject({ asDraft: z.boolean().optional().default(false), ...bulkBodyShape() });
const PER_WINDOW = 150; // as the branch file: per administrator per 5 minutes

export const POST = withAuth(
  validate({ body }, async (_req, auth: AuthContext, _ctx: unknown, input) => {
    if (!(await isSuperAdmin(auth.userId)))
      return fail("Only a superadmin can add staff who are not placed in a branch.", 403, "FORBIDDEN");
    if (!(await reserveAttempt(`bulk:staff-unplaced:${auth.userId}`, PER_WINDOW)))
      return fail("Too many bulk requests. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("STAFF_UNPLACED_BULK", async () =>
      bulkResponse(
        await runBulk(
          unplacedStaffKind,
          { asDraft: input.body.asDraft },
          { dryRun: input.body.dryRun, rows: input.body.rows },
          auth.userId,
        ),
      ),
    );
  }),
  { roles: [Role.ADMIN] },
);
