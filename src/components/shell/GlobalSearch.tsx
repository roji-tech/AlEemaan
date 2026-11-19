"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRightIcon, SearchIcon, XIcon } from "@/components/ui/icons";
import { TONE, type Tone } from "@/components/ui/tone";
import { DESTINATIONS, type Destination } from "@/lib/search/destinations";
import { highlight, search } from "@/lib/search/match";
import { visibleDestinations, type Viewer } from "@/lib/search/visible";
import type { RecordHit } from "@/lib/search/records";
import { getJson } from "@/components/auth/postJson";
import { FOCUS_RING } from "./nav";

// Search the whole app from the top bar (task 0107). The controls are named "Find a page or setting", not "Search…": every list on a page has its own field labelled "Search", and a screen reader (or a test that looks a field up by that word) must not meet two of them; the placeholder still says "Search". A field from `lg` up, a magnifier button on a phone that opens a full-screen sheet; the same box in both. It finds pages, tabs, settings
// and the questions people ask, each with where it lives (its trail), a line about what is there and, for the one you are on, the steps to get exactly there. Choosing one goes to its page
// AND its tab. Everything is on the device: the index is a list in the code, filtered to what this person can open, so there is no request per keystroke and nothing typed leaves the browser.
// An ARIA combobox: the field keeps the focus, Up and Down move through the options (`aria-activedescendant`), Enter chooses, Escape closes.

const GROUPS: { group: Destination["group"]; label: string; chip: string; tone: Tone }[] = [
  { group: "page", label: "Pages and tabs", chip: "Page", tone: "neutral" },
  { group: "setting", label: "Settings", chip: "Setting", tone: "brand" },
  { group: "task", label: "How do I…", chip: "How to", tone: "ok" },
];
const PER_GROUP = 8;
const RECENT_KEY = "aleemaan.search.recent";
const RECENT_MAX = 5;

/// The last destinations this person chose, on this device: only ids (never what was typed).
function readRecent(): string[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function remember(id: string) {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage is full or blocked: the recent list is a courtesy
  }
}

/// A row is a destination of the index, or a record found by the server (task 0113).
type Row = { id: string; destination: Destination; record?: undefined } | { id: string; record: RecordHit; destination?: undefined };
type Section = { key: string; label: string; rows: Row[] };

// Records (task 0113): asked of the server once the typing pauses, shown AFTER the pages and settings so a result that arrives late never moves the one already chosen.
const RECORD_GROUPS: { kind: RecordHit["kind"]; label: string; chip: string }[] = [
  { kind: "pupil", label: "Pupils", chip: "Pupil" },
  { kind: "staff", label: "Staff", chip: "Staff" },
  { kind: "class", label: "Classes", chip: "Class" },
  { kind: "subject", label: "Subjects", chip: "Subject" },
  { kind: "invoice", label: "Invoices", chip: "Invoice" },
  { kind: "user", label: "People with an account", chip: "Account" },
];
const RECORD_WAIT_MS = 250;

/// The server's records for a query, after a pause in the typing; nothing for a query under two characters or for someone who is not staff.
function useRecords(query: string, enabled: boolean): RecordHit[] {
  const [hits, setHits] = useState<{ q: string; rows: RecordHit[] }>({ q: "", rows: [] });
  const q = query.trim();
  useEffect(() => {
    if (!enabled || q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void getJson(`/api/v1/search?q=${encodeURIComponent(q.slice(0, 64))}`, controller.signal).then((reply) => {
        if (!controller.signal.aborted && reply.ok) setHits({ q, rows: reply.data!.results as RecordHit[] });
      });
    }, RECORD_WAIT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, enabled]);
  return enabled && q.length >= 2 && hits.q === q ? hits.rows : [];
}

