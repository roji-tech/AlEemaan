// The pure arithmetic of a report card (Slice P2c): a subject's percentage, a student's average, and positions in a class. No database, no floats that can drift:
// everything is an integer count of HUNDREDTHS of a percent (so 66.67% is 6667), converted to a number only at the edge.

export type Scored = { total: number; max: number };

/// A subject's percentage in hundredths of a percent: 65 out of 100 -> 6500; 7 out of 8 -> 8750. Rounds half up. `null` when the maximum is not positive.
export function percentHundredths(total: number, max: number): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((Math.round(total * 100) * 10000) / Math.round(max * 100));
}

/// The average percentage over the subjects given, in hundredths of a percent, or `null` for none. The mean of the SUBJECT PERCENTAGES (so a subject marked out of
/// 50 counts the same as one out of 100); rounded half up.
export function averageHundredths(subjects: readonly Scored[]): number | null {
  const parts = subjects.map((s) => percentHundredths(s.total, s.max));
  if (parts.length === 0 || parts.some((p) => p === null)) return null;
  return Math.round((parts as number[]).reduce((sum, p) => sum + p, 0) / parts.length);
}

/// Standard competition ranking ("1, 2, 2, 4"): a student's position is one more than the number of students with a STRICTLY higher average, so ties share a
/// position and the next one is skipped - the same numbers the legacy "count of strictly higher + 1" gave. `size` is how many students were ranked.
export function rankAverages<T extends { id: string; average: number }>(
  entries: readonly T[],
): Map<string, { position: number; size: number }> {
  const out = new Map<string, { position: number; size: number }>();
  for (const e of entries) out.set(e.id, { position: 1 + entries.filter((o) => o.average > e.average).length, size: entries.length });
  return out;
}

/// "Amina Yusuf" -> "Amina Y." - the only thing the public verification page says about a pupil.
export function publicName(firstName: string, lastName: string): string {
  const first = firstName.trim().split(/\s+/)[0] ?? "";
  const initial = Array.from(lastName.trim())[0]?.toUpperCase() ?? "";
  return initial ? `${first} ${initial}.` : first;
}
