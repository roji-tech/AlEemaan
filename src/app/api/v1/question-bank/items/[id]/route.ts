import type { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { readJsonBody } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { getItem, updateItem } from "@/lib/question-bank/items-service";
import { BANK_STAFF_ROLES, badId, failure } from "@/lib/question-bank/items-http";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/// GET /api/v1/question-bank/items/[id]  One question and the decisions made on it, if the caller may see it; otherwise "Not found", the same as for one that does not exist.
/// The `overlap` key is there only for an exam approver in scope or a superadmin.
export const GET = withAuth(
  async (_req: NextRequest, auth, { params }: RouteParams) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const result = await getItem({ userId: auth.userId, id });
    if (!result.ok) return failure(result);
    return ok({ item: result.item, history: result.history });
  },
  { roles: BANK_STAFF_ROLES },
);

/// PATCH /api/v1/question-bank/items/[id]  The whole question again (the body of a new one, without `branchId`). Its writer while it is a draft, pending or rejected; a reviewer
/// in scope for an approved one.
export const PATCH = withAuth(
  async (req: NextRequest, auth, { params }: RouteParams) => {
    const { id } = await params;
    const bad = badId(id);
    if (bad) return bad;
    const read = await readJsonBody(req);
    if (!read.ok) return read.response;
    const result = await updateItem({ userId: auth.userId, id, body: read.json });
    if (!result.ok) return failure(result);
    return ok({ item: result.item });
  },
  { roles: BANK_STAFF_ROLES },
);
