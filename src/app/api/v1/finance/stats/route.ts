import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { branchStats } from "@/lib/finance/stats-service";

/**
 * GET /api/v1/finance/stats?branchId=...&periodId=...   (task 0106)
 * The figures of Finance's Overview for ONE branch, optionally limited to one of its terms: invoiced, collected, outstanding, overdue and its ageing, by status, by class, by how it was
 * paid, and month by month. Added up in the database. Read-only. An administrator of THIS branch (or a superadmin) only, as the invoices are: they name what families owe.
 */
export const GET = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const { searchParams } = new URL(req.url);
      const branchId = searchParams.get("branchId");
      if (!branchId) return fail("branchId query parameter is required", 400, "VALIDATION");
      if (!(await canAdminister(auth.userId, branchId))) return fail("Forbidden: you do not administer this branch", 403, "FORBIDDEN");

      const periodId = searchParams.get("periodId") || null;
      // A term of ANOTHER branch (or none at all) is not found: never a number for a term this branch does not have.
      if (periodId && !(await prisma.academicPeriod.findFirst({ where: { id: periodId, branchId }, select: { id: true } }))) {
        return fail("Term not found", 404, "NOT_FOUND");
      }
      return ok(await branchStats(branchId, periodId));
    } catch (error) {
      console.error("[FINANCE_STATS_ERROR]", error);
      return fail("Unable to read the statistics", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
