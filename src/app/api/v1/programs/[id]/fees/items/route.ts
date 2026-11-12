import { withAuth } from "@/lib/auth/with-auth";
import { validate } from "@/lib/api/validate";
import { PROGRAM_ROUTE_ROLES, respond } from "@/lib/programs/http";
import { createFeeItem, listFeeItems } from "@/lib/programs/fees-service";
import { createFeeItemSchema } from "@/lib/programs/fees-validation";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/programs/[id]/fees/items - the program's fees (a super admin, a program admin, or - read only - a branch administrator), and whether fees are on. */
export const GET = withAuth(async (_req, auth, { params }: Ctx) => respond(await listFeeItems(auth.userId, (await params).id)), {
  roles: PROGRAM_ROUTE_ROLES,
});

/**
 * POST /api/v1/programs/[id]/fees/items { name, amount, frequency?, dueDay?, audience?, discountPercent?, billedTo?, exemptIds? }
 * Makes a fee. A super admin or a program admin; 409 `FEES_OFF`, `TOO_MANY` (200).
 */
export const POST = withAuth(
  validate({ body: createFeeItemSchema }, async (_req, auth, { params }: Ctx, { body }) =>
    respond(await createFeeItem(auth.userId, (await params).id, body), 201),
  ),
  { roles: PROGRAM_ROUTE_ROLES },
);
