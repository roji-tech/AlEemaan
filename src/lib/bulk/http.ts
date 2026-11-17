import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/envelope";
import { FILE_MAX_ROWS } from "./types";
import type { BulkOutcome } from "./server";

// What every bulk route accepts and answers (task 0084). The row's values are strings, as typed or uploaded: the rules turn them into types.

/// `max` is the kind's own row cap (default: the file limit).
export const bulkBodyShape = (max: number = FILE_MAX_ROWS) => ({
  dryRun: z.boolean(),
  rows: z
    .array(
      z.strictObject({
        line: z.number().int().min(1).max(1_000_000),
        values: z
          .record(z.string().max(2000), z.string().max(2000))
          .refine((v) => Object.keys(v).length <= 40, "Too many cells in one row."),
      }),
    )
    .min(1, "Send at least one row.")
    .max(max, `Send at most ${max} rows at a time.`),
});

/// 200 for a dry run; 201 when everything was saved; 422 with EVERY row's verdict when nothing was saved because of problems; 409 when the data changed under a save.
export function bulkResponse(outcome: BulkOutcome): Response {
  switch (outcome.kind) {
    case "dry-run":
      return ok({ dryRun: true, saved: 0, verdicts: outcome.verdicts });
    case "saved":
      return ok({ dryRun: false, saved: outcome.saved, verdicts: outcome.verdicts }, {}, 201);
    case "blocked": {
      const bad = outcome.verdicts.filter((v) => v.status === "error").length;
      return NextResponse.json(
        {
          data: { dryRun: false, saved: 0, verdicts: outcome.verdicts },
          meta: {},
          error: { code: "BULK_PROBLEMS", message: `Nothing was saved: ${bad} ${bad === 1 ? "row has" : "rows have"} problems.` },
        },
        { status: 422 },
      );
    }
    case "changed":
      return fail("The records changed while saving, so nothing was saved. Check the rows again.", 409, "BULK_CHANGED");
  }
}
