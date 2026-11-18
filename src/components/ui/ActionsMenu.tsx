"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button";
import { ChevronDownIcon } from "./icons";

export type MenuAction = {
  id: string;
  /// What is drawn.
  label: string;
  /// The full accessible name ("Deactivate Tola Teacher"), when the label alone is not enough to tell which row it belongs to.
  ariaLabel?: string;
  onSelect: () => void;
  disabled?: boolean;
};

/// One button that opens and closes the list of things that can be done to a row. A disclosure, not an ARIA menu: the items are ordinary buttons in the tab order, the button says
/// whether the list is open (`aria-expanded`), Escape closes it and puts focus back on the button, a press outside or choosing an item closes it. On a phone the list opens in the
/// row under the button; from `md` it is a popover under the button. Nothing is drawn when there are no actions.
export function ActionsMenu({ name, actions }: { name: string; actions: readonly MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPress = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPress);
    };
  }, [open]);

  if (actions.length === 0) return null;
  return (
    <div ref={root} className="relative">
      <Button
        ref={button}
        variant="secondary"
        className="w-full md:w-auto"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Actions for ${name}`}
        onClick={() => setOpen((v) => !v)}
      >
        Actions
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <ul
          id={listId}
          className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface md:absolute md:right-0 md:z-20 md:mt-1 md:w-56 md:shadow-menu"
        >
          {actions.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-label={a.ariaLabel}
                disabled={a.disabled}
                onClick={() => {
                  setOpen(false);
                  button.current?.focus(); // the list is about to close: a dialog this opens hands focus back to the Actions button, not to nothing
                  a.onSelect();
                }}
                className="flex min-h-11 w-full items-center px-4 text-left text-sm font-medium text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-fg-muted"
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
