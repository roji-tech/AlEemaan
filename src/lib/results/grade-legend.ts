// The grading line of a printed report card, the way the school's own cards print it (task 0116, found in the preview of 2026-11-20): the senior card says "A1 (75-100) ... F9 (0-39)", highest
// first, each band a whole-number range that does not touch the next; the junior card names its grades and prints no marks at all. A grade band is STORED as [min, max) (it takes a mark from
// min up to, but not including, max; the top band is closed at its max), so printing the stored edges ("F9 (0-40), E8 (40-45)") made every band overlap its neighbour. Pure: no database.

export type LegendBand = { min: number; max: number; letter: string; remark: string };

const num = (n: number) => String(Math.round(n * 100) / 100);
const whole = (n: number) => Number.isInteger(n);

/// One band's marks: a whole-number band [min, max) is "min-(max-1)", the top band "min-max"; a band with a fractional edge keeps its exact edges ("min to below max"; the top band "min to max").
export function bandRange(band: Pick<LegendBand, "min" | "max">, isTop: boolean): string {
  if (isTop) return `${num(band.min)}-${num(band.max)}`;
  if (whole(band.min) && whole(band.max)) return `${band.min}-${band.max - 1}`;
  return `${num(band.min)} to below ${num(band.max)}`;
}

/// The bands highest first (the school's order), each with its printed range.
export function legendWithRanges(bands: readonly LegendBand[]): { letter: string; remark: string; range: string }[] {
  const sorted = [...bands].sort((a, b) => b.min - a.min || b.max - a.max);
  const topMax = Math.max(...sorted.map((b) => b.max));
  return sorted.map((b) => ({ letter: b.letter, remark: b.remark, range: bandRange(b, b.max === topMax) }));
}

/// The line a card prints: senior (and any layout that shows marks) "A1 (75-100) · B2 (70-74) ...", junior (names only, as its printed card does) "A Excellent · B Good ...".
export function legendLine(bands: readonly LegendBand[], style: "ranges" | "names"): string {
  const rows = legendWithRanges(bands);
  return rows.map((r) => (style === "ranges" ? `${r.letter} (${r.range})` : `${r.letter} ${r.remark}`)).join(" · ");
}
