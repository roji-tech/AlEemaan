import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { updateFeeItem } from "@/lib/programs/fees-service";
import { updateFeeItemSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** PATCH /api/v1/programs/[id]/fees/items/[itemId] - change a fee or archive it (`status`). Only invoices made afterwards use the change; an invoice keeps its lines. A super admin or a program admin. */
export const PATCH = withAuth(
  validate({ body: updateFeeItemSchema }, async (_req, auth, { params }: Ctx, { body }) => {
    const { id, itemId } = await params;
    return respond(await updateFeeItem(auth.userId, id, itemId, body));
  }),
  { roles: PROGRAM_ROUTE_ROLES },
);
