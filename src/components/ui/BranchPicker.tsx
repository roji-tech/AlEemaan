"use client";

import { useId } from "react";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { POPOVER_ITEM, POPOVER_LIST, popoverSide, usePopover } from "./usePopover";
import { ALL_BRANCHES } from "./branch-selection";

/// Which branch a page is showing, as one slim bar (the maintainer, 2026-11-18: the full-width "Branch" field took too much of the screen, and then asked for exactly this):
///   BRANCH: Primary (English)                                      [ Switch branch v ]
/// The name is bold on the left; the button is at the far end. The list the button opens is our own (task 0100), not the browser's: the browser's list ignored the dark theme (pale grey
/// text on white), was narrower than its button, and opened over the page below. Ours is a popover in the page's colours under the button, as wide as its longest name, with a tick on the
/// branch you are on; Up and Down move through it, Enter picks, Escape closes (`usePopover`). The branches are buttons, the current one marked `aria-current`. With one branch there is
/// nothing to switch, so the bar is the name alone. `allOption` (task 0117) adds "All branches" first (the value `all`), for a page that lists across branches.
export function BranchPicker({
  branches,
  value,
  onChange,
  className = "",
  allOption = false,
}: {
  branches: readonly { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  allOption?: boolean;
}) {
  const listId = useId();
  const { open, setOpen, up, rootRef, buttonRef, listRef, focusButton, onListKeyDown } = usePopover();
  const choices = allOption && branches.length > 1 ? [{ id: ALL_BRANCHES, name: "All branches" }, ...branches] : branches;
  const current = choices.find((b) => b.id === value) ?? choices[0];
  if (!current) return null;
  return (
    <div className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-1.5 ${className}`}>
      <p className="min-w-0 text-sm">
        <span className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Branch:</span>{" "}
        <strong data-testid="current-branch" className="font-bold wrap-break-word text-fg">
          {current.name}
        </strong>
      </p>
      {choices.length > 1 && (
        <div ref={rootRef} className="relative shrink-0 has-[[aria-expanded=true]]:z-30">
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 text-sm font-semibold text-fg transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Switch branch
            <ChevronDownIcon aria-hidden="true" className={`h-4 w-4 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <ul ref={listRef} id={listId} aria-label="Branches" onKeyDown={onListKeyDown} className={`${POPOVER_LIST} ${popoverSide(up)}`}>
              {choices.map((b) => {
                const here = b.id === current.id;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      aria-current={here ? "true" : undefined}
                      onClick={() => {
                        setOpen(false);
                        focusButton();
                        if (!here) onChange(b.id);
                      }}
                      className={`${POPOVER_ITEM} justify-between ${here ? "font-semibold text-brand-fg" : ""}`}
                    >
                      <span className="min-w-0 wrap-break-word">{b.name}</span>
                      {here && <CheckIcon aria-hidden="true" className="h-4 w-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
