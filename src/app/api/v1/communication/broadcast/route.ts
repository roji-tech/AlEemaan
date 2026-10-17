import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuth, type AuthContext } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { BroadcastMessageSchema } from "@/lib/communication/validation";
import { broadcastMessage } from "@/lib/communication/service";

/**
 * POST /api/v1/communication/broadcast
 */
export const POST = withAuth(
  async (req: NextRequest, auth: AuthContext) => {
    try {
      const body = await req.json();
      const branchId = body?.branchId;

      if (!branchId) {
        return fail("branchId is required", 400, "VALIDATION");
      }

      const parsed = BroadcastMessageSchema.safeParse(body);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? "Invalid broadcast payload", 400, "VALIDATION");
      }

      const res = await broadcastMessage(branchId, parsed.data, auth.userId);
      return ok(res, {}, 201);
    } catch (error) {
      console.error("[COMMUNICATION_BROADCAST_ERROR]", error);
      return fail("Unable to dispatch broadcast campaign", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
