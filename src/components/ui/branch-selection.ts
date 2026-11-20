// Which branch a page shows, decided in one place (task 0117, the maintainer, 2026-11-20: "if I go to another page and come back, it resets to the first item on the dropdown, maybe we can
// use something like query param"). Pure, so the rules are tested without a browser; `useBranchSelection` is the React side.

/// The address parameter that names the branch, and the reserved value for "every branch the person may read" (offered only where a page lists across branches).
export const BRANCH_PARAM = "branch";
export const ALL_BRANCHES = "all";
/// The reserved value for staff records that are not placed in a branch yet (task 0101 D3): offered only to a superadmin, only where a page lists staff, never remembered.
export const UNPLACED = "unplaced";
/// Where the browser remembers the last branch the person chose (one value for the whole app: the branches are the same on every page).
export const BRANCH_MEMORY_KEY = "aleemaan:branch";

type Choices = {
  /// The branch ids this page may show (what the page was given), in its own order.
  ids: readonly string[];
  /// Where "All branches" is offered.
  allowAll?: boolean;
  /// Where "Not placed in a branch" is offered (a superadmin's staff list).
  allowUnplaced?: boolean;
  /// What the person chose on this page since it opened.
  chosen?: string | null;
  /// The branch named in the address.
  address?: string | null;
  /// A link's branch handed to the page by the server (the same `?branch=`, or a deep link from search).
  initial?: string | null;
  /// What this browser last used.
  remembered?: string | null;
  /// The branch to use when nothing above is usable (the first, or the person's own).
  fallback: string;
};

/// The first usable of: what was chosen here, the address, the link's branch, the remembered branch, the fallback. A value is usable when it is one of `ids`, or `all` where `allowAll`.
/// An id the person does not have (an old link, another account's memory) is skipped, never trusted.
export function pickBranch({
  ids,
  allowAll = false,
  allowUnplaced = false,
  chosen,
  address,
  initial,
  remembered,
  fallback,
}: Choices): string {
  const usable = (id: string | null | undefined): id is string =>
    !!id && (ids.includes(id) || (allowAll && id === ALL_BRANCHES) || (allowUnplaced && id === UNPLACED));
  // The remembered branch is always a real one (`all` is never stored), so it is checked against the ids only.
  const memory = remembered && ids.includes(remembered) ? remembered : null;
  for (const candidate of [chosen, address, initial, memory]) if (usable(candidate)) return candidate;
  return fallback;
}

/// The address with `branch` set to `id`; every other parameter stays (a tab, a filter), and the one-shot ones of a link are left to the page.
export function withBranchParam(search: string, id: string): string {
  const next = new URLSearchParams(search);
  next.set(BRANCH_PARAM, id);
  return next.toString();
}

/// What to store as "the last branch used": a real branch, never the reserved `all`.
export const rememberable = (id: string): string | null => (id === ALL_BRANCHES || id === UNPLACED ? null : id);
