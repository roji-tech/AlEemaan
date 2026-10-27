import { Prisma, PupilNameFormat, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isSettingApprovalEnforced } from "@/lib/settings/approvals";

// Settings a branch administrator may change but a superadmin can put behind approval (the maintainer's decision of 2026-10-15): the report-card layout and the
// public verification page's fields. A change is either applied at once (a superadmin; or no enforcement) or filed as a PENDING request carrying the proposed
// value and the person's reason, and applied only when a superadmin approves it.

export const LAYOUT_KEY = "report_card_layout";
export const VERIFICATION_KEY = "verification_page";
/// Behind approval only where a superadmin switches it on. (The verification page is different: an administrator's change to it ALWAYS goes to a superadmin.)
export const ENFORCEABLE_KEYS = [LAYOUT_KEY] as const;
export type EnforceableKey = (typeof ENFORCEABLE_KEYS)[number];
export type RequestKey = EnforceableKey | typeof VERIFICATION_KEY;

export type LayoutValue = { layoutCode: "DEFAULT" | "LEGACY"; options: Record<string, boolean> };
export type VerificationValue = {
  showPupilName?: boolean;
  pupilNameFormat?: PupilNameFormat;
  showSubject?: boolean;
  showMarks?: boolean;
  showGrade?: boolean;
};

type Tx = Prisma.TransactionClient;

/// Whether this person's change must wait for approval: never for a superadmin, otherwise only where a superadmin has switched enforcement on for the branch
/// (or for every branch).
export const needsApproval = async (isSuperAdmin: boolean, branchId: string, key: EnforceableKey) =>
  !isSuperAdmin && (await isSettingApprovalEnforced(branchId, key));

export async function applyLayout(tx: Tx, branchId: string, value: LayoutValue) {
  return tx.settingValue.upsert({
    where: { scope_branchId_key: { scope: SettingScope.BRANCH, branchId, key: LAYOUT_KEY } },
    create: { scope: SettingScope.BRANCH, branchId, key: LAYOUT_KEY, value, status: SettingStatus.APPROVED },
    update: { value, status: SettingStatus.APPROVED },
  });
}

/// `branchId` null is the school-wide configuration. `findFirst` + create/update because a unique index over a nullable column does not stop two NULL rows.
export async function applyVerification(tx: Tx, branchId: string | null, value: VerificationValue) {
  const existing = branchId
    ? await tx.verificationPageConfig.findUnique({ where: { branchId } })
    : await tx.verificationPageConfig.findFirst({ where: { branchId: null } });
  return existing
    ? tx.verificationPageConfig.update({ where: { id: existing.id }, data: value })
    : tx.verificationPageConfig.create({
        data: {
          branchId,
          showPupilName: value.showPupilName ?? true,
          pupilNameFormat: value.pupilNameFormat ?? PupilNameFormat.FIRST_LAST_INITIAL,
          showSubject: value.showSubject ?? true,
          showMarks: value.showMarks ?? false,
          showGrade: value.showGrade ?? false,
        },
      });
}

/// Files a request: the proposed value and the reason, PENDING until a superadmin decides.
export async function fileRequest(input: {
  key: RequestKey;
  targetType: "SETTING" | "VERIFICATION_CONFIG";
  branchId: string;
  actorUserId: string;
  reason: string;
  proposedValue: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.settingApproval.create({
      data: {
        settingKey: input.key,
        targetType: input.targetType,
        scope: SettingScope.BRANCH,
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        reason: input.reason,
        status: SettingStatus.PENDING,
        proposedValue: input.proposedValue,
      },
    });
    await tx.settingAudit.create({
      data: {
        settingKey: input.key,
        scope: SettingScope.BRANCH,
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        action: "CHANGE_REQUESTED",
        newValue: input.proposedValue,
      },
    });
    return approval;
  });
}

/// Applies an approved request's proposed value (called inside the decision's transaction).
export async function applyApprovedRequest(
  tx: Tx,
  approval: { settingKey: string; targetType: string; branchId: string | null; proposedValue: Prisma.JsonValue },
) {
  if (approval.targetType === "SETTING" && approval.settingKey === LAYOUT_KEY && approval.branchId) {
    await applyLayout(tx, approval.branchId, approval.proposedValue as unknown as LayoutValue);
  } else if (approval.targetType === "VERIFICATION_CONFIG" && approval.settingKey === VERIFICATION_KEY) {
    await applyVerification(tx, approval.branchId, approval.proposedValue as unknown as VerificationValue);
  }
}

export const enforcementKey = (key: EnforceableKey) => `enforce_approval_${key}`;
