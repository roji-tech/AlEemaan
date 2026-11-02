"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SelectField } from "@/components/ui/SelectField";
import { getJson } from "@/components/auth/postJson";
import { ForYouPanel } from "@/components/forms/ForYouPanel";
import { FormsList } from "@/components/forms/FormsList";

// The Forms page's sections behind one tab list, the same ARIA tabs pattern as the Question bank, Approvals and Results (Left/Right/Home/End move between tabs, only the active
// section is mounted). Presentation only - the forms APIs decide who may do what.

const SECTIONS = [
  { id: "practice", label: "Practice sets" },
  { id: "questionnaires", label: "Questionnaires" },
  { id: "paper", label: "Paper work" },
  { id: "foryou", label: "For you" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function FormsSections({ branches }: { branches: { id: string; name: string }[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [classGroups, setClassGroups] = useState<{ id: string; name: string }[]>([]);
  const [active, setActive] = useState<SectionId>("practice");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`/api/v1/academics/class-groups?branchId=${encodeURIComponent(branchId)}`, controller.signal);
      if (controller.signal.aborted) return;
      const rows = (reply.data?.classGroups ?? []) as { id: string; name: string }[];
      setClassGroups(reply.ok ? rows.map((g) => ({ id: g.id, name: g.name })) : []);
    })();
    return () => controller.abort();
  }, [branchId]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = SECTIONS.findIndex((s) => s.id === active);
    const n = SECTIONS.length;
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
    setActive(SECTIONS[next].id);
    refs.current[SECTIONS[next].id]?.focus();
  }

  if (!branchId)
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        You are not a member of staff in any branch yet.
      </p>
    );

  return (
    <div className="space-y-6">
      {branches.length > 1 && (
        <div className="max-w-xs">
          <SelectField
            label="Branch"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
      )}
      <div
        role="tablist"
        aria-label="Forms sections"
        onKeyDown={onKeyDown}
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1 print:hidden"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            type="button"
            role="tab"
            id={`ftab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`fpanel-${s.id}`}
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
      <div role="tabpanel" id={`fpanel-${active}`} aria-labelledby={`ftab-${active}`}>
        {active === "practice" && (
          <FormsList key={`${branchId}-practice`} kind="PRACTICE_SET" branchId={branchId} classGroups={classGroups} />
        )}
        {active === "questionnaires" && (
          <FormsList key={`${branchId}-questionnaires`} kind="QUESTIONNAIRE" branchId={branchId} classGroups={classGroups} />
        )}
        {active === "paper" && <FormsList key={`${branchId}-paper`} kind="PAPER_WORK" branchId={branchId} classGroups={classGroups} />}
        {active === "foryou" && <ForYouPanel key={`${branchId}-foryou`} branchId={branchId} />}
      </div>
    </div>
  );
}
