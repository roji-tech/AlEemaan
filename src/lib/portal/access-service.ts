import { Prisma, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEffectiveBankSettings } from "@/lib/question-bank/settings-service";
import { PORTAL_ACCESS_KEY, capGuardianPractice, resolvePortalAccess, widens, type PortalAccess } from "./access";

// The database side of the portal access setting (task 0040): one `SettingValue` row per branch (scope BRANCH, key `portal_access`), read through `resolvePortalAccess` so a
// missing row is the default and a damaged one can never make the portal throw. Every change is written to `SettingAudit`, in the same transaction as the change.

/// What the branch has STORED (the settings screen edits and shows this), before the school-wide ceiling. The portal itself must never read this: it reads `getPortalAccess`.
export async function getStoredPortalAccess(branchId: string): Promise<PortalAccess> {
  const row = await prisma.settingValue.findUnique({
    where: { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: PORTAL_ACCESS_KEY } },
    select: { value: true },
  });
  return resolvePortalAccess(row?.value);
}

/// What applies in the branch: the stored access with a guardian's practice level held to the school-wide ceiling (`bank.parents.view`, the lower of the two). Every reader of
/// the portal's access reads this, so no route can forget the ceiling.
export async function getPortalAccess(branchId: string): Promise<PortalAccess> {
  const [stored, bank] = await Promise.all([getStoredPortalAccess(branchId), getEffectiveBankSettings(branchId)]);
  return capGuardianPractice(stored, bank["bank.parents.view"]);
}

/// The access of several branches (the portal shows a family whose children may be in different branches): one read of the stored rows, and the ceiling of each branch.
export async function getPortalAccessByBranch(branchIds: readonly string[]): Promise<Map<string, PortalAccess>> {
  const unique = [...new Set(branchIds)];
  const rows = unique.length
    ? await prisma.settingValue.findMany({
        where: { scope: SettingScope.BRANCH, key: PORTAL_ACCESS_KEY, branchId: { in: unique } },
        select: { branchId: true, value: true },
      })
    : [];
  const stored = new Map(rows.map((row) => [row.branchId, row.value]));
  const ceilings = await Promise.all(unique.map(async (id) => [id, (await getEffectiveBankSettings(id))["bank.parents.view"]] as const));
  const ceiling = new Map(ceilings);
  return new Map(unique.map((id) => [id, capGuardianPractice(resolvePortalAccess(stored.get(id)), ceiling.get(id)!)]));
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
