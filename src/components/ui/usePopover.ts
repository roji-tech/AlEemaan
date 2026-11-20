"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useOutsideClick } from "./useOutsideClick";

/// What every dropdown of the app shares (task 0100): the three-dots menu of a row and the branch picker. Each draws its own button and its own list; this is the behaviour.
///   - one button opens and closes the list (`aria-expanded` on it says which);
///   - Escape closes it and puts focus back on the button; a press outside, or focus moving away from it (Tab past the last item), closes it;
///   - when the list opens, focus goes to the item marked `aria-current="true"` (the branch you are on), else the first enabled item;
///   - Up and Down move between the items (and wrap), Home and End go to the first and the last;
///   - the list opens under the button and, when there is not room below but more above, over it: a dropdown is never cut off by the bottom of the screen.
/// The items are ordinary buttons, in the tab order too. This is a disclosure, not an ARIA menu: nothing here promises the full menu keyboard model.
export function usePopover() {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  // The three elements are kept in refs of our own and handed out as callback refs (plain functions): React's lint rule for refs cannot tell a ref object returned from a hook from
  // one read during render, so a hook that returns ref objects makes every use of it an error.
  const root = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    root.current = node;
  }, []);
  const buttonRef = useCallback((node: HTMLButtonElement | null) => {
    button.current = node;
  }, []);
  const listRef = useCallback((node: HTMLUListElement | null) => {
    list.current = node;
  }, []);
  const focusButton = useCallback(() => button.current?.focus(), []);

  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);

  // A press, a touch or focus outside closes it (the shared rule, `useOutsideClick`, task 0117); Escape closes it and puts focus back on the button.
  useOutsideClick(root, () => setOpen(false), open, false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Before the first paint of an open list: which side has room, and where focus goes.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = button.current;
    const items = list.current;
    if (!trigger || !items) return;
    const rect = trigger.getBoundingClientRect();
    // The room below is what is left above the fixed bars at the bottom of the screen (the phone's navigation bar and the floating tools button, marked `data-fixed-bottom`): a list
    // drawn into them would have its last items under the bar (found at 850 px, 2026-11-18).
    const bars = [...document.querySelectorAll<HTMLElement>("[data-fixed-bottom]")]
      .filter((bar) => bar.getClientRects().length > 0) // a bar that is not displayed (the phone's navigation from `lg` up) has no place on the screen
      .map((bar) => bar.getBoundingClientRect().top);
    const floor = Math.min(window.innerHeight, ...bars) - 12;
    const below = floor - rect.bottom;
    setUp(below < items.offsetHeight + 12 && rect.top > below);
    (
      items.querySelector<HTMLElement>('[aria-current="true"]:not(:disabled)') ?? items.querySelector<HTMLElement>("button:not(:disabled)")
    )?.focus({ preventScroll: true }); // the scroll below decides where the list ends up, not the browser's own jump to the focused item
  }, [open]);

  // Once the side is known: bring the whole list into view, clear of the fixed bars (the phone's bottom navigation and the floating tools button are drawn over the page; the
  // list's `scroll-margin` in POPOVER_LIST keeps it above them). Without this a menu opened on a row near the bottom of a phone was half under the navigation bar.
  useLayoutEffect(() => {
    if (open) list.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open, up]);

  const onListKeyDown = useCallback((e: KeyboardEvent) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    items[next]?.focus();
  }, []);

  return { open, setOpen, up, rootRef, buttonRef, listRef, close, focusButton, onListKeyDown };
}

/// Where the list sits: right edge under (or over) the button, never wider than the screen, and tall enough to scroll rather than run off it.
export const POPOVER_LIST =
  "absolute right-0 z-30 scroll-mt-20 scroll-mb-40 max-h-[min(20rem,70vh)] w-max min-w-56 max-w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-menu";

export const popoverSide = (up: boolean): string => (up ? "bottom-full mb-1.5" : "top-full mt-1.5");

/// One row of a dropdown list: a full-width, 44 px tall button.
export const POPOVER_ITEM =
  "flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-fg-muted";
