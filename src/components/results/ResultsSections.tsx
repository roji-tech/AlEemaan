"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { EntryPanel } from "@/components/results/EntryPanel";
import { ReviewPanel } from "@/components/results/ReviewPanel";
import { CardsPanel } from "@/components/results/CardsPanel";
import type { BranchChoice } from "@/components/academics/common";

// The Results page's sections behind one tab list (Slice P2d), the same ARIA tabs pattern as Academics: Left/Right/Home/End move between tabs, only the active
// section is mounted. Review is for administrators; a teacher sees Enter marks and Report cards. Presentation only - the results APIs decide who may do what.
export function ResultsSections({ branches, isAdmin }: { branches: BranchChoice[]; isAdmin: boolean }) {
  const sections = [
    { id: "enter", label: "Enter marks" },
    ...(isAdmin ? [{ id: "review", label: "Review" }] : []),
    { id: "cards", label: "Report cards" },
  ];
  const [active, setActive] = useState(sections[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = sections.findIndex((s) => s.id === active);
    const n = sections.length;
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
    setActive(sections[next].id);
    refs.current[sections[next].id]?.focus();
  }

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Results sections"
        onKeyDown={onKeyDown}
        className="-mx-1 flex gap-1 print:hidden overflow-x-auto border-b border-line px-1"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            type="button"
            role="tab"
            id={`rtab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`rpanel-${s.id}`}
            tabIndex={active === s.id ? 0 : -1}
            onClick={() => setActive(s.id)}
            className={`min-h-11 flex-1 border-b-2 px-2 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:flex-none sm:px-4 sm:whitespace-nowrap ${
              active === s.id ? "border-brand-strong text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`rpanel-${active}`} aria-labelledby={`rtab-${active}`}>
        {active === "enter" && <EntryPanel branches={branches} />}
        {active === "review" && <ReviewPanel branches={branches} />}
        {active === "cards" && <CardsPanel branches={branches} />}
      </div>
    </div>
  );
}
