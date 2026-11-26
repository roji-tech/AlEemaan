"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";

/// A page section whose body can be folded away (task 0129). The heading holds one real button (`aria-expanded`, `aria-controls`), so the screen-reader name of the heading is still the title, Enter
/// and Space work as they do on any button, and the folded body is `hidden`: out of the tab order and the accessibility tree, not just out of sight. Everything inside stays mounted, so what the
/// section loads and what it has typed is not lost by folding it. The section's own actions (the "New ..." buttons) sit beside the heading and show only while it is open.
/// Open by default. A person's choice is remembered in this browser under `collapse:<id>` (a per-viewer convenience: it works without storage, and nothing depends on it); `id` must be stable.
/// Dialogs belong OUTSIDE the body: a dialog inside a hidden element cannot be shown.
const KEY = (id: string) => `collapse:${id}`;

function remembered(id: string): boolean | null {
  try {
    const value = window.localStorage.getItem(KEY(id));
    return value === "closed" ? false : value === "open" ? true : null;
  } catch {
    return null; // storage blocked or unavailable: stay open
  }
}
function remember(id: string, open: boolean) {
  try {
    window.localStorage.setItem(KEY(id), open ? "open" : "closed");
  } catch {
    /* nothing depends on it */
  }
}

export function CollapsibleSection({
  id,
  title,
  info,
  actions,
  children,
  bodyClassName = "",
  className = "",
}: {
  id: string;
  title: string;
  /// Shown beside the title, always (an InfoTip).
  info?: ReactNode;
  /// Shown beside the title while the section is open.
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  const uid = useId();
  const [open, setOpen] = useState(true); // the server and the first render agree: open; a remembered fold is applied right after
  useEffect(() => {
    const saved = remembered(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a per-browser preference after hydration is what this effect is for
    if (saved === false) setOpen(false);
  }, [id]);

  const toggle = () => {
    remember(id, !open);
    setOpen(!open);
  };
  const headingId = `${uid}-heading`;
  const bodyId = `${uid}-body`;

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id={headingId} className="text-lg font-semibold tracking-tight text-fg">
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={bodyId}
              className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ChevronDownIcon
                aria-hidden="true"
                className={`h-5 w-5 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}
              />
              {title}
            </button>
          </h2>
          {info}
        </div>
        {open && actions}
      </div>
      <div id={bodyId} hidden={!open} className={bodyClassName}>
        {children}
      </div>
    </section>
  );
}
