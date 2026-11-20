import { Prisma, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

// Whether a branch uses departments (task 0101 D7). One `SettingValue` row per branch (scope BRANCH, key `academics.useDepartments`) holding true or false. No row, or anything that is not the
// boolean `true`, is OFF: a damaged value can only ever hide the feature, never switch it on. Every change is audited in `SettingAudit` in the same transaction. Turning it off deletes nothing;
// the departments are kept and come back when it is turned on again.

export const DEPARTMENTS_KEY = "academics.useDepartments";

/// The stored value as a safe one: only exactly `true` is on.
export const resolveUsesDepartments = (stored: unknown): boolean => stored === true;

export async function usesDepartments(branchId: string): Promise<boolean> {
  const row = await prisma.settingValue.findUnique({
    where: { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: DEPARTMENTS_KEY } },
    select: { value: true },
  });
  return resolveUsesDepartments(row?.value);
}

/// The switch for several branches (one query), for the Academics page.
export async function usesDepartmentsIn(branchIds: readonly string[]): Promise<Record<string, boolean>> {
  const rows = await prisma.settingValue.findMany({
    where: { scope: SettingScope.BRANCH, key: DEPARTMENTS_KEY, branchId: { in: [...branchIds] } },
    select: { branchId: true, value: true },
  });
  const on = new Set(rows.filter((r) => resolveUsesDepartments(r.value)).map((r) => r.branchId));
  return Object.fromEntries(branchIds.map((id) => [id, on.has(id)]));
}

export type DepartmentsSwitchChange = { before: boolean; after: boolean; changed: boolean };

/// Stores the value and audits it. Nothing is audited when nothing changes (a first save of "off" creates the row but no audit line).
export async function setUsesDepartments(branchId: string, enabled: boolean, actorUserId: string): Promise<DepartmentsSwitchChange> {
  return prisma.$transaction(async (tx) => {
    const where = { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: DEPARTMENTS_KEY } };
    const existing = await tx.settingValue.findUnique({ where, select: { value: true } });
    const before = resolveUsesDepartments(existing?.value);
    const changed = before !== enabled;
    if (!changed && existing) return { before, after: enabled, changed: false };
    await tx.settingValue.upsert({
      where,
      create: { scope: SettingScope.BRANCH, branchId, key: DEPARTMENTS_KEY, value: enabled, status: SettingStatus.APPROVED },
      update: { value: enabled, status: SettingStatus.APPROVED },
    });
    if (changed) {
      await tx.settingAudit.create({
        data: {
          settingKey: DEPARTMENTS_KEY,
          scope: SettingScope.BRANCH,
          branchId,
          actorUserId,
          oldValue: before as Prisma.InputJsonValue,
          newValue: enabled as Prisma.InputJsonValue,
          action: "CHANGED",
        },
      });
    }
    return { before, after: enabled, changed };
  });
}
