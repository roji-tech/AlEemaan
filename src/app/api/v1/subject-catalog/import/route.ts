import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { bulkBodyShape, bulkResponse } from "@/lib/bulk/http";
import { runBulk } from "@/lib/bulk/server";
import { subjectCatalogKind } from "@/lib/bulk/subject-catalog-server";

// POST /api/v1/subject-catalog/import { dryRun, rows: [{ line, values: {...} }] }   (task 0119) SUPERADMIN only.
// `dryRun: true` checks every row and writes nothing (200, a verdict per row). `dryRun: false` checks everything again inside one transaction and saves ALL the rows or NONE: 201, or 422
// `BULK_PROBLEMS` with every row's verdict. The same engine, limits and batches as the branch subjects' import.
const body = z.strictObject({ ...bulkBodyShape() });
const PER_WINDOW = 150; // per superadmin per 5 minutes: a dry run, and each batch of 20 rows of a save, is a request

export const POST = withAuth(
  validate({ body }, async (_req, auth, _ctx, { body }) => {
    if (!(await reserveAttempt(`bulk:subject-catalog:${auth.userId}`, PER_WINDOW)))
      return fail("Too many bulk requests. Please try again in a few minutes.", 429, "RATE_LIMITED");
    return structureCall("SUBJECT_CATALOG_BULK", async () =>
      bulkResponse(await runBulk(subjectCatalogKind, {}, { dryRun: body.dryRun, rows: body.rows }, auth.userId)),
    );
  }),
  { superAdmin: true },
);
