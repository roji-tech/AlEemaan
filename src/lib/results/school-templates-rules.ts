import "@/lib/zod-csp";
import { z } from "zod";
import { checkBands, checkScheme } from "@/lib/academics/scoring";
import { LAYOUT_CODES, TEMPLATE_DESCRIPTION_MAX, cleanTemplateName } from "@/lib/results/templates-rules";

// School-wide result templates, the pure rules (task 0120): no database, no clock, safe for the browser. The server (`school-templates.ts`) and the screens both read these, so "is this definition
// valid", "what state is this branch's row in" and "which keys does a sync match on" can never be answered two ways.

export const MAX_GROUPS = 8;
export const MAX_TRAITS_PER_GROUP = 30;
export const MAX_SYNC_BRANCHES = 50;
/// A stable key: lower-case letters, digits and dashes, 1 to 40 characters. Sync matches trait groups and traits on it, so renaming one never orphans the ratings already entered.
export const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export { slugKey } from "@/lib/results/school-template-seed";

const score = z.number({ error: "Give a number." });
const key = z.string().regex(KEY_PATTERN, "A key is 1 to 40 lower-case letters, digits or dashes.");
const text = (max: number) => z.string().trim().min(1).max(max);

const schemeDef = z.strictObject({
  name: text(60),
  totalMax: score,
  examMax: score,
  components: z
    .array(z.strictObject({ name: z.string().trim().min(1).max(40), maxScore: score }))
    .min(1)
    .max(10),
});
const scaleDef = z.strictObject({
  name: text(60),
  /// True when the bands are a guess the school still has to confirm (Results > Templates shows the notice until a branch confirms them).
  unconfirmed: z.boolean(),
  bands: z
    .array(z.strictObject({ min: score, max: score, letter: z.string().trim().min(1).max(4), remark: z.string().trim().min(1).max(40) }))
    .min(1)
    .max(12),
});
const traitDef = z.strictObject({ key, name: text(60) });
const groupDef = z.strictObject({
  key,
  title: text(60),
  showSign: z.boolean(),
  traits: z.array(traitDef).min(1).max(MAX_TRAITS_PER_GROUP),
});

/// What a school template says to copy into a branch's row: the marks scheme and the grade scale (each may be absent: "as the branch does today") and the trait groups. The look (layout and its
/// options) is on the master itself.
export const definitionSchema = z.strictObject({
  scheme: schemeDef.nullable(),
  scale: scaleDef.nullable(),
  groups: z.array(groupDef).max(MAX_GROUPS),
});
export type Definition = z.infer<typeof definitionSchema>;

const layoutOptions = z.strictObject({
  logo: z.boolean().optional(),
  signatureLine: z.boolean().optional(),
  nextTermDate: z.boolean().optional(),
});

