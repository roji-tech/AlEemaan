import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { retryDispatch } from "@/lib/communication/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/communication/dispatches/[id]/retry
 */
export const POST = withAuthGated(
  "administer",
  async (req: NextRequest, auth: AuthContext, { params }: RouteParams) => {
    try {
      const { id } = await params;
      let branchId: string | null = null;

      try {
        const body = await req.json();
        branchId = body?.branchId || null;
      } catch {
        // Body may be empty, try query param
      }

      if (!branchId) {
        const { searchParams } = new URL(req.url);
        branchId = searchParams.get("branchId");
      }

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const res = await retryDispatch(branchId, id, auth.userId);
      return ok(res);
    } catch (error) {
      console.error("[COMMUNICATION_DISPATCH_RETRY_ERROR]", error);
      return fail("Unable to retry message dispatch", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
