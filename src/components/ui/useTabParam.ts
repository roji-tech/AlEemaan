"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pickTab, TAB_PARAM, withTab } from "./tab-param";

/// The open tab of a page, kept in the address as `?tab=` (task 0100). Returns the same pair as `useState`: the open tab, and a function that opens another. Choosing a tab rewrites the
/// address in place (history `replaceState`, which Next.js follows: no page reload, no round trip to the server, and the Back button leaves the page instead of stepping through every
/// tab visited). An address with no `tab`, or one this page does not have, opens `fallback`; that is also the tab a page opens on when it was linked to by the older `?section=`.
export function useTabParam<T extends string>(ids: readonly T[], fallback: T): [T, (id: T) => void] {
  const search = useSearchParams();
  const pathname = usePathname();
  const active = pickTab(search.get(TAB_PARAM), ids, fallback);
  const choose = useCallback(
    (id: T) => {
      window.history.replaceState(null, "", `${pathname}?${withTab(window.location.search, id)}`);
    },
    [pathname],
  );
  return [active, choose];
}