function recordSections(records: readonly RecordHit[]): Section[] {
  return RECORD_GROUPS.flatMap((g) => {
    const rows = records.filter((r) => r.kind === g.kind).map((r): Row => ({ id: `record-${r.kind}-${r.id}`, record: r }));
    return rows.length === 0 ? [] : [{ key: `record-${g.kind}`, label: g.label, rows }];
  });
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
const isWide = () => window.matchMedia("(min-width: 1024px)").matches;

/// The sections to show for a query. An empty query shows the recent destinations and a few common questions.
function sectionsFor(query: string, visible: readonly Destination[], recent: readonly string[]): Section[] {
  const byId = new Map(visible.map((d) => [d.id, d]));
  const row = (d: Destination, prefix: string): Row => ({ destination: d, id: `${prefix}-${d.id}` });
  if (query.trim() === "") {
    const recents = recent.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const common = visible.filter((d) => d.group === "task" && !recents.includes(d)).slice(0, 5);
    return [
      ...(recents.length > 0 ? [{ key: "recent", label: "Recent", rows: recents.map((d) => row(d, "recent")) }] : []),
      ...(common.length > 0 ? [{ key: "common", label: "Common questions", rows: common.map((d) => row(d, "common")) }] : []),
    ];
  }
  return GROUPS.flatMap((g) => {
    const found = search(
      query,
      visible.filter((d) => d.group === g.group),
    );
    return found.length === 0 ? [] : [{ key: g.group, label: g.label, rows: found.slice(0, PER_GROUP).map((d) => row(d, g.group)) }];
  });
}

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((piece, i) =>
        piece.match ? (
          <mark key={i} className="rounded-sm bg-transparent font-bold text-brand-fg underline decoration-brand-fg/50 underline-offset-2">
            {piece.text}
          </mark>
        ) : (
          <span key={i}>{piece.text}</span>
        ),
      )}
    </>
  );
}

