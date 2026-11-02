"use client";

import { useState } from "react";
import { SelectField } from "@/components/ui/SelectField";
import { ForYouPanel } from "@/components/forms/ForYouPanel";
import { FormsList } from "@/components/forms/FormsList";
import { SectionTabs } from "@/components/forms/SectionTabs";
import { useClassGroups } from "@/components/forms/useClassGroups";

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
  const classGroups = useClassGroups(branchId);
  const [active, setActive] = useState<SectionId>("practice");

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
      <SectionTabs label="Forms sections" idPrefix="f" sections={SECTIONS} active={active} onChange={setActive}>
        {active === "practice" && (
          <FormsList key={`${branchId}-practice`} kind="PRACTICE_SET" branchId={branchId} classGroups={classGroups} />
        )}
        {active === "questionnaires" && (
          <FormsList key={`${branchId}-questionnaires`} kind="QUESTIONNAIRE" branchId={branchId} classGroups={classGroups} />
        )}
        {active === "paper" && <FormsList key={`${branchId}-paper`} kind="PAPER_WORK" branchId={branchId} classGroups={classGroups} />}
        {active === "foryou" && <ForYouPanel key={`${branchId}-foryou`} branchId={branchId} />}
      </SectionTabs>
    </div>
  );
}
