import { Prisma, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminScope, mayAdminister } from "@/lib/auth/branch-access";
import { effectiveSwitch, parseSwitch } from "./ceiling-rules";

export { effectiveSwitch, parseSwitch };

// A yes/no setting under the ceiling rule (tasks 0040 and 0043): the SCHOOL's value is the ceiling and a BRANCH can only narrow it, so something is on for a branch only when
// BOTH are on, and nothing stored means "on". Stored as `SettingValue` (scope GLOBAL = the school, BRANCH = a branch), every change audited. Used by `programs.enabled` and
// `standing.branchAdminMaySuspend`; a new switch is a key and an audit action, not a copy of this file.

export type SwitchFailure = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string };
export type SwitchResult<T> = { ok: true; data: T } | SwitchFailure;
const refuse = (status: SwitchFailure["status"], code: string, message: string): SwitchFailure => ({ ok: false, status, code, message });

export type SwitchesView = {
  /// What the school stored (null = nothing, which means on) and what applies.
  school: { stored: boolean | null; effective: boolean };
  /// Super admin: every branch. Branch administrator: the branches they administer.
  branches: { id: string; name: string; stored: boolean | null; effective: boolean; canEdit: boolean }[];
  canEditSchool: boolean;
};

export type SetSwitchInput = { scope: "GLOBAL" | "BRANCH"; branchId?: string; enabled: boolean | null; reason?: string };

export function ceilingSwitch(definition: { key: string; auditAction: string }) {
  const { key, auditAction } = definition;

  /// What is stored for the school and for each of the given branches (undefined = nothing stored = on).
  async function stored(branchIds: readonly string[]): Promise<{ school: boolean | undefined; branch: Map<string, boolean | undefined> }> {
    const rows = await prisma.settingValue.findMany({
      where: {
        key,
        OR: [
          { scope: SettingScope.GLOBAL },
          ...(branchIds.length > 0 ? [{ scope: SettingScope.BRANCH, branchId: { in: [...branchIds] } }] : []),
        ],
      },
      select: { scope: true, branchId: true, value: true },
    });
    const branch = new Map<string, boolean | undefined>();
    let school: boolean | undefined;
    for (const row of rows) {
      if (row.scope === SettingScope.GLOBAL) school = parseSwitch(row.value);
      else if (row.branchId) branch.set(row.branchId, parseSwitch(row.value));
    }
    return { school, branch };
  }

  /// Whether each branch has it on right now (the school's value AND the branch's own).
  async function onFor(branchIds: readonly string[]): Promise<Map<string, boolean>> {
    const { school, branch } = await stored(branchIds);
    return new Map(branchIds.map((id) => [id, effectiveSwitch(school, branch.get(id))]));
  }

  async function view(userId: string): Promise<SwitchesView> {
    const scope = await adminScope(userId);
    const branches = await prisma.branch.findMany({
      where: scope.superAdmin ? {} : { id: { in: [...scope.branchIds] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const { school, branch } = await stored(branches.map((b) => b.id));
    return {
      school: { stored: school ?? null, effective: school ?? true },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        stored: branch.get(b.id) ?? null,
        effective: effectiveSwitch(school, branch.get(b.id)),
        canEdit: mayAdminister(scope, b.id),
      })),
      canEditSchool: scope.superAdmin,
    };
  }

  /// The school's value: a super admin. A branch's value: a super admin or that branch's administrator, and only to turn it OFF (storing "on" while the school has it off is
  /// refused). `enabled: null` removes the stored value. Saving the value that is already stored writes nothing.
  async function set(actorUserId: string, input: SetSwitchInput): Promise<SwitchResult<SwitchesView>> {
    const scope = await adminScope(actorUserId);
    if (input.scope === "GLOBAL") {
      if (!scope.superAdmin) return refuse(403, "FORBIDDEN", "Only a super admin can change the school's setting.");
    } else {
      const branchId = input.branchId ?? "";
      const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
      // A branch the person does not administer answers like one that does not exist.
      if (!branch || !mayAdminister(scope, branchId)) return refuse(404, "NOT_FOUND", "That branch was not found.");
    }

    const branchId = input.scope === "GLOBAL" ? null : (input.branchId ?? null);
    const settingScope = input.scope === "GLOBAL" ? SettingScope.GLOBAL : SettingScope.BRANCH;
    const outcome = await prisma.$transaction(async (tx): Promise<SwitchResult<boolean>> => {
      const school = await tx.settingValue.findFirst({ where: { scope: SettingScope.GLOBAL, key }, select: { value: true } });
      if (input.scope === "BRANCH" && input.enabled === true && school && parseSwitch(school.value) === false)
        return refuse(400, "VALIDATION", "A branch can only turn this off, not on: the school has it off.");
      const existing = await tx.settingValue.findFirst({
        where: { scope: settingScope, branchId, key },
        select: { id: true, value: true },
      });
      const before = existing ? (parseSwitch(existing.value) ?? null) : null;
      if (before === input.enabled) return { ok: true, data: false };
      if (input.enabled === null) {
        await tx.settingValue.deleteMany({ where: { scope: settingScope, branchId, key } });
      } else if (existing) {
        await tx.settingValue.update({ where: { id: existing.id }, data: { value: input.enabled, status: SettingStatus.APPROVED } });
      } else {
        await tx.settingValue.create({
          data: { scope: settingScope, branchId, key, value: input.enabled, status: SettingStatus.APPROVED },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: auditAction,
          targetType: "SettingValue",
          targetId: `${key}:${branchId ?? "school"}`,
          beforeValue: before === null ? Prisma.DbNull : before,
          afterValue: input.enabled === null ? Prisma.DbNull : input.enabled,
          reason: input.reason ?? null,
        },
      });
      return { ok: true, data: true };
    });
    if (!outcome.ok) return outcome;
    return { ok: true, data: await view(actorUserId) };
  }

  return { stored, onFor, view, set };
}
