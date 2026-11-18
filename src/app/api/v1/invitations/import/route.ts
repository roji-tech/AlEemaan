import { after } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { reserveAttempt } from "@/lib/auth/rate-limit";
import { structureCall } from "@/lib/academics/structure-http";
import { bulkBodyShape, bulkResponse } from "@/lib/bulk/http";
import { invitationEntity } from "@/lib/bulk/invitations";
import { invitationKind } from "@/lib/bulk/invitations-server";
import { runBulk } from "@/lib/bulk/server";
import { branchIdField, scopeOrForbidden } from "@/lib/members/http";

// POST /api/v1/invitations/import { branchId, dryRun, rows: [{ line, values: { email, role } }] }   (task 0084)
// Administrators only, with the authority of one invitation: a branch administrator invites to their own branches and never makes an administrator. `dryRun: true` checks every row
// and writes nothing (200, a verdict per row, a row that would replace an open invitation says so). `dryRun: false` checks again inside one transaction and creates ALL the
// invitations or NONE (201, or 422 `BULK_PROBLEMS` with every row's verdict); the e-mails are sent after the commit, so a failed send never undoes an invitation.
const body = z.strictObject({ branchId: branchIdField, ...bulkBodyShape(invitationEntity.maxRows) });
const DRY_PER_WINDOW = 30; // per administrator per 5 minutes
const SAVE_PER_WINDOW = 20; // saving goes in batches of 20 rows (task 0095): 20 requests is the old ceiling of two saves of 200 invitations in five minutes, counted apart from the 30 single invitations

export const POST = withAuth(
  validate(
    { body },
    withBranch<Parsed<z.infer<typeof body>, undefined>, AuthContext, unknown>(
      { of: ({ body }) => body.branchId, as: "administer", where: "body" },
      async (_req, auth, _ctx, { body }) => {
        const key = body.dryRun ? `bulk:invitations:dry:${auth.userId}` : `bulk:invitations:save:${auth.userId}`;
        if (!(await reserveAttempt(key, body.dryRun ? DRY_PER_WINDOW : SAVE_PER_WINDOW)))
          return fail("Too many bulk requests. Please try again in a few minutes.", 429, "RATE_LIMITED");
        const scope = await scopeOrForbidden(auth.userId);
        if (scope instanceof Response) return scope;
        return structureCall("INVITATIONS_BULK", async () => {
          const outcome = await runBulk(
            invitationKind,
            { branchId: body.branchId, scope, inviterName: auth.user.name },
            { dryRun: body.dryRun, rows: body.rows },
            auth.userId,
          );
          if (outcome.kind === "saved" && outcome.afterCommit) after(outcome.afterCommit);
          return bulkResponse(outcome);
        });
      },
    ),
  ),
  { roles: ["ADMIN"] },
);
