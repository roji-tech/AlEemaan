import "@/lib/zod-csp";
import { z } from "zod";
import { structureName, subjectCode } from "@/lib/academics/structure-rules";

// The rules of the shared subject catalogue (task 0119), CLIENT-SAFE (no database): the routes (`subject-catalog.ts`), the bulk kind and the screens use the same words and limits.
// The catalogue is the school's list of subjects; each branch keeps its own `Subject` row linked to an entry by `catalogId`. These rules decide nothing about who may act: the routes do.

export const MAX_CATALOG_IDS = 50; // entries added to a branch in one request
export const MAX_CATALOG_BRANCHES = 50; // branches an entry is added to in one request
export const MAX_CATALOG_LIST = 500; // entries one list answer holds
export const MAX_TAGS = 10; // tags on one subject
export const MAX_TAG_CHARS = 30;

export const CATALOG_TAKEN = "The catalogue already has a subject with that name or code.";
export const CATALOG_RENAME_NEEDS_NAME = "Give the new name to rename it in the branches.";

const id = z.string().trim().min(1).max(64);

/// One tag as stored: lower-case, trimmed, runs of spaces made one. Letters, digits, spaces and dashes only; it starts with a letter or digit. (Tags are labels: they give no access.)
export const normalizeTag = (raw: string): string => raw.trim().replace(/\s+/g, " ").toLowerCase();
const TAG_SHAPE = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;
export const tagText = z
  .string()
  .transform(normalizeTag)
  .pipe(
    z
      .string()
      .min(1, "A tag cannot be empty.")
      .max(MAX_TAG_CHARS, `A tag is at most ${MAX_TAG_CHARS} characters.`)
      .regex(TAG_SHAPE, "A tag uses letters, numbers, spaces and dashes only."),
  );
/// A list of tags: each normalised, repeats dropped, at most `MAX_TAGS`. The raw list is bounded too, so a huge payload is refused before anything is looked at.
export const tagList = z
  .array(z.string().max(200))
  .max(MAX_TAGS * 3, `Use at most ${MAX_TAGS} tags.`)
  .transform((list) => list.map(normalizeTag).filter((t) => t !== ""))
  .pipe(z.array(tagText))
  .transform((list) => [...new Set(list)])
  .refine((list) => list.length <= MAX_TAGS, `Use at most ${MAX_TAGS} tags.`);
/// A tags cell of a file: tags separated by semicolons ("core; basic"), an empty cell none.
export const splitTagCell = (cell: string): string[] =>
  cell
    .split(";")
    .map((t) => t.trim())
    .filter((t) => t !== "");

export const catalogInput = z.strictObject({ name: structureName, code: subjectCode.nullable().optional(), tags: tagList.optional() });
export const catalogPatch = z
  .strictObject({
    name: structureName.optional(),
    code: subjectCode.nullable().optional(),
    tags: tagList.optional(),
    archived: z.boolean().optional(),
    /// Also rename the branches' own subjects that are linked to this entry (default: no). Refused as a whole when a branch already has another live subject with the new name.
    renameInBranches: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.")
  .refine((v) => v.renameInBranches !== true || v.name !== undefined, CATALOG_RENAME_NEEDS_NAME);
export const addToBranchesInput = z.strictObject({
  branchIds: z.array(id).min(1, "Choose at least one branch.").max(MAX_CATALOG_BRANCHES),
});
export const fromCatalogInput = z.strictObject({
  branchId: id,
  catalogIds: z.array(id).min(1, "Choose at least one subject.").max(MAX_CATALOG_IDS),
});
export const availableQuery = z.object({ branchId: id, tag: tagText.optional() });
export const listQuery = z.object({
  q: z.string().trim().max(60).optional(),
  archived: z.enum(["true", "false"]).optional(),
  tag: tagText.optional(),
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
  gone: "Not found",
};
