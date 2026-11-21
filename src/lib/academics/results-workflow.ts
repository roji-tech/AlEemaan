import { templateForClass } from "@/lib/results/templates";
import { usesHeadReview } from "@/lib/academics/head-review-setting";
import { BLOCK_PUBLISH_ON_UNCONFIRMED, unconfirmedPublishMessage } from "@/lib/results/scale-confirmation";
import crypto from "node:crypto";
import { Prisma, Role, SettingStatus, type ResultStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { canSelfApproveResults } from "@/lib/settings/approvals";
import { approverScope, covers, hasAnyScope, type ApproverScope } from "@/lib/academics/approver-scope";
import { ConflictError, ForbiddenError } from "@/lib/academics/structure";
import { awaitingReview, clearReviews } from "@/lib/academics/department-review";

// Results, Slice P2b: the REVIEW WORKFLOW. DRAFT -> SUBMITTED -> APPROVED -> PUBLISHED -> LOCKED, with the back-steps and the unlock. The caller's authority over the
// BRANCH was checked by `withBranch` in the route; here each action has its own rule (who, from which status), a batch is ALL OR NOTHING in one transaction with the
// rows locked, and every step writes a ResultAudit row in that transaction. The database separately refuses any status without its dates and people, and any change
// to a result's content once it has left DRAFT (migrations ...120000 and ...130000), so a bug here cannot rewrite history.
//
// Who may do what (task 0039): the author submits their own results; an ADMINISTRATOR of the branch does every other action; an APPROVER (an active staff member holding
// CAN_APPROVE_RESULTS, given somewhere to approve) does the actions marked `approverMay` on results in their scope - all of the batch or none of it. Unlock is for an
// administrator only: it takes a published result back into correction and needs a written reason.

export const ACTIONS = ["submit", "return", "approve", "revert", "publish", "lock", "unlock"] as const;
export type Action = (typeof ACTIONS)[number];
export const transitionInput = z.strictObject({
  action: z.enum(ACTIONS),
  resultIds: z.array(z.string().min(1)).min(1, "Choose at least one result.").max(500, "Act on at most 500 results at a time."),
  reason: z.string().trim().max(300).optional(),
});
export type TransitionInput = z.infer<typeof transitionInput>;

type Rule = {
  from: readonly ResultStatus[];
  to: ResultStatus;
  adminOnly: boolean;
  /// An approver with the result in their scope may do it too (never `unlock`).
  approverMay?: boolean;
  needsReason?: boolean;
  noSelf?: boolean;
};
/// The whole machine in one table. `unlock` takes a published OR locked result back to APPROVED (a published result must be correctable before its term closes);
/// it needs a written reason and is the only way back from PUBLISHED / LOCKED.
export const RULES: Record<Action, Rule> = {
  submit: { from: ["DRAFT"], to: "SUBMITTED", adminOnly: false },
  return: { from: ["SUBMITTED"], to: "DRAFT", adminOnly: true, approverMay: true },
  approve: { from: ["SUBMITTED"], to: "APPROVED", adminOnly: true, approverMay: true, noSelf: true },
  revert: { from: ["APPROVED"], to: "SUBMITTED", adminOnly: true, approverMay: true },
  publish: { from: ["APPROVED"], to: "PUBLISHED", adminOnly: true, approverMay: true },
  lock: { from: ["PUBLISHED"], to: "LOCKED", adminOnly: true, approverMay: true },
  unlock: { from: ["PUBLISHED", "LOCKED"], to: "APPROVED", adminOnly: true, needsReason: true },
};
const PAST_TENSE: Record<ResultStatus, string> = {
  DRAFT: "drafts",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  PUBLISHED: "published",
  LOCKED: "locked",
};

/// The branch every named result belongs to, or null when any id is unknown or they span branches - one answer, so a response never says which ids exist elsewhere.
export async function resultsBranchId(ids: readonly string[]): Promise<string | null> {
  const unique = [...new Set(ids)];
  const rows = await prisma.result.findMany({ where: { id: { in: unique } }, select: { branchId: true } });
  if (rows.length !== unique.length) return null;
  const branches = new Set(rows.map((r) => r.branchId));
  return branches.size === 1 ? [...branches][0] : null;
}

export const contentHash = (
  r: {
    branchId: string;
    studentId: string;
    subjectId: string;
    periodId: string;
    classArmId: string;
    schemeId: string;
    scaleId: string;
    componentScores: Prisma.JsonValue;
    examScore: Prisma.Decimal;
    total: Prisma.Decimal;
    gradeLetter: string;
    gradeRemark: string;
  },
  publishedAt: Date,
) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        branchId: r.branchId,
        studentId: r.studentId,
        subjectId: r.subjectId,
        periodId: r.periodId,
        classArmId: r.classArmId,
        schemeId: r.schemeId,
        scaleId: r.scaleId,
        parts: (r.componentScores as { name: string; max: number; score: number }[]).map((p) => [p.name, p.max, p.score]),
        exam: r.examScore.toFixed(2),
        total: r.total.toFixed(2),
        grade: [r.gradeLetter, r.gradeRemark],
        publishedAt: publishedAt.toISOString(),
      }),
    )
    .digest("hex");

