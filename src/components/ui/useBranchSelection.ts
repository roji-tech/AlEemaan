"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useBranchMemory } from "./BranchMemory";
import { BRANCH_PARAM, pickBranch, rememberable, withBranchParam } from "./branch-selection";

/// The branch a page shows, as the same pair `useState` gives (task 0117). Order: what the person chose on this page, the address (`?branch=`), `initial` (a link's branch), the branch this
/// person last used, then `fallback` (default: the first). Choosing a branch rewrites the address in place (`replaceState`, as `?tab=` does: no reload, Back leaves the page) and remembers
/// it. `allowAll` offers the reserved "all" (every branch the person may read): it lives in the address but is never the remembered branch, because other pages cannot show it.
export function useBranchSelection(
  branches: readonly { id: string }[],
  options: { initial?: string | null; allowAll?: boolean; allowUnplaced?: boolean; fallback?: string } = {},
): [string, (id: string) => void] {
  const search = useSearchParams();
  const pathname = usePathname();
  const [chosen, setChosen] = useState<string | null>(null);
  const memory = useBranchMemory();
  const remembered = memory.value;
  const ids = branches.map((b) => b.id);
  const value = pickBranch({
    ids,
    allowAll: options.allowAll,
    allowUnplaced: options.allowUnplaced,
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
      if (keep) memory.remember(keep);
    },
    [pathname, memory],
  );
  return [value, choose];
}
