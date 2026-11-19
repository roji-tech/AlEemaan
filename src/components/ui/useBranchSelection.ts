"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BRANCH_MEMORY_KEY, BRANCH_PARAM, pickBranch, rememberable, withBranchParam } from "./branch-selection";

// The browser's memory of the last branch, read with `useSyncExternalStore`: the first paint matches the server's (no memory there), and the remembered branch is applied straight after.
// Every read and write is in try/catch: a private window, blocked site data or a full store just means nothing is remembered.
const listeners = new Set<() => void>();
const readMemory = (): string | null => {
  try {
    return window.localStorage.getItem(BRANCH_MEMORY_KEY);
  } catch {
    return null;
  }
};
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
};
const writeMemory = (id: string) => {
  try {
    window.localStorage.setItem(BRANCH_MEMORY_KEY, id);
  } catch {
    // nothing to remember it in; the address still carries the choice
  }
  listeners.forEach((notify) => notify());
};

/// The branch a page shows, as the same pair `useState` gives (task 0117). Order: what the person chose on this page, the address (`?branch=`), `initial` (a link's branch), the branch this
/// browser last used, then `fallback` (default: the first). Choosing a branch rewrites the address in place (`replaceState`, as `?tab=` does: no reload, Back leaves the page) and remembers
/// it. `allowAll` offers the reserved "all" (every branch the person may read): it lives in the address but is never the remembered branch, because other pages cannot show it.
export function useBranchSelection(
  branches: readonly { id: string }[],
  options: { initial?: string | null; allowAll?: boolean; fallback?: string } = {},
): [string, (id: string) => void] {
  const search = useSearchParams();
  const pathname = usePathname();
  const [chosen, setChosen] = useState<string | null>(null);
  const remembered = useSyncExternalStore(subscribe, readMemory, () => null);
  const ids = branches.map((b) => b.id);
  const value = pickBranch({
    ids,
    allowAll: options.allowAll,
    chosen,
    address: search.get(BRANCH_PARAM),
    initial: options.initial,
    remembered,
    fallback: options.fallback ?? ids[0] ?? "",
  });
  const choose = useCallback(
    (id: string) => {
      setChosen(id);
      window.history.replaceState(null, "", `${pathname}?${withBranchParam(window.location.search, id)}`);
      const keep = rememberable(id);
      if (keep) writeMemory(keep);
    },
    [pathname],
  );
  return [value, choose];
}
