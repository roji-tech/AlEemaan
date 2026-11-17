import { Role } from "@prisma/client";
import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { bulkBodyShape, bulkResponse } from "@/lib/bulk/http";
import { feeKind } from "@/lib/bulk/fees-server";
import { runBulk } from "@/lib/bulk/server";

// POST /api/v1/finance/fee-structures/import { branchId, dryRun, rows: [{ line, values: { period, classGroup?, name, amount } }] }   (task 0084)
// Administrators of that branch (a branch named in the body that is not theirs: 403). The period and the class are found by name in the branch. `dryRun: true` checks every row and
// writes nothing (200, a verdict per row); `dryRun: false` checks again inside one transaction and saves ALL the fee lines or NONE (201, or 422 `BULK_PROBLEMS`). A line that already
// exists for that period, class and name is refused. Invoices already issued are not changed: an invoice keeps its own line-item snapshot.
const body = z.strictObject({ branchId: z.string().min(1, "Branch ID is required"), ...bulkBodyShape() });
const PER_WINDOW = 30; // per administrator per 5 minutes

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) => {
        if (!(await reserveAttempt(`bulk:fees:${auth.userId}`, PER_WINDOW)))
          return fail("Too many bulk requests. Please try again in a few minutes.", 429, "RATE_LIMITED");
        return structureCall("FEES_BULK", async () =>
          bulkResponse(await runBulk(feeKind, { branchId: body.branchId }, { dryRun: body.dryRun, rows: body.rows }, auth.userId)),
        );
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
