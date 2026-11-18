"use client";

import { GridIcon, ListIcon } from "./icons";
import type { ViewMode } from "./collection-model";

/// List / Grid, two buttons in one group (task 0089). `aria-pressed` says which is on; the words show from `sm`, the icons always (a 44 px target on a phone). Put it in the toolbar
/// of a list with `useCollectionView`.
export function ViewToggle({ view, onChange, label = "View" }: { view: ViewMode; onChange: (view: ViewMode) => void; label?: string }) {
  const options = [
    { id: "list", text: "List", Icon: ListIcon },
    { id: "grid", text: "Grid", Icon: GridIcon },
  ] as const;
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-xl border border-line-strong bg-surface p-0.5">
      {options.map(({ id, text, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          aria-label={`${text} view`}
          onClick={() => onChange(id)}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            view === id ? "bg-brand-strong text-white" : "text-fg-2 hover:bg-surface-2"
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">{text}</span>
        </button>
      ))}
    </div>
  );
}
