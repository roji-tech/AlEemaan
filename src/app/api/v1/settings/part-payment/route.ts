import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { policyView, setPolicy } from "@/lib/finance/part-payment-service";
import { partPaymentSettingSchema } from "@/lib/finance/part-payment-validation";

/**
 * GET /api/v1/settings/part-payment
 * The part-payment rule (task 0046): what the school stored and, per branch, what is stored and the sentence that applies. A super admin sees every branch; a branch
 * administrator the branches they administer.
 */
export const GET = withAuth(async (_req, auth) => ok(await policyView(auth.userId)), { roles: [Role.ADMIN] });

/**
 * PATCH /api/v1/settings/part-payment { scope: "GLOBAL" | "BRANCH", branchId?, policy: { allowed, minimum: { kind: "NONE" | "AMOUNT" | "PERCENT", value? } } | null }
 * The school's rule: a super admin. A branch's rule: a super admin or that branch's administrator, and only TIGHTER than the school's (never allowing what the school
 * forbids, never a smaller smallest part). `policy: null` removes the stored value (back to: part payments allowed, any amount). Every change is audited.
 */
export const PATCH = withAuth(
  validate({ body: partPaymentSettingSchema }, async (_req, auth, _ctx, { body }) => {
    const result = await setPolicy(auth.userId, body);
    return result.ok ? ok(result.data) : fail(result.message, result.status, result.code);
  }),
  { roles: [Role.ADMIN] },
);