/// The one answer for "you may not": no permission, no scope, an action only an administrator takes, or a result outside the scope (a response never says which).
const NOT_AUTHORISED = "Only an administrator of this branch, or an approver assigned to these results, can do that.";

/// Runs one action on a batch of results, all or nothing. `role` is the caller's role in the branch (ADMIN = an administrator of it or a superadmin).
export async function transitionResults(actorUserId: string, role: Role, branchId: string, input: TransitionInput) {
  const rule = RULES[input.action];
  const admin = role === Role.ADMIN;
  // Anyone who is not an administrator and takes an action beyond submitting must be an approver with somewhere to approve; where is checked per result below.
  let scope: ApproverScope | null = null;
  if (rule.adminOnly && !admin) {
    if (!rule.approverMay) throw new ForbiddenError(NOT_AUTHORISED);
    scope = await approverScope(branchId, actorUserId);
    if (!hasAnyScope(scope)) throw new ForbiddenError(NOT_AUTHORISED);
  }
  const reason = input.reason?.trim() || null;
  if (rule.needsReason && (reason?.length ?? 0) < 5) throw new ConflictError("Give a reason of at least 5 characters.");
  const ids = [...new Set(input.resultIds)];
  const superAdmin = rule.noSelf ? await isSuperAdmin(actorUserId) : false;

  return prisma.$transaction(async (tx) => {
    // Lock the rows in a fixed order so two batches over the same results queue up instead of deadlocking.
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Result" WHERE "id" IN (${Prisma.join(ids)}) AND "branchId" = ${branchId} ORDER BY "id" FOR UPDATE`;
    if (rows.length !== ids.length) throw new ConflictError("Some of those results no longer exist.");
    const results = await tx.result.findMany({ where: { id: { in: ids } } });
    if (scope && results.some((r) => !covers(scope, r.classArmId))) throw new ForbiddenError(NOT_AUTHORISED);
    const wrongState = results.filter((r) => !rule.from.includes(r.status));
    if (wrongState.length > 0) {
      throw new ConflictError(
        `${wrongState.length} of ${results.length} results cannot be ${input.action === "submit" ? "submitted" : `moved by "${input.action}"`}: they must all be ${rule.from.map((s) => PAST_TENSE[s]).join(" or ")}. Nothing was changed.`,
      );
    }
    if (!admin && input.action === "submit" && results.some((r) => r.enteredByUserId !== actorUserId)) {
      throw new ForbiddenError("You can submit only the results you entered yourself.");
    }
    if (rule.noSelf) {
      const selfApproval = await canSelfApproveResults(actorUserId, branchId, superAdmin);
      if (!selfApproval.allowed && results.some((r) => r.enteredByUserId === actorUserId || r.submittedByUserId === actorUserId)) {
        throw new ForbiddenError("You cannot approve results you entered or submitted yourself; another administrator must.");
      }
    }

    // A branch that asks for the head of department's review (task 0101 F, off by default) does not approve a result of a subject in a department until it has been reviewed. Nothing else
    // changes: who may approve, and who may publish, is as before. Off: `awaitingReview` is 0 and this does nothing.
    if (input.action === "approve") {
      const waiting = await awaitingReview(tx, branchId, ids);
      if (waiting > 0)
        throw new ConflictError(
          `${waiting} of ${results.length} results are waiting for the head of their department's review before they can be approved.`,
        );
    }

    // Guard: results under pending or rejected schemes cannot be published
    if (input.action === "publish") {
      const schemeIds = [...new Set(results.map((r) => r.schemeId))];
      const pendingApprovals = await tx.settingApproval.findMany({
        where: {
          targetType: "ASSESSMENT_SCHEME",
          targetId: { in: schemeIds },
          status: { in: [SettingStatus.PENDING, SettingStatus.REJECTED] },
        },
      });
      const pendingDrafts = await tx.assessmentSchemeDraft.findMany({
        where: {
          OR: [{ id: { in: schemeIds } }, { approvedSchemeId: { in: schemeIds } }],
          status: { in: [SettingStatus.PENDING, SettingStatus.REJECTED] },
        },
      });
      if (pendingApprovals.length > 0 || pendingDrafts.length > 0) {
        throw new ConflictError("Results under pending or rejected assessment schemes cannot be published until the scheme is approved.");
      }
    }

    // Guard (task 0116 D15): results graded on a grade scale whose bands were never confirmed cannot be published, WHEN BLOCK_PUBLISH_ON_UNCONFIRMED is on (it is off for now: the maintainer accepted
    // the seeded junior cut-offs on 2026-11-20; the notice and the Confirm button remain). Entering and approving always work. Checked here, in the transaction, so no screen can bypass it.
    if (BLOCK_PUBLISH_ON_UNCONFIRMED && input.action === "publish") {
      const unconfirmed = await tx.gradeScale.findMany({
        where: { id: { in: [...new Set(results.map((r) => r.scaleId))] }, unconfirmed: true },
        select: { name: true, version: true, unconfirmed: true },
      });
      const message = unconfirmedPublishMessage(unconfirmed);
      if (message) throw new ConflictError(message);
    }

    const now = new Date();
    for (const r of results) {
      const data: Prisma.ResultUncheckedUpdateInput = { status: rule.to };
      if (input.action === "submit") Object.assign(data, { submittedAt: now, submittedByUserId: actorUserId });
      if (input.action === "return") Object.assign(data, { submittedAt: null, submittedByUserId: null });
      if (input.action === "approve") Object.assign(data, { approvedAt: now, approvedByUserId: actorUserId });
      if (input.action === "revert") Object.assign(data, { approvedAt: null, approvedByUserId: null });
      if (input.action === "publish") {
        Object.assign(data, {
          publishedAt: now,
          verificationToken: crypto.randomBytes(32).toString("base64url"),
          verificationHash: contentHash(r, now),
        });
      }
      if (input.action === "lock") Object.assign(data, { lockedAt: now });
      if (input.action === "unlock")
        Object.assign(data, { publishedAt: null, lockedAt: null, verificationToken: null, verificationHash: null });
      // Conditional on the status we read while holding the lock: a belt for the braces.
      const done = await tx.result.updateMany({ where: { id: r.id, status: r.status }, data });
      if (done.count !== 1) throw new ConflictError("A result changed while you were working. Nothing was changed.");
      await tx.resultAudit.create({
        data: {
          branchId,
          resultId: r.id,
          actorUserId,
          action: input.action.toUpperCase(),
          fromStatus: r.status,
          toStatus: rule.to,
          fromTotal: r.total,
          toTotal: r.total,
          reason,
        },
      });
    }
    // Which template each class's cards used for the term (task 0126): written by the first publish, so a class moved to another template later still prints this term as it did. An unlock that
    // leaves nothing of the class published for the term lets it follow the class again.
    if (input.action === "publish" || input.action === "unlock") {
      const arms = await tx.classArm.findMany({
        where: { id: { in: [...new Set(results.map((r) => r.classArmId))] } },
        select: { id: true, classGroupId: true },
      });
      const groupOf = new Map(arms.map((a) => [a.id, a.classGroupId]));
      const pairs = new Map<string, { periodId: string; classGroupId: string }>();
      for (const r of results) {
        const classGroupId = groupOf.get(r.classArmId);
        if (classGroupId) pairs.set(`${r.periodId}|${classGroupId}`, { periodId: r.periodId, classGroupId });
      }
      for (const { periodId, classGroupId } of pairs.values()) {
        if (input.action === "publish") {
          const template = await templateForClass(branchId, classGroupId);
          await tx.resultTemplateUse.createMany({
            data: [{ branchId, periodId, classGroupId, templateId: template.id }],
            skipDuplicates: true,
          });
        } else {
          const stillOut = await tx.result.count({
            where: { branchId, periodId, classArm: { classGroupId }, status: { in: ["PUBLISHED", "LOCKED"] } },
          });
          if (stillOut === 0) await tx.resultTemplateUse.deleteMany({ where: { branchId, periodId, classGroupId } });
        }
      }
    }
    // A result sent back to DRAFT can change again, so a department review of it no longer stands (task 0101 F).
    if (input.action === "return") await clearReviews(tx, branchId, ids);
    return { action: input.action, count: results.length, status: rule.to };
  });
}

