"use client";

import { useEffect, useRef, type RefObject } from "react";

/// Closes a floating panel (a menu, a popover, a bubble, a date list) when the person presses or touches anywhere outside it, or moves focus away from it (task 0117, the maintainer,
/// 2026-11-20: "add a useoutsideclick or similar to most popups and dropdowns"). One place, so every panel behaves the same:
///   - `ref` is the element that holds BOTH the trigger and the panel; a press inside it is never "outside", so the trigger's own click still toggles the panel;
///   - pointer and touch both count (`pointerdown` covers mouse, pen and touch; `mousedown` and `touchstart` are kept for browsers that do not send pointer events);
///   - focus moving to something outside it (Tab past the last item) closes it;
///   - Escape closes it too, unless `escape` is false (a panel that already handles Escape and returns focus itself).
/// `onOutside` is read through a ref, so a new function every render does not re-attach the listeners; they exist only while `enabled`.
export function useOutsideClick(ref: RefObject<HTMLElement | null>, onOutside: () => void, enabled: boolean, escape = true): void {
  const latest = useRef(onOutside);
  useEffect(() => {
    latest.current = onOutside;
  });
  useEffect(() => {
    if (!enabled) return;
    const outside = (event: Event) => {
      const root = ref.current;
      if (root && !root.contains(event.target as Node)) latest.current();
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") latest.current();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside, { passive: true });
    document.addEventListener("focusin", outside);
    if (escape) document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("focusin", outside);
      if (escape) document.removeEventListener("keydown", key);
    };
  }, [ref, enabled, escape]);
}
