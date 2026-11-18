"use client";

import { useId, type ReactNode } from "react";
import { MoreIcon } from "./icons";
import { POPOVER_ITEM, POPOVER_LIST, popoverSide, usePopover } from "./usePopover";

export type MenuAction = {
  id: string;
  /// What is drawn.
  label: ReactNode;
  /// The full accessible name ("Deactivate Tola Teacher"), when the label alone is not enough to tell which row it belongs to.
  ariaLabel?: string;
  onSelect: () => void;
  disabled?: boolean;
  /// Draws the item in the danger colour and sets it apart from the others (Archive, Remove, Revoke).
  danger?: boolean;
};

/// The three-dots button of a row, and the list of what can be done to it (task 0100). An icon-only button, 44 px square, named "Actions for <name>" and saying whether the list is open
/// (`aria-expanded`). The list is a popover under the button, right edge to right edge, at every screen size (over it when there is no room below); behaviour is in `usePopover`.
/// While it is open the whole menu is raised above everything after it (`z-30`), so the buttons of the rows below can never be drawn over it (the bug of 2026-11-18: the next row's own
/// buttons were stacked above the open list). Choosing an item closes the list and hands focus back to the button first, so a dialog the item opens returns focus to it. Nothing is
/// drawn when there are no actions.
export function ActionsMenu({ name, actions }: { name: string; actions: readonly MenuAction[] }) {
  const { open, setOpen, up, rootRef, buttonRef, listRef, focusButton, onListKeyDown } = usePopover();
  const listId = useId();
  if (actions.length === 0) return null;
  return (
    <div ref={rootRef} className="relative has-[[aria-expanded=true]]:z-30">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Actions for ${name}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-expanded:bg-surface-2 aria-expanded:text-fg"
      >
        <MoreIcon aria-hidden="true" className="h-5 w-5" />
      </button>
      {open && (
        <ul ref={listRef} id={listId} onKeyDown={onListKeyDown} className={`${POPOVER_LIST} ${popoverSide(up)}`}>
          {actions.map((a, index) => (
            <li key={a.id} className={a.danger && index > 0 ? "mt-1 border-t border-line pt-1" : undefined}>
              <button
                type="button"
                aria-label={a.ariaLabel}
                disabled={a.disabled}
                onClick={() => {
                  setOpen(false);
                  focusButton(); // the list is about to close: a dialog this opens hands focus back to the three-dots button, not to nothing
                  a.onSelect();
                }}
                className={`${POPOVER_ITEM} ${a.danger ? "text-danger-fg" : ""}`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
