import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { withBranch } from "@/lib/auth/with-branch";
import { validate, type Parsed } from "@/lib/api/validate";
import { ok, fail } from "@/lib/api/envelope";
import { branchStats } from "@/lib/finance/stats-service";

// Not strict: the screen adds a throwaway `n` to ask again after an error, and unknown keys are dropped, never passed on.
const statsQuery = z.object({
  branchId: z.string().min(1, "branchId query parameter is required").max(64),
  periodId: z.string().min(1).max(64).optional(),
});
type StatsInput = Parsed<undefined, z.infer<typeof statsQuery>>;

/**
 * GET /api/v1/finance/stats?branchId=...&periodId=...   (task 0106)
 * The figures of Finance's Overview for ONE branch, optionally limited to one of its terms: invoiced, collected, outstanding, overdue and its ageing, by status, by class, by how it was
 * paid, and month by month. Added up in the database. Read-only. An administrator of THIS branch (or a superadmin) only, as the invoices are: they name what families owe. The branch is
 * resolved and the caller's authority there checked BEFORE the handler runs (ADR 0015); a branch the caller does not administer is a 403, as the invoices list answers it.
 */
export const GET = withAuth(
  validate(
    { query: statsQuery },
    withBranch<StatsInput, AuthContext, unknown>(
      {
        of: ({ query }) => query.branchId,
        as: "administer",
        refuse: () => fail("Forbidden: you do not administer this branch", 403, "FORBIDDEN"),
      },
      async (_req, _auth, _ctx, { query }, branch) => {
        try {
          const periodId = query.periodId ?? null;
          // A term of ANOTHER branch (or none at all) is not found: never a number for a term this branch does not have.
          if (
            periodId &&
            !(await prisma.academicPeriod.findFirst({ where: { id: periodId, branchId: branch.branchId }, select: { id: true } }))
          ) {
            return fail("Term not found", 404, "NOT_FOUND");
          }
          return ok(await branchStats(branch.branchId, periodId));
        } catch (error) {
          console.error("[FINANCE_STATS_ERROR]", error);
          return fail("Unable to read the statistics", 500, "INTERNAL");
        }
      },
    ),
  ),
  { roles: [Role.ADMIN] },
);