export const schoolTemplateInput = z.strictObject({
  name: z.string().max(200),
  description: z.string().trim().max(TEMPLATE_DESCRIPTION_MAX).nullable().optional(),
  layoutCode: z.enum(LAYOUT_CODES).nullable().optional(),
  layoutOptions: layoutOptions.nullable().optional(),
  definition: definitionSchema,
});
export const schoolTemplatePatch = z
  .strictObject({
    name: z.string().max(200).optional(),
    description: z.string().trim().max(TEMPLATE_DESCRIPTION_MAX).nullable().optional(),
    layoutCode: z.enum(LAYOUT_CODES).nullable().optional(),
    layoutOptions: layoutOptions.nullable().optional(),
    definition: definitionSchema.optional(),
    /// Archive (true) or restore (false) the master. Rows that follow it keep working either way.
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

const branchIds = z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_SYNC_BRANCHES);
export const syncInput = z.strictObject({
  branchIds,
  replaceLocal: z.array(z.string().trim().min(1).max(64)).max(MAX_SYNC_BRANCHES).optional(),
});
export const addToBranchesInput = z.strictObject({ branchIds });

export const cleanName = (raw: string): string | null => cleanTemplateName(raw);

export type DefinitionProblem = { path: string; message: string };

/// Everything wrong with a definition that the shape alone cannot say: the marks add up, the bands are contiguous from 0 to 100, no two groups or traits share a key or a name. Empty = valid.
/// The same checks as a branch's own scheme and scale (lib/academics/scoring.ts), so a master can never hold what a branch could not.
export function checkDefinition(def: Definition): DefinitionProblem[] {
  const out: DefinitionProblem[] = [];
  if (def.scheme) {
    const bad = checkScheme({
      totalMax: def.scheme.totalMax,
      examMax: def.scheme.examMax,
      components: def.scheme.components.map((c, sortOrder) => ({ name: c.name, maxScore: c.maxScore, sortOrder })),
    });
    if (bad) out.push({ path: "scheme", message: `The marks scheme is not valid (${bad.problem}).` });
  }
  if (def.scale) {
    const bad = checkBands(def.scale.bands);
    if (bad) out.push({ path: "scale", message: `The grade scale is not valid (${bad.problem}).` });
  }
  const groupKeys = new Set<string>();
  const groupTitles = new Set<string>();
  for (const [gi, g] of def.groups.entries()) {
    if (groupKeys.has(g.key)) out.push({ path: `groups.${gi}.key`, message: `Two groups use the key "${g.key}".` });
    groupKeys.add(g.key);
    const title = g.title.toLowerCase();
    if (groupTitles.has(title)) out.push({ path: `groups.${gi}.title`, message: `Two groups are called "${g.title}".` });
    groupTitles.add(title);
    const traitKeys = new Set<string>();
    const traitNames = new Set<string>();
    for (const [ti, t] of g.traits.entries()) {
      if (traitKeys.has(t.key))
        out.push({ path: `groups.${gi}.traits.${ti}.key`, message: `Two traits of "${g.title}" use the key "${t.key}".` });
      traitKeys.add(t.key);
      const n = t.name.toLowerCase();
      if (traitNames.has(n))
        out.push({ path: `groups.${gi}.traits.${ti}.name`, message: `Two traits of "${g.title}" are called "${t.name}".` });
      traitNames.add(n);
    }
  }
  return out;
}

/// A scheme or scale NAME stands for ONE structure school-wide: two masters that name the same scheme (or scale) must describe it identically, because a branch holds one live scheme per name and
/// every row that follows a master with that name shares it. Returns what clashes, so the superadmin gives the changed one another name. `others` are the other live masters.
export function sharedNameClashes(def: Definition, others: readonly { name: string; definition: Definition }[]): string[] {
  const out: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const other of others) {
    if (
      def.scheme &&
      other.definition.scheme &&
      def.scheme.name.toLowerCase() === other.definition.scheme.name.toLowerCase() &&
      !same(def.scheme, other.definition.scheme)
    )
      out.push(`The marks scheme "${def.scheme.name}" is also used by "${other.name}" with different marks. Give this one another name.`);
    if (
      def.scale &&
      other.definition.scale &&
      def.scale.name.toLowerCase() === other.definition.scale.name.toLowerCase() &&
      !same(def.scale, other.definition.scale)
    )
      out.push(`The grade scale "${def.scale.name}" is also used by "${other.name}" with different bands. Give this one another name.`);
  }
  return out;
}

export type RowState = "up-to-date" | "behind" | "customised" | "customised-behind";

/// Where a branch's row stands against its master: Up to date (same version, nothing changed here), Behind (the master has moved on), Customised here (someone in the branch changed it), or both.
export function rowState(
  row: { schoolTemplateVersion: number | null; localEditedAt: Date | string | null },
  masterVersion: number,
): RowState {
  const behind = (row.schoolTemplateVersion ?? 0) < masterVersion;
  const customised = row.localEditedAt !== null;
  if (behind && customised) return "customised-behind";
  if (customised) return "customised";
  return behind ? "behind" : "up-to-date";
}

export const STATE_LABEL: Record<RowState, string> = {
  "up-to-date": "Up to date",
  behind: "Behind",
  customised: "Customised here",
  "customised-behind": "Customised here, and behind",
};

/// Which of the chosen branches a sync will skip: the ones whose row is customised and whose superadmin did not tick "Replace local changes" for them.
export function skippedBySync(
  rows: readonly { branchId: string; localEditedAt: Date | string | null }[],
  replaceLocal: readonly string[],
): string[] {
  const replace = new Set(replaceLocal);
  return rows.filter((r) => r.localEditedAt !== null && !replace.has(r.branchId)).map((r) => r.branchId);
}
