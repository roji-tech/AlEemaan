import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { respond } from "@/lib/programs/http";
import { attendanceSwitchesView, setAttendanceSwitch } from "@/lib/programs/settings-service";
import { programsSettingSchema } from "@/lib/programs/validation";

/**
 * GET /api/v1/settings/programs-attendance
 * The programs attendance switch (`programs.attendance.enabled`): the school's value and, per branch, what is stored and what applies. A super admin sees every branch; a branch
 * administrator the branches they administer. (A program has a third, its own, switch in its Settings tab.)
 */
export const GET = withAuth(async (_req, auth) => ok(await attendanceSwitchesView(auth.userId)), { roles: [Role.ADMIN] });

/**
 * PATCH /api/v1/settings/programs-attendance { scope: "GLOBAL" | "BRANCH", branchId?, enabled: boolean | null }
 * The school's value: a super admin. A branch's value: a super admin or that branch's administrator - and a branch can only turn it OFF (it narrows the school's value, never widens
 * it). `enabled: null` removes the stored value (back to the default, on). Every change is audited.
 */
export const PATCH = withAuth(
  validate({ body: programsSettingSchema }, async (_req, auth, _ctx, { body }) => respond(await setAttendanceSwitch(auth.userId, body))),
  { roles: [Role.ADMIN] },
);
