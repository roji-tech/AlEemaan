import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { setFeeAdmission } from "@/lib/finance/fee-items";
import { feeItemFailure } from "@/lib/finance/fee-items-http";

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

const body = z.strictObject({ admission: z.enum(["NEW", "RETURNING"]).nullable() });

/// PUT /api/v1/finance/students/[studentId]/admission-status?branchId= { admission: "NEW" | "RETURNING" | null } (task 0122)
/// How the fee lines see the pupil: new or returning, or null to work it out from their enrolments. For invoices still to be made. An administrator's.
export const PUT = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { studentId } = await params;
      const branchId = new URL(req.url).searchParams.get("branchId");
      if (!branchId) return fail("branchId query parameter is required", 400, "VALIDATION");
      if (!(await canAdminister(auth.userId, branchId))) return fail("Forbidden: you do not administer this branch", 403, "FORBIDDEN");
      const read = await readJsonBody(req);
      if (!read.ok) return read.response;
      const parsed = body.safeParse(read.json);
      if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid body", 400, "VALIDATION");
      return ok(await setFeeAdmission(branchId, studentId, parsed.data.admission, auth.userId));
    } catch (error) {
      const known = feeItemFailure(error);
      if (known) return known;
      console.error("[FEE_ADMISSION_ERROR]", error);
      return fail("Unable to change how the fee lines see this pupil", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
