import { Prisma, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

// Whether a Section approver may also approve the classes that belong to no section (task 0039, slice 2a; Octalve Edu's ADR 0018, amendment of 2026-10-23). One
// `SettingValue` row per branch (scope BRANCH, key `results.unsectionedClassApproval`), holding one of the two strings below. No row, or anything else, is the default, so a
// damaged value can only ever narrow who approves, never widen it. The rule that reads it is `approverScope`; this file only reads, resolves and writes the value.
//
// Every change is written to `SettingAudit` in the same transaction as the change; turning on `ANY_SECTION_APPROVER` lets more people approve, so it is audited as
// CHANGED_WIDENING (as the portal access setting is). Only a superadmin changes it (slice 2b); there is no approval flow, because the one person who may change it is the
// one who would approve the change.

export const UNSECTIONED_KEY = "results.unsectionedClassApproval";

export const UNSECTIONED_VALUES = ["GENERAL_OR_CLASS_ONLY", "ANY_SECTION_APPROVER"] as const;
export type UnsectionedClassApproval = (typeof UNSECTIONED_VALUES)[number];

/// A class that is in no section is reached only through a General scope or a Class scope on it.
export const UNSECTIONED_DEFAULT: UnsectionedClassApproval = "GENERAL_OR_CLASS_ONLY";

/// The stored value as a safe one: anything that is not exactly one of the two names is the default.
export const resolveUnsectioned = (stored: unknown): UnsectionedClassApproval =>
  UNSECTIONED_VALUES.find((value) => value === stored) ?? UNSECTIONED_DEFAULT;

export async function getUnsectionedClassApproval(branchId: string): Promise<UnsectionedClassApproval> {
  const row = await prisma.settingValue.findUnique({
    where: { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: UNSECTIONED_KEY } },
    select: { value: true },
  });
  return resolveUnsectioned(row?.value);
}

export type UnsectionedChange = { before: UnsectionedClassApproval; after: UnsectionedClassApproval; changed: boolean; widening: boolean };

/// Stores the value and audits it. Nothing is written when nothing changes (a first save of the default creates the row but no audit line).
export async function setUnsectionedClassApproval(branchId: string, value: UnsectionedClassApproval, actorUserId: string): Promise<UnsectionedChange> {
  return prisma.$transaction(async (tx) => {
    const where = { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: UNSECTIONED_KEY } };
    const existing = await tx.settingValue.findUnique({ where, select: { value: true } });
    const before = resolveUnsectioned(existing?.value);
    const changed = before !== value;
    const widening = changed && value === "ANY_SECTION_APPROVER";
    if (!changed && existing) return { before, after: value, changed: false, widening: false };

    await tx.settingValue.upsert({
      where,
      create: { scope: SettingScope.BRANCH, branchId, key: UNSECTIONED_KEY, value, status: SettingStatus.APPROVED },
      update: { value, status: SettingStatus.APPROVED },
    });
    if (changed) {
      await tx.settingAudit.create({
        data: {
          settingKey: UNSECTIONED_KEY,
          scope: SettingScope.BRANCH,
          branchId,
          actorUserId,
          oldValue: before as Prisma.InputJsonValue,
          newValue: value as Prisma.InputJsonValue,
          action: widening ? "CHANGED_WIDENING" : "CHANGED",
        },
      });
    }
    return { before, after: value, changed, widening };
  });
}
