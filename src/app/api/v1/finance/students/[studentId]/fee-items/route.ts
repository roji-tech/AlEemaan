import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { pupilFeeItems } from "@/lib/finance/fee-items";
import { feeItemFailure } from "@/lib/finance/fee-items-http";

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

/// GET /api/v1/finance/students/[studentId]/fee-items?branchId=&periodId= (task 0122)
/// The period's fee lines for this pupil's class: each with whether the pupil is billed it, opted out of it, or it is for another kind of pupil, and whether a tracked item was handed over.
/// An administrator's: fees are financial.
export const GET = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { studentId } = await params;
      const q = new URL(req.url).searchParams;
      const branchId = q.get("branchId");
      const periodId = q.get("periodId");
      if (!branchId || !periodId) return fail("branchId and periodId are required", 400, "VALIDATION");
      if (!(await canAdminister(auth.userId, branchId))) return fail("Forbidden: you do not administer this branch", 403, "FORBIDDEN");
      return ok(await pupilFeeItems(branchId, studentId, periodId));
    } catch (error) {
      const known = feeItemFailure(error);
      if (known) return known;
      console.error("[PUPIL_FEE_ITEMS_GET_ERROR]", error);
      return fail("Unable to load the pupil's fee lines", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
