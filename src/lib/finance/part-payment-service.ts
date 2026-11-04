import { Prisma, SettingScope, SettingStatus, InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { adminScope, mayAdminister } from "@/lib/auth/branch-access";
import {
  DEFAULT_POLICY,
  PART_PAYMENT_KEY,
  effectivePolicy,
  parsePolicy,
  policyText,
  tighterThan,
  type EffectivePolicy,
  type PartPaymentPolicy,
} from "./part-payment";

// Part payment "if allowed" (task 0046): the stored policy (school and branch), the screen's view of it, who may change it, and the per-invoice "pay in full" flag. The rule
// itself is pure (part-payment.ts); this is the database side.

type Reader = Pick<typeof prisma, "settingValue">;

export type PolicyFailure = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string };
export type PolicyResult<T> = { ok: true; data: T } | PolicyFailure;
const refuse = (status: PolicyFailure["status"], code: string, message: string): PolicyFailure => ({ ok: false, status, code, message });

/// The policy that applies to a branch right now: the strictest of the school's and the branch's stored values (a value that does not parse is ignored; nothing stored is the
/// default, which is today's behaviour). Read on every payment, inside its transaction, so a change takes effect at once.
export async function loadEffectivePolicy(db: Reader, branchId: string): Promise<EffectivePolicy> {
  const rows = await db.settingValue.findMany({
    where: { key: PART_PAYMENT_KEY, OR: [{ scope: SettingScope.GLOBAL }, { scope: SettingScope.BRANCH, branchId }] },
    select: { scope: true, value: true },
  });
  const school = rows.find((row) => row.scope === SettingScope.GLOBAL);
  const branch = rows.find((row) => row.scope === SettingScope.BRANCH);
  return effectivePolicy(school ? parsePolicy(school.value) : undefined, branch ? parsePolicy(branch.value) : undefined);
}

export type PolicyView = {
  school: { stored: PartPaymentPolicy | null; text: string };
  /// Super admin: every branch. Branch administrator: the branches they administer.
  branches: { id: string; name: string; stored: PartPaymentPolicy | null; text: string; canEdit: boolean }[];
  canEditSchool: boolean;
};

