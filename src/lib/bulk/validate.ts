import { CELL_MAX_CHARS, type BulkEntityShape, type Problem, type RowVerdict, type SourceRow } from "./types";

/// The shared row rules (task 0084 D2 b and c): the kind's schema on every row, then repeated keys inside the file. The SAME function runs in the browser (to show problems at once)
/// and on the server (which never trusts what the browser says it checked). Returns one verdict per row, and the normalised rows that passed.
export function validateRows<Row>(
  entity: BulkEntityShape<Row>,
  rows: SourceRow[],
): { verdicts: RowVerdict[]; ok: { line: number; row: Row }[] } {
  const verdicts: RowVerdict[] = [];
  const ok: { line: number; row: Row }[] = [];
  const firstSeen = new Map<string, number>(); // `${key}:${value}` -> line

  for (const source of rows) {
    const problems: Problem[] = [];
    if (source.overflow)
      problems.push({ message: "This row has more cells than the header has columns (a comma inside a value must be in quotes)." });
    const input: Record<string, string> = {};
    for (const c of entity.columns) {
      const v = source.values[c.key] ?? "";
      if (v.length > CELL_MAX_CHARS) problems.push({ column: c.key, message: "This cell is too long." });
      input[c.key] = v;
    }
    let row: Row | null = null;
    if (!problems.some((p) => p.column)) {
      const parsed = entity.rowSchema.safeParse(input);
      if (parsed.success) row = parsed.data;
      else {
        const seen = new Set<string>();
        for (const issue of parsed.error.issues) {
          const column = String(issue.path[0] ?? "");
          if (seen.has(column)) continue; // one sentence per column is enough to act on
          seen.add(column);
          problems.push({ ...(column ? { column } : {}), message: issue.message });
        }
      }
    }
    if (row && problems.length === 0) {
      for (const key of entity.uniqueKeys) {
        const value = (row as Record<string, unknown>)[key];
        if (value === undefined || value === "") continue;
        const id = `${key}:${String(value).toLowerCase()}`;
        const first = firstSeen.get(id);
        if (first !== undefined) problems.push({ column: key, message: `Repeats row ${first}.` });
        else firstSeen.set(id, source.line);
      }
    }
    if (row && problems.length === 0 && entity.repeats) {
      const key = entity.repeats.of(row);
      if (key !== null) {
        const id = `repeats:${key.toLowerCase()}`;
        const first = firstSeen.get(id);
        if (first !== undefined)
          problems.push({ ...(entity.repeats.column ? { column: entity.repeats.column } : {}), message: entity.repeats.message(first) });
        else firstSeen.set(id, source.line);
      }
    }
    if (problems.length === 0 && row) {
      verdicts.push({ line: source.line, status: "ready", problems: [] });
      ok.push({ line: source.line, row });
    } else verdicts.push({ line: source.line, status: "error", problems });
  }
  return { verdicts, ok };
}
