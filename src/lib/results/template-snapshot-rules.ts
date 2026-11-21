import type { Prisma } from "@prisma/client";

// What a published term keeps of its template (task 0127): the look and the trait groups as they were when the class's results were first published, so editing the template afterwards (its
// look, a trait renamed, added or archived) changes the terms published after the edit and not the ones before it. Pure: no database, no server-only code.

export type SnapshotLayout = { code: string; name: string; isLegacy: boolean; options: Record<string, boolean> };
export type SnapshotGroup = { id: string; title: string; showSign: boolean; traits: { id: string; name: string }[] };
export type TemplateSnapshot = { layout: SnapshotLayout | null; groups: SnapshotGroup[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/// The stored JSON as a snapshot, or null when it is missing or not of the expected shape (the term then follows the live template, as it did before snapshots).
export function readSnapshot(json: Prisma.JsonValue | null | undefined): TemplateSnapshot | null {
  if (!isObject(json) || !Array.isArray(json.groups)) return null;
  const groups: SnapshotGroup[] = [];
  for (const g of json.groups) {
    if (!isObject(g) || typeof g.id !== "string" || typeof g.title !== "string" || !Array.isArray(g.traits)) return null;
    const traits: { id: string; name: string }[] = [];
    for (const t of g.traits) {
      if (!isObject(t) || typeof t.id !== "string" || typeof t.name !== "string") return null;
      traits.push({ id: t.id, name: t.name });
    }
    groups.push({ id: g.id, title: g.title, showSign: g.showSign === true, traits });
  }
  const l = json.layout;
  const layout =
    isObject(l) && typeof l.code === "string" && typeof l.name === "string" && isObject(l.options)
      ? {
          code: l.code,
          name: l.name,
          isLegacy: l.isLegacy === true,
          options: Object.fromEntries(Object.entries(l.options).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>,
        }
      : null;
  return { layout, groups };
}
