import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { canAdminister } from "@/lib/auth/branch-access";
import { ok, fail } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { setHandover } from "@/lib/finance/fee-items";
import { feeItemFailure, handoverBody } from "@/lib/finance/fee-items-http";

interface RouteParams {
  params: Promise<{ studentId: string; feeId: string }>;
}

/// PUT /api/v1/finance/students/[studentId]/fee-items/[feeId]/handover?branchId= { received, receivedOn?, note? } (task 0122)
/// Record that a pupil received a tracked item (the uniform), or undo it. It records only: no invoice or payment waits for it.
export const PUT = withAuth(
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { studentId, feeId } = await params;
      const branchId = new URL(req.url).searchParams.get("branchId");
      if (!branchId) return fail("branchId query parameter is required", 400, "VALIDATION");
      if (!(await canAdminister(auth.userId, branchId))) return fail("Forbidden: you do not administer this branch", 403, "FORBIDDEN");
      const read = await readJsonBody(req);
      if (!read.ok) return read.response;
      const parsed = handoverBody.safeParse(read.json);
      if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid body", 400, "VALIDATION");
      return ok(
        await setHandover(branchId, studentId, feeId, parsed.data.received, auth.userId, {
          receivedOn: parsed.data.receivedOn,
          note: parsed.data.note,
        }),
      );
    } catch (error) {
      const known = feeItemFailure(error);
      if (known) return known;
      console.error("[FEE_HANDOVER_ERROR]", error);
      return fail("Unable to record the handover", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
