// Result templates, the pure rules (task 0116): no database, no clock, safe for the browser. The server (`templates.ts`) and the screens both read these, so "which template does this
// class use", "what does a move change" and "which classes does a range cover" can never be answered two ways.

export const TEMPLATE_NAME_MAX = 60;
export const TEMPLATE_DESCRIPTION_MAX = 200;
/// The look of a printed card, by code. DEFAULT and LEGACY are the branch layouts that always existed; PRESCHOOL, BASIC, JUNIOR and SENIOR are the school's four printed report cards (task 0116):
/// the card draws that card's sections (trait groups, the grade legend, the term's dates) from its template's data.
export const LAYOUT_CODES = ["DEFAULT", "LEGACY", "PRESCHOOL", "BASIC", "JUNIOR", "SENIOR"] as const;
export type LayoutCode = (typeof LAYOUT_CODES)[number];
export const LAYOUT_OPTION_KEYS = ["logo", "signatureLine", "nextTermDate"] as const;
export type LayoutOptions = Partial<Record<(typeof LAYOUT_OPTION_KEYS)[number], boolean>>;

/// A template name: whitespace collapsed and trimmed; null when empty or too long (the caller says why in words).
export function cleanTemplateName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= TEMPLATE_NAME_MAX ? name : null;
}

export type TemplateRef = { id: string; name: string; isDefault: boolean };
export type ClassRef = { id: string; name: string; sortOrder: number; sectionId?: string | null; sectionName?: string | null };
export type Assignment = { classGroupId: string; templateId: string };

/// The classes in the list's order: the sort order, then the name with numbers read as numbers ("Basic 2" before "Basic 10").
export function sortClasses<T extends { name: string; sortOrder: number }>(classes: readonly T[]): T[] {
  return [...classes].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }),
  );
}

/// The template a class uses: the one it was explicitly placed in, else the branch's default. Null only when the branch has no default (it always has, the server makes one).
export function resolveTemplateId(
  assignments: readonly Assignment[],
  defaultTemplateId: string | null,
  classGroupId: string,
): string | null {
  return assignments.find((a) => a.classGroupId === classGroupId)?.templateId ?? defaultTemplateId;
}

export type CoverageRow = {
  classGroupId: string;
  name: string;
  sectionName: string | null;
  templateId: string | null;
  templateName: string | null;
  /// True when the class was placed in a template by someone; false = it uses the default because nobody has chosen.
  explicit: boolean;
  /// The class's own scheme (Academics > Assessment and grading), which is used instead of the template's.
  ownScheme: { id: string; name: string } | null;
};

/// Every class with the template it uses, in the list's order, and how many nobody has placed.
export function buildCoverage(
  classes: readonly ClassRef[],
  assignments: readonly Assignment[],
  templates: readonly TemplateRef[],
  ownSchemes: Readonly<Record<string, { id: string; name: string } | undefined>> = {},
): { rows: CoverageRow[]; unplaced: number } {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const defaultId = templates.find((t) => t.isDefault)?.id ?? null;
  const rows = sortClasses(classes).map((c): CoverageRow => {
    const placed = assignments.find((a) => a.classGroupId === c.id)?.templateId;
    const templateId = placed && byId.has(placed) ? placed : defaultId;
    return {
      classGroupId: c.id,
      name: c.name,
      sectionName: c.sectionName ?? null,
      templateId,
      templateName: templateId ? (byId.get(templateId)?.name ?? null) : null,
      explicit: !!placed && byId.has(placed),
      ownScheme: ownSchemes[c.id] ?? null,
    };
  });
  return { rows, unplaced: rows.filter((r) => !r.explicit).length };
}

/// "From Basic 1 to Basic 5": every class between the two, in the list's order, both ends included; the ends may be given in either order. An unknown id gives nothing.
export function rangeSelection(ordered: readonly { id: string }[], fromId: string, toId: string): string[] {
  const a = ordered.findIndex((c) => c.id === fromId);
  const b = ordered.findIndex((c) => c.id === toId);
  if (a < 0 || b < 0) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return ordered.slice(lo, hi + 1).map((c) => c.id);
}

