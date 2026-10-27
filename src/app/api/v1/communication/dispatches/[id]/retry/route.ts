import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { retryDispatch } from "@/lib/communication/service";
import { readBoundedText } from "@/lib/api/read-body";
import { MAX_BODY_BYTES } from "@/lib/api/validate";

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

      // The body is optional (the branch may come from the query string instead): an empty or non-JSON body is ignored. It is read no further than the cap.
      const text = await readBoundedText(req, MAX_BODY_BYTES).catch(() => "");
      if (text === null) return fail("That request is too large.", 413, "PAYLOAD_TOO_LARGE");
      try {
        const body = text.trim() ? JSON.parse(text) : null;
        branchId = body?.branchId || null;
      } catch {
        // Body is not JSON, try query param
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
