import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { setFeeOptOut } from "@/lib/finance/fee-items";
import { feeItemFailure, optOutBody } from "@/lib/finance/fee-items-http";

interface RouteParams {
  params: Promise<{ studentId: string; feeId: string }>;
}

/// PUT /api/v1/finance/students/[studentId]/fee-items/[feeId]/opt-out?branchId= { optedOut, note? } (task 0122)
/// Opt a pupil out of an optional fee line, or back in. The invoice, if there is one, is changed too, but only while nothing was paid on it (409 INVOICE_LOCKED says why otherwise).
export const PUT = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { studentId, feeId } = await params;
      const branchId = new URL(req.url).searchParams.get("branchId");
      if (!branchId) return fail("branchId query parameter is required", 400, "VALIDATION");
      if (!(await canAdminister(auth.userId, branchId))) return fail("Forbidden: you do not administer this branch", 403, "FORBIDDEN");
      const read = await readJsonBody(req);
      if (!read.ok) return read.response;
      const parsed = optOutBody.safeParse(read.json);
      if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid body", 400, "VALIDATION");
      return ok(await setFeeOptOut(branchId, studentId, feeId, parsed.data.optedOut, auth.userId, parsed.data.note));
    } catch (error) {
      const known = feeItemFailure(error);
      if (known) return known;
      console.error("[FEE_OPT_OUT_ERROR]", error);
      return fail("Unable to change the pupil's fee line", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
