// The pure rules of sections and approver scopes (task 0039, slice 2b; Octalve Edu's ADR 0018), judged without a database so every one is a table in a unit test. The service
// (approver-settings.ts) asks these first, then asks the database about what only the database knows (does the section exist in this branch).

export const SECTION_NAME_MAX = 80; // the database check says the same: 1 to 80 characters
export const SCOPES_PER_PERSON_MAX = 100;

/// A section's name: trimmed, inner whitespace collapsed, 1 to 80 characters. Returns null when it cannot be one (not text, blank, too long, or a control character).
export function cleanSectionName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[\u0000-\u001f\u007f]/.test(value.replace(/[\t\r\n]/g, " "))) return null;
  const name = value.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= SECTION_NAME_MAX ? name : null;
}

export type ScopeEntry = { kind: "GENERAL" } | { kind: "SECTION"; sectionId: string } | { kind: "CLASS"; classGroupId: string };

export const scopeKey = (entry: ScopeEntry): string =>
  entry.kind === "GENERAL" ? "GENERAL" : entry.kind === "SECTION" ? `SECTION:${entry.sectionId}` : `CLASS:${entry.classGroupId}`;

const ORDER = { GENERAL: 0, SECTION: 1, CLASS: 2 } as const;

export type ScopeSetProblem = "GENERAL_WITH_OTHERS";

/// The set an administrator asked for, made canonical: a repeated entry is one entry; the order is fixed (General, then sections, then classes, each by id), so the audit
/// row of an unchanged set is the same row. A GENERAL entry together with others is refused: General already covers everything, and keeping the others would make the
/// narrower entries look like they still mean something.
export function normaliseScopeSet(
  entries: readonly ScopeEntry[],
): { ok: true; scopes: ScopeEntry[] } | { ok: false; problem: ScopeSetProblem } {
  const unique = new Map<string, ScopeEntry>();
  for (const entry of entries) unique.set(scopeKey(entry), entry);
  const scopes = [...unique.values()].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || scopeKey(a).localeCompare(scopeKey(b)));
  if (scopes.length > 1 && scopes.some((entry) => entry.kind === "GENERAL")) return { ok: false, problem: "GENERAL_WITH_OTHERS" };
  return { ok: true, scopes };
}
