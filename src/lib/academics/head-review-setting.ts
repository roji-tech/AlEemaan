import { Prisma, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

// Whether a branch asks for a head of department's review before results are approved (task 0101 F). One `SettingValue` row per branch (scope BRANCH, key `results.departmentHeadReview`)
// holding true or false. OFF by default: no row, or anything that is not exactly `true`, is off, so a damaged value can only ever switch the extra step OFF, never leave a result waiting for
// a reviewer who does not exist. While it is off nothing about results changes. Every change is audited in `SettingAudit` in the same transaction. Turning it off deletes nothing: reviews already
// made stay on their results.

export const HEAD_REVIEW_KEY = "results.departmentHeadReview";

export const resolveHeadReview = (stored: unknown): boolean => stored === true;

export async function usesHeadReview(branchId: string): Promise<boolean> {
  const row = await prisma.settingValue.findUnique({
    where: { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: HEAD_REVIEW_KEY } },
    select: { value: true },
  });
  return resolveHeadReview(row?.value);
}

/// The switch for several branches (one query), for the Results page.
export async function usesHeadReviewIn(branchIds: readonly string[]): Promise<Record<string, boolean>> {
  const rows = await prisma.settingValue.findMany({
    where: { scope: SettingScope.BRANCH, key: HEAD_REVIEW_KEY, branchId: { in: [...branchIds] } },
    select: { branchId: true, value: true },
  });
  const on = new Set(rows.filter((r) => resolveHeadReview(r.value)).map((r) => r.branchId));
  return Object.fromEntries(branchIds.map((id) => [id, on.has(id)]));
}

export type HeadReviewSwitchChange = { before: boolean; after: boolean; changed: boolean };

/// Stores the value and audits it. Nothing is audited when nothing changes.
export async function setUsesHeadReview(branchId: string, enabled: boolean, actorUserId: string): Promise<HeadReviewSwitchChange> {
  return prisma.$transaction(async (tx) => {
    const where = { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: HEAD_REVIEW_KEY } };
    const existing = await tx.settingValue.findUnique({ where, select: { value: true } });
    const before = resolveHeadReview(existing?.value);
    const changed = before !== enabled;
    if (!changed && existing) return { before, after: enabled, changed: false };
    await tx.settingValue.upsert({
      where,
      create: { scope: SettingScope.BRANCH, branchId, key: HEAD_REVIEW_KEY, value: enabled, status: SettingStatus.APPROVED },
      update: { value: enabled, status: SettingStatus.APPROVED },
    });
    if (changed) {
      await tx.settingAudit.create({
        data: {
          settingKey: HEAD_REVIEW_KEY,
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
