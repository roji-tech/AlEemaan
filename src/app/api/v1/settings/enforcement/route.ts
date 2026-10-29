import { z } from "zod";
import { SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validate, type Parsed } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { audit } from "@/lib/academics/structure";
import { structureCall } from "@/lib/academics/structure-http";
import { ENFORCEABLE_KEYS, enforcementKey } from "@/lib/settings/changes";

const putInput = z.strictObject({
  key: z.enum(ENFORCEABLE_KEYS),
  /// null (or absent) = every branch; a branch id = that branch only (a branch's own setting beats the school-wide one).
  branchId: z.string().min(1).nullable().optional(),
  enforced: z.boolean(),
});
type PutBody = Parsed<z.infer<typeof putInput>, undefined>;

// GET /api/v1/settings/enforcement   Superadmin only: every enforcement switch that is set, school-wide or per branch.
export const GET = withAuth(
  async () =>
    structureCall("SETTINGS_ENFORCEMENT_LIST", async () => {
      const rows = await prisma.settingValue.findMany({
        where: { key: { in: ENFORCEABLE_KEYS.map(enforcementKey) }, status: SettingStatus.APPROVED },
        select: { key: true, branchId: true, value: true },
      });
      return ok({
        flags: rows.map((r) => ({
          key: r.key.replace("enforce_approval_", ""),
          branchId: r.branchId,
          enforced: r.value === true || r.value === "true",
        })),
      });
    }),
  { superAdmin: true },
);

// PUT /api/v1/settings/enforcement   Superadmin only: switch "an administrator's change needs my approval" on or off for one setting, school-wide or for one branch.
export const PUT = withAuth(
  validate({ body: putInput }, async (_req, auth, _ctx, { body }: PutBody) =>
    structureCall("SETTINGS_ENFORCEMENT_SET", async () => {
      const branchId = body.branchId ?? null;
      if (branchId && !(await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } }))) {
        return fail("No such branch.", 404, "NOT_FOUND");
      }
      const key = enforcementKey(body.key);
      const scope = branchId ? SettingScope.BRANCH : SettingScope.GLOBAL;
      // findFirst + create/update: the unique index over (scope, branchId, key) does not stop two NULL-branch rows.
      const existing = await prisma.settingValue.findFirst({ where: { scope, branchId, key } });
      const saved = existing
        ? await prisma.settingValue.update({ where: { id: existing.id }, data: { value: body.enforced, status: SettingStatus.APPROVED } })
        : await prisma.settingValue.create({ data: { scope, branchId, key, value: body.enforced, status: SettingStatus.APPROVED } });
      await prisma.settingAudit.create({
        data: {
          settingKey: key,
          scope,
          branchId,
          actorUserId: auth.userId,
          action: body.enforced ? "ENFORCEMENT_ON" : "ENFORCEMENT_OFF",
          oldValue: existing ? { enforced: existing.value } : undefined,
          newValue: { enforced: body.enforced },
        },
      });
      await audit(auth.userId, body.enforced ? "SETTING_ENFORCEMENT_ON" : "SETTING_ENFORCEMENT_OFF", "SettingValue", saved.id, {
        key: body.key,
        branchId,
      });
      return ok({ flag: { key: body.key, branchId, enforced: body.enforced } });
    }),
  ),
  { superAdmin: true },
);
