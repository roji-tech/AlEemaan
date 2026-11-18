/// The `tab` query parameter (task 0100): the address of a page says which of its tabs is open, so a reload, a bookmark, the Back button and a link sent to a colleague all land on the
/// same tab. Pure, so it can be tested without a browser; `useTabParam` is the React side.
export const TAB_PARAM = "tab";

/// The tab the address names, when this page has such a tab; else the fallback. A value nobody knows (an old link, a typo, someone's guess) is never trusted: it opens the fallback.
export function pickTab<T extends string>(raw: string | null | undefined, ids: readonly T[], fallback: T): T {
  return raw !== null && raw !== undefined && (ids as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/// The query string (without the "?") for choosing `id`: every other parameter is kept (a branch, a filter), `tab` is set, and the one-shot parameters of a link from the Overview are
/// dropped, so reloading the new tab does not open its "New ..." form again. The older `section` name of the Academics links goes too: `tab` is the one name now.
export function withTab(search: string, id: string, param: string = TAB_PARAM): string {
  const next = new URLSearchParams(search);
  next.set(param, id);
  next.delete("new");
  next.delete("section");
  return next.toString();
}
