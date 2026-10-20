import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { isPlausibleId } from "@/lib/api/ids";
import { normalizeLabel } from "@/lib/question-bank/labels";
import { hasForbiddenCharacters } from "@/lib/question-bank/validation";

// Who may review question bank submissions (design note sections 6 and 8.1). A reviewer is ACTIVE STAFF (an administrator, a teacher or other staff: never a pupil or a
// parent), for one branch or, when `branchId` is null, for every branch (only a superadmin assigns those). GENERAL covers every subject; SUBJECT names one (the label as
// typed plus its normalised key). `isExamApprover` marks someone who sees overlap warnings and sets visibility. Every assignment and removal is audited in the same
// transaction. The routes decide who may call; the rules about WHAT are here.

const STAFF: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];

export type ReviewerView = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  /// null = a reviewer for every branch.
  branchId: string | null;
  scope: "GENERAL" | "SUBJECT";
  subjectLabel: string | null;
  isExamApprover: boolean;
  createdAt: Date;
  /// Shown to a branch administrator for an every-branch reviewer they cannot remove.
  inherited: boolean;
};

const SELECT = {
  id: true,
  userId: true,
  branchId: true,
  scope: true,
  subjectLabel: true,
  isExamApprover: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.QuestionBankReviewerSelect;

type Row = Prisma.QuestionBankReviewerGetPayload<{ select: typeof SELECT }>;

const view = (row: Row, forBranch: string | null): ReviewerView => ({
  id: row.id,
  userId: row.userId,
  name: row.user.name,
  email: row.user.email,
  branchId: row.branchId,
  scope: row.scope,
  subjectLabel: row.subjectLabel,
  isExamApprover: row.isExamApprover,
  createdAt: row.createdAt,
  inherited: row.branchId === null && forBranch !== null,
});

/// The reviewers of one branch plus the every-branch ones; with `branchId` null, every row (a superadmin's view).
export async function listReviewers(branchId: string | null): Promise<ReviewerView[]> {
  const rows = await prisma.questionBankReviewer.findMany({
    where: branchId ? { OR: [{ branchId }, { branchId: null }] } : {},
    select: SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  return rows.map((row) => view(row, branchId));
}

type Fail = { ok: false; status: 400 | 403 | 404 | 409; code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT"; message: string };
const refuse = (status: Fail["status"], code: Fail["code"], message: string): Fail => ({ ok: false, status, code, message });

export type AddReviewerInput = {
  actorUserId: string;
  actorIsSuperAdmin: boolean;
  /// null = every branch.
  branchId: string | null;
  userId: string;
  scope: "GENERAL" | "SUBJECT";
  subjectLabel?: string | null;
  isExamApprover: boolean;
};

export async function addReviewer(input: AddReviewerInput): Promise<{ ok: true; reviewer: ReviewerView } | Fail> {
  // The routes check ids already; this service is also the place a NUL byte would turn into a database error, so it does not rely on its callers.
  if (!isPlausibleId(input.userId) || (input.branchId !== null && !isPlausibleId(input.branchId)))
    return refuse(400, "VALIDATION", "That is not a valid id.");
  if (input.branchId === null && !input.actorIsSuperAdmin)
    return refuse(403, "FORBIDDEN", "Only a school-wide administrator can assign a reviewer for every branch.");

  let subjectLabel: string | null = null;
  let subjectKey: string | null = null;
  if (input.scope === "SUBJECT") {
    subjectLabel = (input.subjectLabel ?? "").replace(/\s+/g, " ").trim();
    subjectKey = normalizeLabel(subjectLabel);
    if (!subjectLabel || !subjectKey)
      return refuse(400, "VALIDATION", "A subject reviewer needs a subject name with at least one letter or digit.");
    if (subjectLabel.length > 80 || hasForbiddenCharacters(subjectLabel))
      return refuse(400, "VALIDATION", "A subject name is at most 80 characters, without control or invisible characters.");
  } else if (input.subjectLabel) {
    return refuse(400, "VALIDATION", "A general reviewer covers every subject, so it names none.");
  }

  if (input.branchId !== null) {
    const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
    if (!branch) return refuse(404, "NOT_FOUND", "Not found");
  }
  // Active staff only; a pupil's or a parent's membership, or a deactivated one, does not count. For an every-branch reviewer, active staff in any branch.
  const staff = await prisma.membership.findFirst({
    where: { userId: input.userId, deactivatedAt: null, role: { in: [...STAFF] }, ...(input.branchId ? { branchId: input.branchId } : {}) },
    select: { id: true },
  });
  if (!staff)
    return refuse(
      400,
      "VALIDATION",
      input.branchId ? "That person is not active staff in this branch." : "That person is not active staff in any branch.",
    );

  try {
    const reviewer = await prisma.$transaction(async (tx) => {
      const row = await tx.questionBankReviewer.create({
        data: {
          userId: input.userId,
          branchId: input.branchId,
          scope: input.scope,
          subjectLabel,
          subjectKey,
          isExamApprover: input.isExamApprover,
          assignedById: input.actorUserId,
        },
        select: SELECT,
      });
      await writeBankAudit(tx, {
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        entity: "REVIEWER",
        action: "ASSIGNED",
        ref: row.id,
        newValue: { userId: input.userId, scope: input.scope, subjectLabel, isExamApprover: input.isExamApprover },
      });
      return row;
    });
    return { ok: true, reviewer: view(reviewer, input.branchId) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return refuse(409, "CONFLICT", "That person is already a reviewer for this branch and subject.");
    throw error;
  }
}

export type RemoveReviewerInput = {
  actorUserId: string;
  actorIsSuperAdmin: boolean;
  id: string;
  canAdministerBranch: (branchId: string) => Promise<boolean>;
};

/// Removes one assignment. Unknown, and not yours to remove, are the same answer (404): the response never confirms what exists elsewhere.
export async function removeReviewer(input: RemoveReviewerInput): Promise<{ ok: true } | Fail> {
  const row = await prisma.questionBankReviewer.findUnique({
    where: { id: input.id },
    select: { id: true, userId: true, branchId: true, scope: true, subjectLabel: true, isExamApprover: true },
  });
  if (!row) return refuse(404, "NOT_FOUND", "Not found");
  const allowed =
    row.branchId === null ? input.actorIsSuperAdmin : input.actorIsSuperAdmin || (await input.canAdministerBranch(row.branchId));
  if (!allowed) return refuse(404, "NOT_FOUND", "Not found");

  // deleteMany, not delete: two people removing the same row at once must not make the second a 500 or write a second audit row.
  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.questionBankReviewer.deleteMany({ where: { id: row.id } });
    if (count === 0) return false;
    await writeBankAudit(tx, {
      branchId: row.branchId,
      actorUserId: input.actorUserId,
      entity: "REVIEWER",
      action: "REMOVED",
      ref: row.id,
      oldValue: { userId: row.userId, scope: row.scope, subjectLabel: row.subjectLabel, isExamApprover: row.isExamApprover },
    });
    return true;
  });
  return removed ? { ok: true } : refuse(404, "NOT_FOUND", "Not found");
}
