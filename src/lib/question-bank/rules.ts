import { Role, type BankItemStatus, type BankVisibility } from "@prisma/client";

// Who may do what with a question bank item (design note sections 6 and 7; slice 2 rules in docs/tasks/0032, section 4b). Pure functions over facts already loaded, so every rule
// can be tested as a table without a database, and the routes and services all ask the same code. The loaders (`loadViewer`) live in `viewer.ts`; nothing here reads or writes.
//
// The shape of the rules, in one place:
//   - A superadmin may do everything (the audited "override"), except that they are not "staff of a branch" for the purposes below that name a branch: they simply pass.
//   - A reviewer row counts only while its person is STILL active staff in the row's branch (any branch for an every-branch row). Removing or deactivating someone
//     takes effect at their next decision, not at their next sign-in.
//   - Nobody decides their own submission; only a superadmin can.
//   - What an uploader may learn about their own item is only its status (and a rejection's reason): nothing here lets a non-approver see an overlap flag.

const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF, Role.NON_TEACHING_STAFF];
const TEACHING_ROLES: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF];

export type BankViewer = {
  userId: string;
  /// Already true only for a superadmin who still holds an active membership (see `branch-access.ts`).
  isSuperAdmin: boolean;
  /// ACTIVE memberships only.
  memberships: ReadonlyArray<{ branchId: string; role: Role }>;
  reviewerRows: ReadonlyArray<{
    branchId: string | null;
    scope: "GENERAL" | "SUBJECT";
    subjectKey: string | null;
    isExamApprover: boolean;
  }>;
  /// Folded names (as `subjectKey`) of the subjects the person teaches, per branch (`StaffSubjectAssignment`, not archived).
  teaches: ReadonlyArray<{ branchId: string; subjectKey: string }>;
};

export type BankItemFacts = {
  branchId: string | null;
  subjectKey: string | null;
  status: BankItemStatus;
  visibility: BankVisibility;
  visibleFrom: Date | null;
  submittedById: string;
};

export type DecisionAction = "approve" | "reject" | "edit" | "retire";

const staffIn = (viewer: BankViewer, branchId: string) =>
  viewer.memberships.some((m) => m.branchId === branchId && STAFF_ROLES.includes(m.role));
const anyStaff = (viewer: BankViewer) => viewer.memberships.some((m) => STAFF_ROLES.includes(m.role));
const adminOf = (viewer: BankViewer, branchId: string) => viewer.memberships.some((m) => m.branchId === branchId && m.role === Role.ADMIN);
const anyAdmin = (viewer: BankViewer) => viewer.memberships.some((m) => m.role === Role.ADMIN);

/// The reviewer rows that still count: the person is active staff where the row says (anywhere, for an every-branch row).
function liveReviewerRows(viewer: BankViewer) {
  return viewer.reviewerRows.filter((row) => (row.branchId === null ? anyStaff(viewer) : staffIn(viewer, row.branchId)));
}

export type ReviewPower = {
  /// May approve, reject, edit or retire this item (subject to its status and the self-decision rule).
  mayReview: boolean;
  /// Sees overlap warnings and sets visibility.
  examApprover: boolean;
  /// Covers every branch (needed to make an item general).
  everyBranch: boolean;
};

const NONE: ReviewPower = { mayReview: false, examApprover: false, everyBranch: false };

/// What this person's authority over an item's REVIEW is, from who they are alone: a superadmin; an every-branch reviewer or the item's branch reviewer whose scope covers the
/// item's subject; or the administrator of the item's branch (the design note's "override": not an exam approver). A general item (no branch) is reached only by an every-branch
/// reviewer: "a branch can never override a school-wide" decision.
export function reviewPower(viewer: BankViewer, item: Pick<BankItemFacts, "branchId" | "subjectKey">): ReviewPower {
  if (viewer.isSuperAdmin) return { mayReview: true, examApprover: true, everyBranch: true };
  const matching = liveReviewerRows(viewer).filter(
    (row) =>
      (row.branchId === null || (item.branchId !== null && row.branchId === item.branchId)) &&
      (row.scope === "GENERAL" || (item.subjectKey !== null && row.subjectKey === item.subjectKey)),
  );
  const power: ReviewPower = {
    mayReview: matching.length > 0,
    examApprover: matching.some((row) => row.isExamApprover),
    everyBranch: matching.some((row) => row.branchId === null),
  };
  if (item.branchId !== null && adminOf(viewer, item.branchId)) power.mayReview = true;
  return power.mayReview ? power : NONE;
}

/// Who may write a question into a branch: a superadmin; an administrator or teacher of that branch; a reviewer who is active staff there (a reviewer may be non-teaching).
export function mayAuthorIn(viewer: BankViewer, branchId: string): boolean {
  if (viewer.isSuperAdmin) return true;
  if (viewer.memberships.some((m) => m.branchId === branchId && TEACHING_ROLES.includes(m.role))) return true;
  return liveReviewerRows(viewer).some((row) => (row.branchId === null || row.branchId === branchId) && staffIn(viewer, branchId));
}