export async function policyView(userId: string): Promise<PolicyView> {
  const scope = await adminScope(userId);
  const branches = await prisma.branch.findMany({
    where: scope.superAdmin ? {} : { id: { in: [...scope.branchIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const rows = await prisma.settingValue.findMany({
    where: {
      key: PART_PAYMENT_KEY,
      OR: [{ scope: SettingScope.GLOBAL }, { scope: SettingScope.BRANCH, branchId: { in: branches.map((b) => b.id) } }],
    },
    select: { scope: true, branchId: true, value: true },
  });
  const school = parsePolicy(rows.find((row) => row.scope === SettingScope.GLOBAL)?.value);
  const byBranch = new Map(
    rows.filter((row) => row.scope === SettingScope.BRANCH && row.branchId).map((row) => [row.branchId!, parsePolicy(row.value)]),
  );
  return {
    school: { stored: school ?? null, text: policyText(effectivePolicy(school, undefined)) },
    branches: branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      stored: byBranch.get(branch.id) ?? null,
      text: policyText(effectivePolicy(school, byBranch.get(branch.id))),
      canEdit: mayAdminister(scope, branch.id),
    })),
    canEditSchool: scope.superAdmin,
  };
}

export type SetPolicyInput = {
  scope: "GLOBAL" | "BRANCH";
  branchId?: string;
  /** null removes the stored value */ policy: PartPaymentPolicy | null;
  reason?: string;
};

/// The school's value: a super admin. A branch's value: a super admin or that branch's administrator, and only TIGHTER than the school's (task 0046, 3.2). `policy: null`
/// removes the stored value. Saving what is already stored writes nothing. Every change is audited.
export async function setPolicy(actorUserId: string, input: SetPolicyInput): Promise<PolicyResult<PolicyView>> {
  const scope = await adminScope(actorUserId);
  if (input.scope === "GLOBAL") {
    if (!scope.superAdmin) return refuse(403, "FORBIDDEN", "Only a super admin can change the school's rule.");
  } else {
    const branchId = input.branchId ?? "";
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    // A branch the person does not administer answers like one that does not exist.
    if (!branch || !mayAdminister(scope, branchId)) return refuse(404, "NOT_FOUND", "That branch was not found.");
  }

  const branchId = input.scope === "GLOBAL" ? null : (input.branchId ?? null);
  const settingScope = input.scope === "GLOBAL" ? SettingScope.GLOBAL : SettingScope.BRANCH;
  const outcome = await prisma.$transaction(async (tx): Promise<PolicyResult<boolean>> => {
    if (input.scope === "BRANCH" && input.policy) {
      const school = await tx.settingValue.findFirst({
        where: { scope: SettingScope.GLOBAL, key: PART_PAYMENT_KEY },
        select: { value: true },
      });
      const problem = tighterThan(parsePolicy(school?.value) ?? DEFAULT_POLICY, input.policy);
      if (problem) return refuse(400, "VALIDATION", problem);
    }
    const existing = await tx.settingValue.findFirst({
      where: { scope: settingScope, branchId, key: PART_PAYMENT_KEY },
      select: { id: true, value: true },
    });
    const before = existing ? (parsePolicy(existing.value) ?? null) : null;
    if (JSON.stringify(before) === JSON.stringify(input.policy)) return { ok: true, data: false };
    if (input.policy === null) {
      await tx.settingValue.deleteMany({ where: { scope: settingScope, branchId, key: PART_PAYMENT_KEY } });
    } else if (existing) {
      await tx.settingValue.update({ where: { id: existing.id }, data: { value: input.policy, status: SettingStatus.APPROVED } });
    } else {
      await tx.settingValue.create({
        data: { scope: settingScope, branchId, key: PART_PAYMENT_KEY, value: input.policy, status: SettingStatus.APPROVED },
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "PART_PAYMENT_SETTING_CHANGED",
        targetType: "SettingValue",
        targetId: `${PART_PAYMENT_KEY}:${branchId ?? "school"}`,
        beforeValue: before === null ? Prisma.DbNull : (before as Prisma.InputJsonValue),
        afterValue: input.policy === null ? Prisma.DbNull : (input.policy as Prisma.InputJsonValue),
        reason: input.reason ?? null,
      },
    });
    return { ok: true, data: true };
  });
  if (!outcome.ok) return outcome;
  return { ok: true, data: await policyView(actorUserId) };
}

/// Marks one open invoice "pay in full" (or clears it). The caller has checked that they administer the branch. It can only tighten what the policy says, never allow what it
/// forbids. Audited; saving the value already stored writes nothing.
export async function setPayInFull(
  actorUserId: string,
  branchId: string,
  invoiceId: string,
  payInFull: boolean,
): Promise<PolicyResult<{ payInFull: boolean }>> {
  return prisma.$transaction(async (tx): Promise<PolicyResult<{ payInFull: boolean }>> => {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "branchId" = ${branchId} FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, branchId }, select: { id: true, status: true, payInFull: true } });
    if (!invoice) return refuse(404, "NOT_FOUND", "Invoice not found or access denied");
    if (invoice.payInFull === payInFull) return { ok: true, data: { payInFull } };
    if (invoice.status !== InvoiceStatus.UNPAID && invoice.status !== InvoiceStatus.PARTIALLY_PAID)
      return refuse(409, "NOT_OPEN", "Only an invoice that still has a balance can be changed.");
    await tx.invoice.update({ where: { id: invoice.id }, data: { payInFull } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "INVOICE_PAY_IN_FULL_CHANGED",
        targetType: "Invoice",
        targetId: invoice.id,
        beforeValue: { payInFull: invoice.payInFull },
        afterValue: { payInFull },
      },
    });
    return { ok: true, data: { payInFull } };
  });
}