/// The history of one result, oldest first (administrators).
export async function resultHistory(branchId: string, resultId: string) {
  const rows = await prisma.resultAudit.findMany({
    where: { branchId, resultId },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((h) => ({
    id: h.id,
    action: h.action,
    actorUserId: h.actorUserId,
    actorName: h.actor?.name ?? (h.actorUserId ? "Staff" : "System"),
    actorEmail: h.actor?.email ?? null,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    fromTotal: h.fromTotal === null ? null : Number(h.fromTotal),
    toTotal: h.toTotal === null ? null : Number(h.toTotal),
    reason: h.reason,
    at: h.createdAt.toISOString(),
  }));
}

export const queueQuery = z.object({ branchId: z.string().min(1), periodId: z.string().min(1) });

/// The review queue: for a term, each (arm, subject) with how many results are in each status - and their ids, so an action can be applied to a whole group. With `scope`
/// (an approver), only the arms it reaches.
export async function reviewQueue(branchId: string, periodId: string, scope?: ApproverScope) {
  // An approver sees the arms their scope reaches (a general scope: all of them); an administrator passes no scope and sees everything.
  const armFilter = scope && !scope.general ? { classArmId: { in: [...scope.armIds] } } : {};
  const reviewing = await usesHeadReview(branchId);
  const rows = await prisma.result.findMany({
    where: { branchId, periodId, ...armFilter },
    select: {
      id: true,
      classArmId: true,
      subjectId: true,
      status: true,
      // Task 0126: a branch that asks for the head of department's review shows which submitted results still wait for it (approve refuses them).
      ...(reviewing ? { subject: { select: { departmentId: true } }, departmentReview: { select: { id: true } } } : {}),
    },
    orderBy: { id: "asc" },
  });
  const [arms, subjects] = await Promise.all([
    prisma.classArm.findMany({
      where: { branchId, id: { in: [...new Set(rows.map((g) => g.classArmId))] } },
      select: { id: true, name: true, classGroup: { select: { name: true } } },
    }),
    prisma.subject.findMany({
      where: { branchId, id: { in: [...new Set(rows.map((g) => g.subjectId))] } },
      select: { id: true, name: true },
    }),
  ]);
  const armName = new Map(arms.map((a) => [a.id, `${a.classGroup.name} ${a.name}`]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const byKey = new Map<
    string,
    {
      classArmId: string;
      armName: string;
      subjectId: string;
      subjectName: string;
      counts: Record<string, number>;
      ids: Record<string, string[]>;
      /// Submitted results of a department's subject with no review yet (task 0126); 0 where the branch does not ask for reviews.
      awaitingDepartment: number;
    }
  >();
  for (const g of rows) {
    const key = `${g.classArmId}|${g.subjectId}`;
    const entry = byKey.get(key) ?? {
      classArmId: g.classArmId,
      armName: armName.get(g.classArmId) ?? "",
      subjectId: g.subjectId,
      subjectName: subjectName.get(g.subjectId) ?? "",
      counts: {},
      ids: {},
      awaitingDepartment: 0,
    };
    const waiting = g as typeof g & { subject?: { departmentId: string | null }; departmentReview?: { id: string } | null };
    if (reviewing && g.status === "SUBMITTED" && waiting.subject?.departmentId && !waiting.departmentReview) entry.awaitingDepartment += 1;
    entry.counts[g.status] = (entry.counts[g.status] ?? 0) + 1;
    (entry.ids[g.status] ??= []).push(g.id);
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => a.armName.localeCompare(b.armName) || a.subjectName.localeCompare(b.subjectName));
}