/// The combobox itself: the input, and the list under it. `onDone` is called after a choice (to close a popover or a sheet). In a `popover` the list is a panel under the field and is drawn
/// only while `listOpen`; in the sheet it is part of the page. The input is always the same element, so the focus is never lost when the panel opens.
function SearchBox({
  viewer,
  onDone,
  autoFocus = false,
  inputRef,
  popover = false,
  listOpen = true,
}: {
  viewer: Viewer;
  onDone: () => void;
  autoFocus?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
  popover?: boolean;
  listOpen?: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  // About seventy small entries: filtering and searching them on every keystroke costs nothing, so there is nothing to memoise.
  const visible = visibleDestinations(viewer, DESTINATIONS);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the device's own storage is exactly what this effect is for
    setRecent(readRecent());
  }, []);
  const records = useRecords(query, viewer.isStaff || viewer.isAdmin);
  const sections = [...sectionsFor(query, visible, recent), ...recordSections(records)];
  const rows = sections.flatMap((s) => s.rows);
  const current = rows[Math.min(active, Math.max(rows.length - 1, 0))];

  const choose = useCallback(
    (row: Row) => {
      // Only destinations are remembered on the device; a record never is (its name stays off the device).
      if (row.destination) remember(row.destination.id);
      onDone();
      router.push(row.destination ? row.destination.href : row.record.href);
    },
    [onDone, router],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && rows.length > 0) {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp" && rows.length > 0) {
      e.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Home" && rows.length > 0 && query === "") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "Enter" && current) {
      e.preventDefault();
      choose(current);
    } else if (e.key === "Escape") {
      if (query !== "") {
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
        setActive(0);
      }
    }
  };

  const optionId = (row: Row) => `${listId}-${row.id}`;
  return (
    <div className="relative">
      <div className="relative">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && current ? optionId(current) : undefined}
          aria-label="Find a page or setting"
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          placeholder="Search pages, pupils, staff, invoices…"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className={`min-h-11 w-full rounded-xl border border-line-strong bg-surface-2 py-2 ${popover ? "pr-10" : "pr-4"} pl-10 text-sm text-fg placeholder:text-fg-muted ${FOCUS_RING}`}
        />
        {popover && !listOpen && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 text-[11px] font-semibold text-fg-muted"
          >
            /
          </kbd>
        )}
      </div>
      {listOpen && (
        <div className={popover ? "absolute inset-x-0 top-full z-40 mt-2 rounded-2xl border border-line bg-surface p-2 shadow-menu" : ""}>
          <p role="status" className="sr-only">
            {query.trim() === "" ? "" : rows.length === 0 ? "No results" : `${rows.length} ${rows.length === 1 ? "result" : "results"}`}
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label="Search results"
            className="mt-2 max-h-[min(28rem,60vh)] overflow-y-auto overscroll-contain"
          >
            {rows.length === 0 && query.trim() !== "" && (
              <p className="px-3 py-6 text-center text-sm text-fg-muted">
                Nothing found for <strong className="font-semibold text-fg">“{query.trim()}”</strong>. Try another word, such as fees, term,
                password or pupil.
              </p>
            )}
            {sections.map((section) => (
              <div key={section.key} role="group" aria-label={section.label}>
                <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">{section.label}</p>
                <ul role="presentation">
                  {section.rows.map((row) => {
                    const isActive = current?.id === row.id;
                    if (row.record) {
                      const r = row.record;
                      const chip = RECORD_GROUPS.find((g) => g.kind === r.kind)!.chip;
                      return (
                        <li
                          key={row.id}
                          id={optionId(row)}
                          role="option"
                          aria-selected={isActive}
                          onMouseMove={() => {
                            const at = rows.findIndex((x) => x.id === row.id);
                            if (at >= 0 && at !== active) setActive(at);
                          }}
                          onMouseDown={(e) => e.preventDefault() /* keep the focus in the field */}
                          onClick={() => choose(row)}
                          className={`min-h-11 cursor-pointer rounded-xl px-3 py-2.5 ${isActive ? "bg-surface-2 ring-1 ring-line-strong ring-inset" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold wrap-break-word text-fg">
                                <Marked text={r.title} query={query} />
                              </p>
                              <p className="mt-0.5 text-xs wrap-break-word text-fg-muted">{r.line}</p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE.info.chip}`}>
                              {chip}
                            </span>
                          </div>
                        </li>
                      );
                    }
                    const d = row.destination;
                    const look = GROUPS.find((g) => g.group === d.group)!;
                    return (
                      <li
                        key={row.id}
                        id={optionId(row)}
                        role="option"
                        aria-selected={isActive}
                        onMouseMove={() => {
                          const at = rows.findIndex((r) => r.id === row.id);
                          if (at >= 0 && at !== active) setActive(at);
                        }}
                        onMouseDown={(e) => e.preventDefault() /* keep the focus in the field */}
                        onClick={() => choose(row)}
                        className={`min-h-11 cursor-pointer rounded-xl px-3 py-2.5 ${isActive ? "bg-surface-2 ring-1 ring-line-strong ring-inset" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold wrap-break-word text-fg">
                              <Marked text={d.title} query={query} />
                            </p>
                            <p className="mt-0.5 text-xs wrap-break-word text-fg-muted">{d.trail.join(" › ")}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[look.tone].chip}`}>
                            {look.chip}
                          </span>
                        </div>
                        <p className="mt-1 text-xs wrap-break-word text-fg-2">{d.summary}</p>
                        {isActive && d.steps && d.steps.length > 0 && (
                          <div className={`mt-2 rounded-lg border px-3 py-2 ${TONE.info.chip}`}>
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
                              <CornerDownRightIcon aria-hidden="true" className="h-3.5 w-3.5" />
                              How to get there
                            </p>
                            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs">
                              {d.steps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/// The field in the top bar, from `lg` up. Opens a results panel under it while it has the focus; `/` focuses it from anywhere that is not a text field.
export function GlobalSearchField({ viewer }: { viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputEl = useRef<HTMLInputElement | null>(null);
  const setInput = useCallback((el: HTMLInputElement | null) => {
    inputEl.current = el;
  }, []);
  const done = useCallback(() => {
    setOpen(false);
    inputEl.current?.blur();
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const slash = e.key === "/" && !e.altKey && (!isTyping(e.target) || e.ctrlKey || e.metaKey);
      if (!slash || !isWide()) return;
      e.preventDefault();
      setOpen(true);
      inputEl.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: globalThis.KeyboardEvent) => {
      // The box clears a typed query on the first Escape; this closes the panel on the one after.
      if (e.key === "Escape" && !e.defaultPrevented && inputEl.current?.value === "") done();
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("focusin", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("focusin", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, done]);

  return (
    <div ref={rootRef} className="relative hidden w-full max-w-md lg:block" onFocus={() => setOpen(true)} onClick={() => setOpen(true)}>
      <SearchBox viewer={viewer} onDone={done} inputRef={setInput} popover listOpen={open} />
    </div>
  );
}

/// The magnifier button of a phone's top bar; opens the same box in a full-screen sheet (a native dialog, as the More sheet is).
export function GlobalSearchButton({ viewer }: { viewer: Viewer }) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => dialog.current?.close(), []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.altKey || isWide() || (isTyping(e.target) && !(e.ctrlKey || e.metaKey))) return;
      e.preventDefault();
      dialog.current?.showModal();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Find a page or setting"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        className={`flex h-11 w-11 items-center justify-center rounded-xl border border-line text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg lg:hidden ${FOCUS_RING}`}
      >
        <SearchIcon className="h-5 w-5" />
      </button>
      <dialog
        ref={dialog}
        aria-label="Find a page or setting"
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-canvas p-0 text-fg open:flex open:flex-col lg:hidden"
      >
        {open && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-fg">Search</h2>
              <button
                type="button"
                onClick={close}
                className={`flex h-11 w-11 items-center justify-center rounded-xl text-fg-2 hover:bg-surface-2 hover:text-fg ${FOCUS_RING}`}
              >
                <XIcon className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SearchBox viewer={viewer} onDone={close} autoFocus />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
