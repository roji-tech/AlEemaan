import { FormKind, Permission, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAdminister, resolveBranchRole } from "@/lib/auth/branch-access";

// The one place the forms module asks "may this person reach this form by its id?" (manual marking and form authority). The gate of a route (`withAuthGated`) has already said
// the request names a branch the person belongs to; this says what they may do with ONE form of that branch:
//   view    the form and its settings, the questions WITHOUT their answer key, a blank printed copy: any member of staff of the branch (the door of the route says which roles);
//   read    results, answers, turn-ins, marking queues, analytics;
//   manage  edit, close, mark, record turn-ins, sync the roll; the answer key itself and a printed copy with it:
// read and manage belong to the form's own creator while they still teach in the branch, to an administrator of the branch and to a superadmin. A colleague of the same branch, and
// non-teaching staff, view the form and no more. The one way to READ without managing is the grant an administrator gives (`CAN_VIEW_FORM_RESULTS`), held by a member of staff
// of this branch: it never writes, and it never shows the answer key. A form of another branch, or one that does not exist, is "not found" to the caller, never a refusal that
// confirms it.

export type FormAccess = "view" | "read" | "manage";

export type FormViewer = {
  userId: string;
  /// The staff role the person holds in THIS branch (a superadmin is ADMIN in every branch), or null when they hold none.
  role: Role | null;
  /// A superadmin, or an ADMIN of this very branch.
  administers: boolean;
  /// Holds CAN_VIEW_FORM_RESULTS in THIS branch (the grant belongs to one membership; the rule also needs a staff role).
  canViewResults: boolean;
  createdById: string;
};

/// The rule, as a pure function over facts already loaded, so it can be tested as a table.
export function mayAccessForm(viewer: FormViewer, access: FormAccess): boolean {
  if (viewer.role === null && !viewer.administers) return false;
  if (access === "view") return true;
  if (viewer.administers) return true;
  if (viewer.createdById === viewer.userId && (viewer.role === Role.TEACHING_STAFF || viewer.role === Role.ADMIN)) return true;
  return access === "read" && viewer.canViewResults && (viewer.role === Role.TEACHING_STAFF || viewer.role === Role.NON_TEACHING_STAFF);
}

export type ReachedForm = { id: string; kind: FormKind; branchId: string; createdById: string };

/// What the person is in this branch, loaded once for a request that judges several forms.
export async function formViewerIn(
  branchId: string,
  userId: string,
): Promise<{ role: Role | null; administers: boolean; canViewResults: boolean }> {
  const [role, administers, membership] = await Promise.all([
    resolveBranchRole(userId, branchId),
    canAdminister(userId, branchId),
    prisma.membership.findFirst({ where: { userId, branchId, deactivatedAt: null }, select: { permissions: true } }),
  ]);
  return { role, administers, canViewResults: membership?.permissions.includes(Permission.CAN_VIEW_FORM_RESULTS) ?? false };
}

/// The form `formId` of the branch when `userId` may reach it as `access` says; null when it does not exist OR the person may not, and the caller answers both the same way
/// ("not found"). `kind` narrows to one kind of form.
export async function reachForm(params: {
  branchId: string;
  userId: string;
  formId: string;
  access: FormAccess;
  kind?: FormKind;
}): Promise<ReachedForm | null> {
  const [viewer, form] = await Promise.all([
    formViewerIn(params.branchId, params.userId),
    prisma.form.findFirst({
      where: { id: params.formId, branchId: params.branchId, ...(params.kind ? { kind: params.kind } : {}) },
      select: { id: true, kind: true, branchId: true, createdById: true },
    }),
  ]);
  return form && mayAccessForm({ userId: params.userId, ...viewer, createdById: form.createdById }, params.access) ? form : null;
}
