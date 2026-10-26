import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { approveBody, approveItem } from "@/lib/question-bank/review-service";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";

interface RouteParams {
  params: Promise<{ id: string }>;
}
type Body = Parsed<typeof approveBody._output, undefined>;

/// POST /api/v1/question-bank/items/[id]/approve  { visibility?, visibleFrom?, general?, subject?, classTags? }  A reviewer in scope approves a pending question that is not their
/// own. Visibility other than "teachers only" and `general` need the extra authority named in rules.ts; without them the question is approved TEACHERS_ONLY in its own branch.
export const POST = withAuth(
  validate({ body: approveBody }, async (_req: NextRequest, auth, { params }: RouteParams, { body }: Body) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const result = await approveItem({ userId: auth.userId, id, body });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  }),
  { roles: BANK_STAFF_ROLES },
);
