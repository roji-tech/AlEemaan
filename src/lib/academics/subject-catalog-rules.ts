import "@/lib/zod-csp";
import { z } from "zod";
import { structureName, subjectCode } from "@/lib/academics/structure-rules";

// The rules of the shared subject catalogue (task 0119), CLIENT-SAFE (no database): the routes (`subject-catalog.ts`), the bulk kind and the screens use the same words and limits.
// The catalogue is the school's list of subjects; each branch keeps its own `Subject` row linked to an entry by `catalogId`. These rules decide nothing about who may act: the routes do.

export const MAX_CATALOG_IDS = 50; // entries added to a branch in one request
export const MAX_CATALOG_BRANCHES = 50; // branches an entry is added to in one request
export const MAX_CATALOG_LIST = 500; // entries one list answer holds

export const CATALOG_TAKEN = "The catalogue already has a subject with that name or code.";
export const CATALOG_RENAME_NEEDS_NAME = "Give the new name to rename it in the branches.";

const id = z.string().trim().min(1).max(64);

export const catalogInput = z.strictObject({ name: structureName, code: subjectCode.nullable().optional() });
export const catalogPatch = z
  .strictObject({
    name: structureName.optional(),
    code: subjectCode.nullable().optional(),
    archived: z.boolean().optional(),
    /// Also rename the branches' own subjects that are linked to this entry (default: no). Refused as a whole when a branch already has another live subject with the new name.
    renameInBranches: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.")
  .refine((v) => v.renameInBranches !== true || v.name !== undefined, CATALOG_RENAME_NEEDS_NAME);
export const addToBranchesInput = z.strictObject({ branchIds: z.array(id).min(1, "Choose at least one branch.").max(MAX_CATALOG_BRANCHES) });
export const fromCatalogInput = z.strictObject({
  branchId: id,
  catalogIds: z.array(id).min(1, "Choose at least one subject.").max(MAX_CATALOG_IDS),
});
export const availableQuery = z.object({ branchId: id });
export const listQuery = z.object({
  q: z.string().trim().max(60).optional(),
  archived: z.enum(["true", "false"]).optional(),
});

/// Two names are the same subject when they match ignoring case and the spaces at the ends.
export const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export type BranchSubject = { id: string; name: string; code: string | null; catalogId: string | null };
export type AddOutcome =
  | { kind: "already" } // the branch has a live subject linked to this entry
  | { kind: "link"; subjectId: string } // the branch has a live subject with this name that is not linked yet: it is linked, not duplicated
  | { kind: "clash" } // the branch has a live subject with this name that is linked to ANOTHER entry
  | { kind: "create"; withCode: boolean }; // the branch gets its own new subject; the code is left off when another subject of the branch already holds it

/// What putting a catalogue entry into one branch does, from the branch's LIVE subjects. Pure: the caller does the writing, inside one transaction.
export function planAdd(entry: { id: string; name: string; code: string | null }, live: readonly BranchSubject[]): AddOutcome {
  if (live.some((s) => s.catalogId === entry.id)) return { kind: "already" };
  const named = live.find((s) => sameName(s.name, entry.name));
  if (named) return named.catalogId === null ? { kind: "link", subjectId: named.id } : { kind: "clash" };
  return { kind: "create", withCode: entry.code !== null && !live.some((s) => s.code === entry.code) };
}

/// The branches in which giving the linked subjects `newName` would clash with ANOTHER live subject of the same branch (names, ignoring case), sorted and without repeats.
export function renameClashes(
  linked: readonly { branchId: string; branchName: string; subjectId: string }[],
  liveByBranch: ReadonlyMap<string, readonly { id: string; name: string }[]>,
  newName: string,
): string[] {
  const names = new Set<string>();
  for (const l of linked) {
    const others = liveByBranch.get(l.branchId) ?? [];
    if (others.some((o) => o.id !== l.subjectId && sameName(o.name, newName))) names.add(l.branchName);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export const renameClashMessage = (branchNames: readonly string[]): string =>
  `Not renamed: ${branchNames.length === 1 ? "this branch already has" : "these branches already have"} another subject with that name: ${branchNames.join(", ")}.`;

export type AddResult = "added" | "linked" | "already" | "clash" | "gone";
export const ADD_RESULT_TEXT: Record<AddResult, string> = {
  added: "Added",
  linked: "Linked to the subject it already has",
  already: "Already has it",
  clash: "Has another subject with that name",
  gone: "Not in the catalogue",
};
