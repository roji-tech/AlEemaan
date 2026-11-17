import type { RowVerdict, SourceRow } from "./types";

/// "Upload the corrections" while the review is open (task 0084 D4). A corrected row replaces the problem row with the same original row number and keeps that number. A row with no
/// number, a number that is not in the file, a row that had no problem, or a number used twice is refused with its own sentence and changes nothing: it is never added in silence and
/// never overwrites a row that was fine.
export function applyCorrections(
  current: SourceRow[],
  verdicts: RowVerdict[],
  corrected: SourceRow[],
): { next: SourceRow[]; refused: { line: number | null; message: string }[]; replaced: number } {
  const errorLines = new Set(verdicts.filter((v) => v.status === "error").map((v) => v.line));
  const inFile = new Set(current.map((r) => r.line));
  const replacement = new Map<number, SourceRow>();
  const refused: { line: number | null; message: string }[] = [];
  for (const c of corrected) {
    const n = c.originalLine;
    if (n === null || n === undefined)
      refused.push({ line: null, message: "A row has no row number, so it cannot be matched to a row of the file." });
    else if (!inFile.has(n)) refused.push({ line: n, message: `There is no row ${n} in this file.` });
    else if (!errorLines.has(n)) refused.push({ line: n, message: `Row ${n} had no problem, so it was not changed.` });
    else if (replacement.has(n))
      refused.push({ line: n, message: `Row ${n} appears more than once in the corrections; the first was used.` });
    else replacement.set(n, c);
  }
  const next = current.map((r) => {
    const fix = replacement.get(r.line);
    return fix ? { line: r.line, values: fix.values } : r;
  });
  return { next, refused, replaced: replacement.size };
}
