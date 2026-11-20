// What a person has done with "Signs in here, not on the staff list yet" (task 0117, the maintainer, 2026-11-20: "I wanna be able to close the add to staff message completely or pend it
// for later"). Pure, so the rules are tested without a browser; `UnlistedMembers` keeps the value per branch in the browser.
//   - Close (x): hides the panel until somebody it did not list before appears (the ids it showed are remembered).
//   - Remind me later: hides it for seven days.
//   - Don't list: one person never appears in the panel (an administrator or a superadmin who should not be on the list); "Show hidden" brings them back.

export type Hidden = {
  /// The ids the panel listed when it was closed: it stays closed while every person it would list is among them.
  closedFor: string[];
  /// Hidden until this time (milliseconds since 1970), or null.
  snoozedUntil: number | null;
  /// People who are never listed.
  dontList: string[];
};

export const SNOOZE_DAYS = 7;
export const SNOOZE_MS = SNOOZE_DAYS * 24 * 60 * 60 * 1000;
export const NOTHING_HIDDEN: Hidden = { closedFor: [], snoozedUntil: null, dontList: [] };

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 500) : [];

/// What was stored, read defensively: anything that is not the expected shape is "nothing hidden".
export function parseHidden(raw: string | null): Hidden {
  if (!raw) return NOTHING_HIDDEN;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return NOTHING_HIDDEN;
    const v = value as Record<string, unknown>;
    return {
      closedFor: strings(v.closedFor),
      snoozedUntil: typeof v.snoozedUntil === "number" && Number.isFinite(v.snoozedUntil) ? v.snoozedUntil : null,
      dontList: strings(v.dontList),
    };
  } catch {
    return NOTHING_HIDDEN;
  }
}

export type Shown<T extends { userId: string }> = {
  /// The people the panel would list (everyone not marked "Don't list").
  candidates: T[];
  /// The people marked "Don't list".
  hidden: T[];
  /// True while the panel is closed or snoozed (a chip stands in for it).
  collapsed: boolean;
};

export function shown<T extends { userId: string }>(members: readonly T[], state: Hidden, now: number): Shown<T> {
  const never = new Set(state.dontList);
  const candidates = members.filter((m) => !never.has(m.userId));
  const hidden = members.filter((m) => never.has(m.userId));
  const snoozed = state.snoozedUntil !== null && state.snoozedUntil > now;
  const closed = state.closedFor.length > 0 && candidates.length > 0 && candidates.every((m) => state.closedFor.includes(m.userId));
  return { candidates, hidden, collapsed: candidates.length > 0 && (snoozed || closed) };
}

export const close = (state: Hidden, candidates: readonly { userId: string }[]): Hidden => ({
  ...state,
  closedFor: candidates.map((m) => m.userId),
  snoozedUntil: null,
});
export const snooze = (state: Hidden, now: number): Hidden => ({ ...state, closedFor: [], snoozedUntil: now + SNOOZE_MS });
export const reopen = (state: Hidden): Hidden => ({ ...state, closedFor: [], snoozedUntil: null });
export const dontList = (state: Hidden, userId: string): Hidden => ({
  ...state,
  dontList: state.dontList.includes(userId) ? state.dontList : [...state.dontList, userId],
});
export const listAgain = (state: Hidden, userId: string): Hidden => ({ ...state, dontList: state.dontList.filter((id) => id !== userId) });