/// Every class of one section ("all the JSS classes"); classes in no section are never selected by this.
export const idsInSection = (classes: readonly ClassRef[], sectionId: string): string[] =>
  classes.filter((c) => c.sectionId === sectionId).map((c) => c.id);

export type Move = { classGroupId: string; className: string; fromTemplateId: string; fromTemplateName: string };

/// What placing `classGroupIds` in `targetTemplateId` would take out of OTHER templates: each class that is explicitly in a different template leaves it. A class already in the target, or
/// in none, moves nothing. Nothing is a move in the other direction: a class that stays where it is needs no confirmation.
export function movePreview(
  assignments: readonly Assignment[],
  templates: readonly TemplateRef[],
  classes: readonly ClassRef[],
  targetTemplateId: string,
  classGroupIds: readonly string[],
): Move[] {
  const names = new Map(templates.map((t) => [t.id, t.name]));
  const classNames = new Map(classes.map((c) => [c.id, c.name]));
  return classGroupIds.flatMap((id) => {
    const from = assignments.find((a) => a.classGroupId === id);
    if (!from || from.templateId === targetTemplateId) return [];
    return [
      {
        classGroupId: id,
        className: classNames.get(id) ?? id,
        fromTemplateId: from.templateId,
        fromTemplateName: names.get(from.templateId) ?? "another template",
      },
    ];
  });
}

/// The set a template ends up with when it is given `desired`, against what it holds: who is added, who is dropped (back to "uses the default"), who is unchanged.
export function diffClasses(current: readonly string[], desired: readonly string[]): { add: string[]; drop: string[]; keep: string[] } {
  const now = new Set(current);
  const want = new Set(desired);
  return {
    add: [...want].filter((id) => !now.has(id)),
    drop: [...now].filter((id) => !want.has(id)),
    keep: [...want].filter((id) => now.has(id)),
  };
}

/// A template's layout as the report card uses it: the layout's own options with the template's overrides on top. Only known keys with a true or false are taken.
export function mergeLayoutOptions(base: LayoutOptions | null | undefined, override: unknown): LayoutOptions {
  const out: LayoutOptions = { ...(base ?? {}) };
  if (override && typeof override === "object")
    for (const key of LAYOUT_OPTION_KEYS) {
      const value = (override as Record<string, unknown>)[key];
      if (typeof value === "boolean") out[key] = value;
    }
  return out;
}

/// The words a screen uses for what a class's marks come from, so the table and the server agree.
export function schemeSource(ownScheme: { name: string } | null, templateScheme: { name: string } | null): string {
  if (ownScheme) return `its own scheme, ${ownScheme.name}`;
  if (templateScheme) return `the template's scheme, ${templateScheme.name}`;
  return "the branch's default scheme";
}

export type ScaleSource = "class" | "template" | "branch";

/// Which grade scale a class grades on (task 0116): the class's OWN scale, else its result template's scale, else the branch's default scale. Pure: the ids only. Null when none is set
/// anywhere (a sheet is then refused with the usual "set up a default grade scale" words). A scale that is named but archived is NOT skipped here: the server refuses it (a different
/// scale is never applied silently).
export function pickScale(
  classScaleId: string | null | undefined,
  templateScaleId: string | null | undefined,
  branchDefaultScaleId: string | null | undefined,
): { scaleId: string | null; source: ScaleSource | null } {
  if (classScaleId) return { scaleId: classScaleId, source: "class" };
  if (templateScaleId) return { scaleId: templateScaleId, source: "template" };
  if (branchDefaultScaleId) return { scaleId: branchDefaultScaleId, source: "branch" };
  return { scaleId: null, source: null };
}

/// The words a screen uses for where a class's scale comes from.
export const SCALE_SOURCE_TEXT: Record<ScaleSource, string> = {
  class: "set for this class",
  template: "from its result template",
  branch: "the branch's default",
};
