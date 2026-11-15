import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { ok, fail } from "@/lib/api/envelope";
import { countWaiting } from "@/lib/communication/queue";

/**
 * GET /api/v1/communication/queue?branchId=...
 * How many messages of the branch are waiting to be sent (task 0063). The Communication screen asks when it opens, to carry on with a broadcast that was cut off.
 */
export const GET = withAuthGated(
  "administer",
  async (req: NextRequest) => {
    try {
      const branchId = new URL(req.url).searchParams.get("branchId");
      if (!branchId) return fail("branchId query parameter is required", 400, "VALIDATION");
      return ok({ pending: await countWaiting(branchId) });
    } catch (error) {
      console.error("[COMMUNICATION_QUEUE_COUNT_ERROR]", error);
      return fail("Unable to read the message queue", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
