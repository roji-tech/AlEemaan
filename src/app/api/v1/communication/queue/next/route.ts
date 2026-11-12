import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { withAuthGated } from "@/lib/auth/branch-gate";
import { ok, fail } from "@/lib/api/envelope";
import { readJsonObject } from "@/lib/api/validate";
import { sendNextBatch } from "@/lib/communication/queue";

/**
 * POST /api/v1/communication/queue/next   { branchId }
 * Sends the next batch (up to 10) of the branch's waiting messages and says how many are left (task 0063). The server chooses the rows; the answer is counts and the reason of the first
 * failure, never an address or a message. Safe to call from two tabs at once: a row is taken by one call only.
 */
export const POST = withAuthGated(
  "administer",
  async (req: NextRequest) => {
    try {
      const read = await readJsonObject(req);
      if (!read.ok) return read.response;
      const branchId = (read.json as { branchId?: unknown }).branchId;
      if (typeof branchId !== "string" || !branchId) return fail("branchId is required", 400, "VALIDATION");
      return ok(await sendNextBatch(branchId));
    } catch (error) {
      console.error("[COMMUNICATION_QUEUE_NEXT_ERROR]", error);
      return fail("Unable to send the next messages", 500, "INTERNAL");
    }
  },
  { roles: [Role.ADMIN] },
);
