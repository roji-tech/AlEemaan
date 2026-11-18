"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { pageAfterResize, parseChoice, SIZES, sizeAfterViewChange, storeChoice, type ViewChoice, type ViewMode } from "./collection-model";

// The remembered view (list or grid) and page size of one list (task 0089). It is a convenience of this browser, never data: kept in `localStorage` under a key per list, read through
// `useSyncExternalStore` so the server's render and the first client render agree (both show the list's default; the stored choice follows), and every failure of storage (blocked, full,
// private window) falls back to the default without a word.

const PREFIX = "aleemaan.view.";
const EVENT = "aleemaan:view";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // storage is unavailable: the choice lasts until the page is left
  }
  // Tell every list on this page that reads the same key (a second tab hears the browser's own `storage` event).
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}
function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/// The view and size of the list called `key`.
///
///   const { view, size, setView, setSize } = useCollectionView("classes", { defaultView: "grid", page, onPage: setPage });
///
/// Changing the view or the size keeps the first item the person was looking at on screen: it calls `onPage` with the page that holds it. `defaultSize` is the list's own usual size (it
/// must be one of `SIZES[view]`, otherwise the first is used).
export function useCollectionView(
  key: string,
  options: { defaultView: ViewMode; defaultSize?: number; page?: number; onPage?: (page: number) => void },
): ViewChoice & { setView: (view: ViewMode) => void; setSize: (size: number) => void; sizes: readonly number[] } {
  const { defaultView, defaultSize: preferred, page = 1, onPage } = options;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const choice = useMemo(() => parseChoice(raw, defaultView, preferred), [raw, defaultView, preferred]);

  const setView = useCallback(
    (view: ViewMode) => {
      if (view === choice.view) return;
      const size = sizeAfterViewChange(choice.view, choice.size, view);
      onPage?.(pageAfterResize(page, choice.size, size));
      write(key, storeChoice({ view, size }));
    },
    [choice, key, onPage, page],
  );
  const setSize = useCallback(
    (size: number) => {
      if (size === choice.size || !SIZES[choice.view].includes(size)) return;
      onPage?.(pageAfterResize(page, choice.size, size));
      write(key, storeChoice({ view: choice.view, size }));
    },
    [choice, key, onPage, page],
  );
  return { ...choice, setView, setSize, sizes: SIZES[choice.view] };
}
