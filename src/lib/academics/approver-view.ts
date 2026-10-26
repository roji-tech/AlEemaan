import type { ClassGroupView, ScopeView, SectionView } from "./approver-settings";
import type { ScopeEntry } from "./section-rules";

// What the Results approval tab (task 0039, slice 3) decides without a browser: which sections a class can be moved to and the plain words for a set of scopes. Pure, so each is
// a table in a unit test; the server stays the judge (the same rules refuse the same things), and the screen simply never offers what the server would refuse.

/// The live sections a class group can be put in: every live section of the branch except the one it is already in.
export const placementTargets = (group: ClassGroupView, sections: readonly SectionView[]): SectionView[] =>
  sections.filter((section) => !section.archived && section.id !== group.sectionId);

export function describeScope(scope: ScopeView): string {
  if (scope.kind === "GENERAL") return "Everything";
  if (scope.kind === "SECTION") return `Section: ${scope.sectionName ?? "unknown"}`;
  return `Class: ${scope.classGroupName ?? "unknown"}`;
}

/// "Nothing" for no scope at all (the person approves nothing: the setting fails closed), else the scopes in the order they are kept (General, sections, classes).
export const describeScopes = (scopes: readonly ScopeView[]): string => (scopes.length === 0 ? "Nothing" : scopes.map(describeScope).join(", "));

/// The scopes of a person as the entries the API takes, in the canonical order: General alone, or the sections and then the classes.
export function scopeEntries(general: boolean, sectionIds: readonly string[], classGroupIds: readonly string[]): ScopeEntry[] {
  if (general) return [{ kind: "GENERAL" }];
  return [
    ...[...sectionIds].sort().map((sectionId): ScopeEntry => ({ kind: "SECTION", sectionId })),
    ...[...classGroupIds].sort().map((classGroupId): ScopeEntry => ({ kind: "CLASS", classGroupId })),
  ];
}

/// The entries a person holds now, in the same shape, to tell whether the editor changed anything.
export const heldEntries = (scopes: readonly ScopeView[]): ScopeEntry[] =>
  scopeEntries(
    scopes.some((scope) => scope.kind === "GENERAL"),
    scopes.flatMap((scope) => (scope.kind === "SECTION" && scope.sectionId ? [scope.sectionId] : [])),
    scopes.flatMap((scope) => (scope.kind === "CLASS" && scope.classGroupId ? [scope.classGroupId] : [])),
  );

export const sameEntries = (a: readonly ScopeEntry[], b: readonly ScopeEntry[]): boolean => {
  const key = (e: ScopeEntry) => (e.kind === "GENERAL" ? "G" : e.kind === "SECTION" ? `S:${e.sectionId}` : `C:${e.classGroupId}`);
  return a.length === b.length && a.every((entry, index) => key(entry) === key(b[index]));
};

/// "Teaching staff" for TEACHING_STAFF.
export const roleLabel = (role: string): string => {
  const words = role.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/// What the editor would save, in words for the confirmation dialog.
export function wordsFor(entries: readonly ScopeEntry[], sections: readonly SectionView[], classGroups: readonly ClassGroupView[]): string {
  if (entries.some((entry) => entry.kind === "GENERAL")) return "Everything";
  const parts = entries.map((entry) =>
    entry.kind === "SECTION"
      ? `Section: ${sections.find((s) => s.id === entry.sectionId)?.name ?? "unknown"}`
      : entry.kind === "CLASS"
        ? `Class: ${classGroups.find((g) => g.id === entry.classGroupId)?.name ?? "unknown"}`
        : "Everything",
  );
  return parts.length === 0 ? "Nothing" : parts.join(", ");
}
