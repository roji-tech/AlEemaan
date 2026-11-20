import { Prisma, Role, StandingState, type ResultStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { canSelfApproveResults } from "@/lib/settings/approvals";
import { ConflictError, ForbiddenError } from "@/lib/academics/structure";
import { usesHeadReview } from "@/lib/academics/head-review-setting";

// The head of department's review of results (task 0101 F, the maintainer: department heads approving results). Behind a branch switch, OFF by default (`head-review-setting.ts`).
//
// WHAT IT IS. While the switch is on, a SUBMITTED result whose subject belongs to a department needs one `ResultDepartmentReview` before it can be APPROVED (`transitionResults` asks:
// `awaitingReview`). The head of that department, or an administrator of the branch (or a superadmin), makes it; a result of a subject in no department needs none.
//
// WHAT IT IS NOT. It is not a status and it moves no result: the status machine, its database CHECKs and who may PUBLISH are exactly as before. The head can pass or return their department's
// submitted results and nothing else: never approve, never publish, never lock. With the switch off nothing here is consulted by approve and nothing changes.
//
// RULES. Nobody reviews results they entered or submitted themselves: a head never; an administrator follows the self-approval rule (a superadmin or a granted administrator may, as for approving).
// A head counts only through a live, active-standing staff record linked to their account (`isHeadOf`). Returning a result to DRAFT (by anyone) deletes its review: the marks can change again.
// Both actions are all-or-nothing in one transaction with the rows locked, and every result gets a `ResultAudit` row.

export const reviewInput = z.strictObject({
  action: z.enum(["pass", "return"]),
  resultIds: z.array(z.string().min(1)).min(1, "Choose at least one result.").max(500, "Act on at most 500 results at a time."),
  reason: z.string().trim().max(300).optional(),
});
export type ReviewInput = z.infer<typeof reviewInput>;

const NOT_AUTHORISED = "Only the head of the subject's department, or an administrator of this branch, can do that.";
const OFF = "Department head review is not turned on for this branch.";

/// How many of these SUBMITTED results still need a department review before they can be approved: those whose subject is in a department and that have no review. Reads inside the caller's
/// transaction. Zero when the branch does not ask for reviews.
export async function awaitingReview(tx: Prisma.TransactionClient, branchId: string, resultIds: readonly string[]): Promise<number> {
  if (!(await usesHeadReview(branchId))) return 0;
  return tx.result.count({
    where: { id: { in: [...resultIds] }, branchId, subject: { departmentId: { not: null } }, departmentReview: null },
  });
}

/// Removes the reviews of results going back to DRAFT (their marks can change again). Harmless when there are none.
export async function clearReviews(tx: Prisma.TransactionClient, branchId: string, resultIds: readonly string[]): Promise<void> {
  await tx.resultDepartmentReview.deleteMany({ where: { branchId, resultId: { in: [...resultIds] } } });
}

/// The departments this person is the head of, live ones, in one branch.
export async function headedDepartmentIds(userId: string, branchId: string): Promise<string[]> {
  const rows = await prisma.departmentMember.findMany({
    where: {
      branchId,
      isHead: true,
      department: { archivedAt: null },
      staffRecord: { userId, archivedAt: null, standing: StandingState.ACTIVE },
    },
    select: { departmentId: true },
  });
  return rows.map((r) => r.departmentId);
}

/// For the Results page: of these branches, the ones where the switch is on and this person may review (they administer it, or head a department there).
export async function reviewBranchIds(
  userId: string,
  branchIds: readonly string[],
  administers: (branchId: string) => boolean,
): Promise<string[]> {
  if (branchIds.length === 0) return [];
  const rows = await prisma.settingValue.findMany({
    where: { scope: "BRANCH", key: "results.departmentHeadReview", branchId: { in: [...branchIds] } },
    select: { branchId: true, value: true },
  });
  const on = rows.filter((r) => r.value === true && r.branchId).map((r) => r.branchId as string);
  if (on.length === 0) return [];
  const heads = await prisma.departmentMember.findMany({
    where: {
      branchId: { in: on },
      isHead: true,
      department: { archivedAt: null },
      staffRecord: { userId, archivedAt: null, standing: StandingState.ACTIVE },
    },
    select: { branchId: true },
  });
  const headIn = new Set(heads.map((h) => h.branchId));
  return on.filter((id) => administers(id) || headIn.has(id));
}

export type ReviewQueueGroup = {
  departmentId: string;
  departmentName: string;
  classArmId: string;
  armName: string;
  subjectId: string;
  subjectName: string;
  /// SUBMITTED results of this arm and subject that no one has reviewed yet, and the ones that have been.
  waiting: string[];
  reviewed: number;
};

/// The SUBMITTED results of one term whose subject is in a department the caller reviews (an administrator: every department; a head: their own), grouped by department, arm and subject, so
/// an action can be applied to a whole group. Reviewed results are counted, not listed again. Empty when the switch is off.
export async function reviewQueue(userId: string, role: Role, branchId: string, periodId: string): Promise<ReviewQueueGroup[]> {
  if (!(await usesHeadReview(branchId))) return [];
  const admin = role === Role.ADMIN;
  const mine = admin ? null : await headedDepartmentIds(userId, branchId);
  if (mine && mine.length === 0) return [];
  const rows = await prisma.result.findMany({
    where: {
      branchId,
      periodId,
      status: "SUBMITTED",
      subject: { departmentId: mine ? { in: mine } : { not: null } },
      // A head never sees results they entered or submitted themselves as theirs to review.
      ...(admin ? {} : { enteredByUserId: { not: userId }, OR: [{ submittedByUserId: null }, { submittedByUserId: { not: userId } }] }),
    },
    select: {
      id: true,
      classArmId: true,
      subjectId: true,
      departmentReview: { select: { id: true } },
      subject: { select: { name: true, departmentId: true, department: { select: { name: true } } } },
      classArm: { select: { name: true, classGroup: { select: { name: true } } } },
    },
    orderBy: { id: "asc" },
  });
  const groups = new Map<string, ReviewQueueGroup>();
  for (const r of rows) {
    const departmentId = r.subject.departmentId!;
    const key = `${departmentId}|${r.classArmId}|${r.subjectId}`;
    const g =
      groups.get(key) ??
      ({
        departmentId,
        departmentName: r.subject.department?.name ?? "",
        classArmId: r.classArmId,
        armName: `${r.classArm.classGroup.name} ${r.classArm.name}`,
        subjectId: r.subjectId,
        subjectName: r.subject.name,
        waiting: [],
        reviewed: 0,
      } satisfies ReviewQueueGroup);
    if (r.departmentReview) g.reviewed += 1;
    else g.waiting.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.departmentName.localeCompare(b.departmentName) || a.armName.localeCompare(b.armName) || a.subjectName.localeCompare(b.subjectName),
  );
}

/// Passes or returns a batch of SUBMITTED results for review, all or nothing. `role` is the caller's role in the branch (ADMIN = an administrator of it or a superadmin).
export async function reviewResults(actorUserId: string, role: Role, branchId: string, input: ReviewInput) {
  if (!(await usesHeadReview(branchId))) throw new ConflictError(OFF);
  const admin = role === Role.ADMIN;
  const reason = input.reason?.trim() || null;
  if (input.action === "return" && (reason?.length ?? 0) < 5) throw new ConflictError("Give a reason of at least 5 characters.");
  const ids = [...new Set(input.resultIds)];
  const superAdmin = admin ? await isSuperAdmin(actorUserId) : false;
  const headOf = admin ? null : new Set(await headedDepartmentIds(actorUserId, branchId));
  if (headOf && headOf.size === 0) throw new ForbiddenError(NOT_AUTHORISED);

  return prisma.$transaction(async (tx) => {
    // Lock the rows in a fixed order, as the status machine does, so two batches over the same results queue instead of deadlocking.
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Result" WHERE "id" IN (${Prisma.join(ids)}) AND "branchId" = ${branchId} ORDER BY "id" FOR UPDATE`;
    if (locked.length !== ids.length) throw new ConflictError("Some of those results no longer exist.");
    const results = await tx.result.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        total: true,
        enteredByUserId: true,
        submittedByUserId: true,
        departmentReview: { select: { id: true } },
        subject: { select: { departmentId: true, department: { select: { archivedAt: true } } } },
      },
    });
    // The department is the SUBJECT's today; a result whose subject is in none has nothing to review.
    const noDepartment = results.filter((r) => !r.subject.departmentId || r.subject.department?.archivedAt);
    if (noDepartment.length > 0)
      throw new ConflictError(
        `${noDepartment.length} of ${results.length} results are of subjects that are not in a department, so they need no department review.`,
      );
    if (headOf && results.some((r) => !headOf.has(r.subject.departmentId!))) throw new ForbiddenError(NOT_AUTHORISED);
    const wrong = results.filter((r) => r.status !== ("SUBMITTED" as ResultStatus));
    if (wrong.length > 0)
      throw new ConflictError(`${wrong.length} of ${results.length} results are not waiting for review: they must all be submitted.`);
    const own = results.some((r) => r.enteredByUserId === actorUserId || r.submittedByUserId === actorUserId);
    if (own) {
      // A head never reviews their own marks; an administrator follows the self-approval rule.
      const allowed = admin && (await canSelfApproveResults(actorUserId, branchId, superAdmin)).allowed;
      if (!allowed)
        throw new ForbiddenError(
          "You cannot review results you entered or submitted yourself; the head of the department or another administrator must.",
        );
    }

    const now = new Date();
    if (input.action === "pass") {
      for (const r of results) {
        if (r.departmentReview) continue; // already reviewed: a second click changes nothing
        await tx.resultDepartmentReview.create({
          data: { branchId, resultId: r.id, departmentId: r.subject.departmentId!, reviewedByUserId: actorUserId, reviewedAt: now },
        });
        await tx.resultAudit.create({
          data: {
            branchId,
            resultId: r.id,
            actorUserId,
            action: "DEPARTMENT_REVIEWED",
            fromStatus: r.status,
            toStatus: r.status,
            fromTotal: r.total,
            toTotal: r.total,
            reason: null,
          },
        });
      }
      return { action: input.action, count: results.length, status: "SUBMITTED" as const };
    }
    // Return to the teacher: the same step as "return" in the status machine, taken by the head (who is not an approver). The marks can change again, so the review goes.
    for (const r of results) {
      const done = await tx.result.updateMany({
        where: { id: r.id, status: "SUBMITTED" },
        data: { status: "DRAFT", submittedAt: null, submittedByUserId: null },
      });
      if (done.count !== 1) throw new ConflictError("A result changed while you were working. Nothing was changed.");
      await tx.resultAudit.create({
        data: {
          branchId,
          resultId: r.id,
          actorUserId,
          action: "RETURN",
          fromStatus: "SUBMITTED",
          toStatus: "DRAFT",
          fromTotal: r.total,
          toTotal: r.total,
          reason: `returned by the head of department: ${reason}`,
        },
      });
    }
    await clearReviews(tx, branchId, ids);
    return { action: input.action, count: results.length, status: "DRAFT" as const };
  });
}
