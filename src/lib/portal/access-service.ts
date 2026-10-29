import { Prisma, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PORTAL_ACCESS_KEY, resolvePortalAccess, widens, type PortalAccess } from "./access";

// The database side of the portal access setting (task 0040): one `SettingValue` row per branch (scope BRANCH, key `portal_access`), read through `resolvePortalAccess` so a
// missing row is the default and a damaged one can never make the portal throw. Every change is written to `SettingAudit`, in the same transaction as the change.

export async function getPortalAccess(branchId: string): Promise<PortalAccess> {
  const row = await prisma.settingValue.findUnique({
    where: { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: PORTAL_ACCESS_KEY } },
    select: { value: true },
  });
  return resolvePortalAccess(row?.value);
}

/// The access of several branches in one query (the portal shows a family whose children may be in different branches).
export async function getPortalAccessByBranch(branchIds: readonly string[]): Promise<Map<string, PortalAccess>> {
  const unique = [...new Set(branchIds)];
  const rows = unique.length
    ? await prisma.settingValue.findMany({
        where: { scope: SettingScope.BRANCH, key: PORTAL_ACCESS_KEY, branchId: { in: unique } },
        select: { branchId: true, value: true },
      })
    : [];
  const stored = new Map(rows.map((row) => [row.branchId, row.value]));
  return new Map(unique.map((id) => [id, resolvePortalAccess(stored.get(id))]));
}

export type PortalAccessChange = { before: PortalAccess; after: PortalAccess; changed: boolean; widening: boolean };

/// Stores the value and audits it. Nothing is written when nothing changes. `action` is CHANGED, or CHANGED_WIDENING when somebody got more than before.
export async function setPortalAccess(branchId: string, value: PortalAccess, actorUserId: string): Promise<PortalAccessChange> {
  return prisma.$transaction(async (tx) => {
    const where = { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: PORTAL_ACCESS_KEY } };
    const existing = await tx.settingValue.findUnique({ where, select: { value: true } });
    const before = resolvePortalAccess(existing?.value);
    const changed = JSON.stringify(before) !== JSON.stringify(value);
    const widening = widens(before, value);
    if (!changed && existing) return { before, after: value, changed: false, widening: false };

    const json = value as unknown as Prisma.InputJsonValue;
    await tx.settingValue.upsert({
      where,
      create: { scope: SettingScope.BRANCH, branchId, key: PORTAL_ACCESS_KEY, value: json, status: SettingStatus.APPROVED },
      update: { value: json, status: SettingStatus.APPROVED },
    });
    if (changed) {
      await tx.settingAudit.create({
        data: {
          settingKey: PORTAL_ACCESS_KEY,
          scope: SettingScope.BRANCH,
          branchId,
          actorUserId,
          oldValue: before as unknown as Prisma.InputJsonValue,
          newValue: json,
          action: widening ? "CHANGED_WIDENING" : "CHANGED",
        },
      });
    }
    return { before, after: value, changed, widening };
  });
}
