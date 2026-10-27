import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { withAuth } from "@/lib/auth/with-auth";
import { submitItem } from "@/lib/question-bank/items-service";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/// POST /api/v1/question-bank/items/[id]/submit  Sends the caller's own draft or rejected question for review. The caller is told only that it is pending, never whether it was flagged.
export const POST = withAuth(
  async (_req: NextRequest, auth, { params }: RouteParams) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const result = await submitItem({ userId: auth.userId, id });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  },
  { roles: BANK_STAFF_ROLES },
);
