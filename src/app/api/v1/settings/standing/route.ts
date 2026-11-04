import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok, fail } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { maySuspendSwitch } from "@/lib/standing/settings-service";
import { switchSettingSchema } from "@/lib/settings/switch-schema";

/**
 * GET /api/v1/settings/standing
 * May administrators of a branch suspend there (`standing.branchAdminMaySuspend`)? The school's value and, per branch, what is stored and what applies. A super admin sees
 * every branch; a branch administrator the branches they administer.
 */
export const GET = withAuth(async (_req, auth) => ok(await maySuspendSwitch.view(auth.userId)), { roles: [Role.ADMIN] });

/**
 * PATCH /api/v1/settings/standing { scope: "GLOBAL" | "BRANCH", branchId?, enabled: boolean | null }
 * The school's value: a super admin. A branch's value: a super admin or that branch's administrator, and a branch can only turn it OFF (it narrows the school's value, never
 * widens it). `enabled: null` removes the stored value (back to the default, on). Every change is audited.
 */
export const PATCH = withAuth(
  validate({ body: switchSettingSchema }, async (_req, auth, _ctx, { body }) => {
    const result = await maySuspendSwitch.set(auth.userId, body);
    return result.ok ? ok(result.data) : fail(result.message, result.status, result.code);
  }),
  { roles: [Role.ADMIN] },
);