/// The submitter edits their own DRAFT (free), PENDING (a new version) and REJECTED (then submits again) item; never an APPROVED or RETIRED one.
export function mayEditAsSubmitter(viewer: BankViewer, item: Pick<BankItemFacts, "status" | "submittedById">): boolean {
  return item.submittedById === viewer.userId && (item.status === "DRAFT" || item.status === "PENDING" || item.status === "REJECTED");
}

export function maySubmit(viewer: BankViewer, item: Pick<BankItemFacts, "status" | "submittedById">): boolean {
  return item.submittedById === viewer.userId && (item.status === "DRAFT" || item.status === "REJECTED");
}

export type DecisionVerdict = { ok: true } | { ok: false; why: "STATUS" | "SELF" | "SCOPE" };

/// Whether the person may take this decision on this item now. The order matters only for the reason given: scope is asked first, so a person with no authority learns nothing
/// about the item's status.
export function mayDecide(viewer: BankViewer, item: BankItemFacts, action: DecisionAction): DecisionVerdict {
  if (!reviewPower(viewer, item).mayReview) return { ok: false, why: "SCOPE" };
  if (item.submittedById === viewer.userId && !viewer.isSuperAdmin) return { ok: false, why: "SELF" };
  const needs: BankItemStatus = action === "approve" || action === "reject" ? "PENDING" : "APPROVED";
  if (item.status !== needs) return { ok: false, why: "STATUS" };
  return { ok: true };
}

/// Visibility is set by an exam approver in scope, the administrator of the item's branch, or a superadmin; never by the uploader and never by a reviewer who is not one of those.
export function maySetVisibility(viewer: BankViewer, item: Pick<BankItemFacts, "branchId" | "subjectKey">): boolean {
  if (viewer.isSuperAdmin) return true;
  if (reviewPower(viewer, item).examApprover) return true;
  return item.branchId !== null && adminOf(viewer, item.branchId);
}

/// Overlap warnings: exam approvers in scope and superadmins only. Not reviewers, not administrators, never the uploader.
export const maySeeOverlap = (viewer: BankViewer, item: Pick<BankItemFacts, "branchId" | "subjectKey">): boolean =>
  reviewPower(viewer, item).examApprover;

/// Making an item GENERAL (every branch) needs an every-branch reviewer or a superadmin.
export const mayMakeGeneral = (viewer: BankViewer, item: Pick<BankItemFacts, "branchId" | "subjectKey">): boolean =>
  reviewPower(viewer, item).everyBranch;

/// Whether pupils already see this item: PRACTICE, or TEACHERS_ONLY_UNTIL once its date has passed. (Whether a pupil route exists for it is slice 4's business.)
export function pupilsMaySee(item: Pick<BankItemFacts, "visibility" | "visibleFrom">, now: Date): boolean {
  if (item.visibility === "PRACTICE") return true;
  return item.visibility === "TEACHERS_ONLY_UNTIL" && item.visibleFrom !== null && item.visibleFrom.getTime() <= now.getTime();
}

/// Whether a member of staff may see an item in a listing or by id. Superadmin: all. The submitter: their own, in any status. A DRAFT: no one else. A reviewer or the branch's
/// administrator in scope: every status but DRAFT. Any other staff: APPROVED items only, in their branch scope (every branch for a general item); the ones pupils can already
/// see by any active staff member, and the secret ones (TEACHERS_ONLY, or UNTIL its date) by a teacher of that subject, or by any teacher when the item has no subject.
export function staffMaySee(viewer: BankViewer, item: BankItemFacts, now: Date): boolean {
  if (viewer.isSuperAdmin) return true;
  if (item.submittedById === viewer.userId) return true;
  if (item.status === "DRAFT") return false;
  if (reviewPower(viewer, item).mayReview) return true;
  if (item.status !== "APPROVED") return false;

  const inScope = item.branchId === null ? anyStaff(viewer) : staffIn(viewer, item.branchId);
  if (!inScope) return false;
  if (pupilsMaySee(item, now)) return true;

  // a secret item
  const administers = item.branchId === null ? anyAdmin(viewer) : adminOf(viewer, item.branchId);
  if (administers) return true;
  const teachesHere = viewer.memberships.some(
    (m) => m.role === Role.TEACHING_STAFF && (item.branchId === null || m.branchId === item.branchId),
  );
  if (!teachesHere) return false;
  if (item.subjectKey === null) return true;
  return viewer.teaches.some((t) => t.subjectKey === item.subjectKey && (item.branchId === null || t.branchId === item.branchId));
}
