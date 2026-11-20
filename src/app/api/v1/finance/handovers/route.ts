import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { handoverList } from "@/lib/finance/fee-items";
import { feeItemFailure } from "@/lib/finance/fee-items-http";

/// GET /api/v1/finance/handovers?branchId=&periodId=&feeId= (task 0122)
/// The pupils with a tracked line (the uniform) on their invoice, each with the invoice's status and money paid, and whether the item was received: the list worked down when items are given out.
export const GET = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const q = new URL(req.url).searchParams;
      const branchId = q.get("branchId");
      const periodId = q.get("periodId");
      const feeId = q.get("feeId");
      if (!branchId || !periodId || !feeId) return fail("branchId, periodId and feeId are required", 400, "VALIDATION");
      if (!(await canAdminister(auth.userId, branchId))) return fail("Forbidden: you do not administer this branch", 403, "FORBIDDEN");
      return ok(await handoverList(branchId, periodId, feeId));
    } catch (error) {
      const known = feeItemFailure(error);
      if (known) return known;
      console.error("[HANDOVERS_GET_ERROR]", error);
      return fail("Unable to load the handover list", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
