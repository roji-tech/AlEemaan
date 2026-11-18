"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/// The tab list of a page: the ARIA tabs pattern (one tab in the tab order, Left/Right/Home/End move between them and select). Only the strip is drawn here; the owner renders the
/// panel of the active tab with `role="tabpanel"`, `id={panelId(prefix, active)}` and `aria-labelledby={tabId(prefix, active)}`, and mounts only that one.
///
/// Task 0089: there is a margin above the strip (it used to touch the text above it). A label never wraps: when the tabs do not fit (a phone) the strip scrolls sideways, snaps to a
/// tab, fades at the edge that has more, and brings the chosen tab into view; where they fit they sit in one row. Every tab is at least 44 px high.
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export function Tabs<T extends string>({
  label,
  prefix,
  tabs,
  active,
  onChange,
  className = "mt-5",
}: {
  label: string;
  /// Makes the element ids unique when a page has more than one tab strip.
  prefix: string;
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  /// Spacing around the strip; the default is the margin above it.
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ before: false, after: false });

  // Which edges have more tabs beyond them (for the fades). The observer reports once when it starts, so no state is set while rendering.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => setMore({ before: el.scrollLeft > 2, after: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [tabs.length]);

  // Bring the chosen tab into view inside the strip, without scrolling the page.
  useEffect(() => {
    const el = strip.current;
    const tab = refs.current[active];
    if (!el || !tab) return;
    if (tab.offsetLeft >= el.scrollLeft && tab.offsetLeft + tab.offsetWidth <= el.scrollLeft + el.clientWidth) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: Math.max(0, tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2), behavior: calm ? "auto" : "smooth" });
  }, [active]);

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
    <div className={`relative ${className}`}>
      <div
        ref={strip}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="relative flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain border-b border-line [scrollbar-width:none] sm:snap-none [&::-webkit-scrollbar]:hidden"
      >
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
            className={`min-h-11 shrink-0 snap-start border-b-2 px-4 text-center text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
              active === t.id ? "border-brand-strong text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-canvas to-transparent transition-opacity ${more.before ? "opacity-100" : "opacity-0"}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-canvas to-transparent transition-opacity ${more.after ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
