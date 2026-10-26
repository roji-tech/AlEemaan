import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { rejectItem, reasonBody } from "@/lib/question-bank/review-service";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";

interface RouteParams {
  params: Promise<{ id: string }>;
}
type Body = Parsed<typeof reasonBody._output, undefined>;

/// POST /api/v1/question-bank/items/[id]/reject  { reason }  A reviewer in scope rejects a pending question that is not their own, with a reason the writer is shown.
export const POST = withAuth(
  validate({ body: reasonBody }, async (_req: NextRequest, auth, { params }: RouteParams, { body }: Body) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const result = await rejectItem({ userId: auth.userId, id, reason: body.reason });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  }),
  { roles: BANK_STAFF_ROLES },
);
