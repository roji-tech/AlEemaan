"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ClassesPanel } from "@/components/academics/ClassesPanel";
import { GradingPanel } from "@/components/academics/GradingPanel";
import { StaffPanel } from "@/components/academics/StaffPanel";
import { PromotionConsole } from "@/components/academics/promotion/PromotionConsole";
import type { BranchChoice } from "@/components/academics/common";

// The Academics page's sections behind one tab list (Slice P1 & P7). Only the active section is mounted. Left/Right/Home/End move between tabs, as the
// ARIA tabs pattern asks; Tab then goes into the panel. Presentation only - every list and button calls an API that decides who may do what.
const SECTIONS = [
  { id: "classes", label: "Classes and subjects" },
  { id: "grading", label: "Assessment and grading" },
  { id: "staff", label: "Staff" },
  { id: "promotion", label: "Promotion & rollover" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function AcademicsSections({ branches }: { branches: BranchChoice[] }) {
  const [active, setActive] = useState<SectionId>("classes");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = SECTIONS.findIndex((s) => s.id === active);
    const next =
      event.key === "ArrowRight"
        ? (at + 1) % SECTIONS.length
        : event.key === "ArrowLeft"
          ? (at - 1 + SECTIONS.length) % SECTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? SECTIONS.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(SECTIONS[next].id);
    refs.current[SECTIONS[next].id]?.focus();
  }

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Academics sections"
        onKeyDown={onKeyDown}
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`panel-${s.id}`}
            tabIndex={active === s.id ? 0 : -1}
            onClick={() => setActive(s.id)}
            className={`min-h-11 flex-1 border-b-2 px-2 text-center text-sm font-semibold sm:flex-none sm:px-4 sm:whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
              active === s.id ? "border-brand-strong text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === "classes" && <ClassesPanel branches={branches} />}
        {active === "grading" && <GradingPanel branches={branches} />}
        {active === "staff" && <StaffPanel branches={branches} />}
        {active === "promotion" && <PromotionConsole branches={branches} />}
      </div>
    </div>
  );
}
