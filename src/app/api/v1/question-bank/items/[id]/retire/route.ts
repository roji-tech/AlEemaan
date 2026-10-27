import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { retireItem, reasonBody } from "@/lib/question-bank/review-service";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";

interface RouteParams {
  params: Promise<{ id: string }>;
}
type Body = Parsed<typeof reasonBody._output, undefined>;

/// POST /api/v1/question-bank/items/[id]/retire  { reason }  A reviewer in scope retires an approved question (an error was found), with a reason. Its images stay; pupils are later told only that it was corrected.
export const POST = withAuth(
  validate({ body: reasonBody }, async (_req: NextRequest, auth, { params }: RouteParams, { body }: Body) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const result = await retireItem({ userId: auth.userId, id, reason: body.reason });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  }),
  { roles: BANK_STAFF_ROLES },
);
