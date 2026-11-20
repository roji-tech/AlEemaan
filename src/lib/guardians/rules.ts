import { GuardianRelationship } from "@prisma/client";
import { mayAdminister, type AdminScope } from "@/lib/auth/branch-access";
import { phoneKey } from "@/lib/programs/people-rules";

// Guardians as records of their own (task 0113 D1, D3, D4; the maintainer 2026-11-19: "why don't we separate the guardian info and just use foreign key to connect it"). The pure rules:
// how a phone and an e-mail are kept and compared, which guardian a pupil's old columns mirror, and who may do what. No database.

export { phoneKey };

export const RELATIONSHIPS = [
  GuardianRelationship.MOTHER,
  GuardianRelationship.FATHER,
  GuardianRelationship.GUARDIAN,
  GuardianRelationship.OTHER,
] as const;
export const RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  MOTHER: "Mother",
  FATHER: "Father",
  GUARDIAN: "Guardian",
  OTHER: "Other",
};

/// A phone as kept: spaces, dashes, brackets and dots removed (the digits and a leading + stay). Null when nothing is left.
export function cleanPhone(phone: string | null | undefined): string | null {
  const clean = (phone ?? "").replace(/[\s\-().]/g, "");
  return clean === "" ? null : clean;
}

/// An e-mail as kept: trimmed, lower case. Null when blank.
export function cleanEmail(email: string | null | undefined): string | null {
  const clean = (email ?? "").trim().toLowerCase();
  return clean === "" ? null : clean;
}

/// Two names are the same guardian's when they match ignoring case and repeated spaces.
export const sameName = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? "").trim().replace(/\s+/g, " ").toLowerCase() === (b ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export type MirrorLink = {
  isMain: boolean;
  createdAt: Date;
  blockedAt: Date | null;
  guardian: { name: string; phone: string | null; email: string | null; archivedAt: Date | null };
};
export type Mirror = { guardianName: string | null; guardianPhone: string | null; guardianEmail: string | null };

/// What a pupil's old guardian columns hold (task 0113 D3): the first ALLOWED guardian, the main contact first, then the earliest linked; nothing when every guardian is blocked or
/// archived. So a blocked guardian stops being the child's contact (broadcasts read these columns).
export function mirrorOf(links: readonly MirrorLink[]): Mirror {
  const allowed = links
    .filter((l) => !l.blockedAt && !l.guardian.archivedAt)
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.createdAt.getTime() - b.createdAt.getTime());
  const first = allowed[0]?.guardian;
  return { guardianName: first?.name ?? null, guardianPhone: first?.phone ?? null, guardianEmail: first?.email ?? null };
}

/// May this administrator see a guardian with children in these branches? A superadmin always; an administrator of at least one of them.
export const maySeeGuardian = (scope: AdminScope, childBranchIds: readonly string[]): boolean =>
  scope.superAdmin || childBranchIds.some((id) => scope.branchIds.includes(id));

/// May they edit the guardian's details or make the guardian's access code (task 0113 D4)? A superadmin; or an administrator of EVERY branch the guardian's children are in (the code opens
/// all of them, so an administrator of one branch never opens a child in a branch they do not run). A guardian with no child is a superadmin's.
export const mayActForGuardian = (scope: AdminScope, childBranchIds: readonly string[]): boolean =>
  scope.superAdmin || (childBranchIds.length > 0 && childBranchIds.every((id) => scope.branchIds.includes(id)));

/// May they link, unlink, block or unblock this guardian for a child of this branch, or change the relationship or the main contact? A superadmin or an administrator of the child's branch.
export const mayManageLink = (scope: AdminScope, childBranchId: string): boolean => mayAdminister(scope, childBranchId);

/// A search box's text as what it may match: the words for a name, the national digits for a phone (at least 3), and an e-mail fragment.
export function guardianQuery(q: string): { text: string; digits: string | null } {
  const text = q.trim().slice(0, 100);
  const raw = text.replace(/\D/g, "");
  const digits =
    raw.length >= 3 && /^[\d\s+\-().]+$/.test(text)
      ? raw.startsWith("234") && raw.length >= 12
        ? raw.slice(3)
        : raw.replace(/^0+/, "")
      : null;
  return { text, digits: digits && digits.length >= 3 ? digits : null };
}
