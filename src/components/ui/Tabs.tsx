"use client";

import { useRef, type KeyboardEvent } from "react";

/// The tab list of a page: the ARIA tabs pattern (one tab in the tab order, Left/Right/Home/End move between them and select). Only the strip is drawn here; the owner renders the
/// panel of the active tab with `role="tabpanel"`, `id={panelId(prefix, active)}` and `aria-labelledby={tabId(prefix, active)}`, and mounts only that one.
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export function Tabs<T extends string>({
  label,
  prefix,
  tabs,
  active,
  onChange,
}: {
  label: string;
  /// Makes the element ids unique when a page has more than one tab strip.
  prefix: string;
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = tabs.findIndex((t) => t.id === active);
    const n = tabs.length;
    const next =
      event.key === "ArrowRight"
        ? (at + 1) % n
        : event.key === "ArrowLeft"
          ? (at - 1 + n) % n
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? n - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={tabId(prefix, t.id)}
          aria-selected={active === t.id}
          aria-controls={panelId(prefix, t.id)}
          tabIndex={active === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={`min-h-11 border-b-2 px-3 text-center text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
            active === t.id ? "border-brand-strong text-fg" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
