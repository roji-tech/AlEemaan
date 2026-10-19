"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { BranchChoice } from "@/components/academics/common";
import { RequestsPanel } from "@/components/approvals/RequestsPanel";
import { LayoutPanel } from "@/components/approvals/LayoutPanel";
import { VerificationPanel } from "@/components/approvals/VerificationPanel";
import { SelfApprovalPanel } from "@/components/approvals/SelfApprovalPanel";

// The Approvals page's sections behind one tab list: the same ARIA tabs pattern as Academics and Results (Left/Right/Home/End move between tabs, only the active
// section is mounted). Presentation only - the settings APIs decide who may do what.
export function ApprovalsSections({ branches, isSuperAdmin }: { branches: BranchChoice[]; isSuperAdmin: boolean }) {
  const sections = [
    { id: "requests", label: "Requests" },
    { id: "layout", label: "Report cards" },
    { id: "verification", label: "Verification page" },
    ...(isSuperAdmin ? [{ id: "self", label: "Self-approval" }] : []),
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
        aria-label="Approvals sections"
        onKeyDown={onKeyDown}
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1 print:hidden"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            type="button"
            role="tab"
            id={`atab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`apanel-${s.id}`}
            tabIndex={active === s.id ? 0 : -1}
            onClick={() => setActive(s.id)}
            className={`min-h-11 flex-1 border-b-2 px-2 text-center text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
              active === s.id ? "border-brand-strong text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`apanel-${active}`} aria-labelledby={`atab-${active}`}>
        {active === "requests" && <RequestsPanel branches={branches} />}
        {active === "layout" && <LayoutPanel branches={branches} isSuperAdmin={isSuperAdmin} />}
        {active === "verification" && <VerificationPanel branches={branches} isSuperAdmin={isSuperAdmin} />}
        {active === "self" && <SelfApprovalPanel branches={branches} />}
      </div>
    </div>
  );
}
