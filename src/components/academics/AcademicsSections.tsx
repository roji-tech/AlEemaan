"use client";

import { useState } from "react";
import { ClassesPanel } from "@/components/academics/ClassesPanel";
import { GradingPanel } from "@/components/academics/GradingPanel";
import { SchemeLevelsPanel } from "@/components/academics/SchemeLevelsPanel";
import { StaffPanel } from "@/components/academics/StaffPanel";
import { PromotionConsole } from "@/components/academics/promotion/PromotionConsole";
import type { BranchChoice } from "@/components/academics/common";
import { Tabs, panelId, tabId } from "@/components/ui/Tabs";

// The Academics page's sections behind one tab list (Slice P1 & P7), drawn by the shared Tabs (task 0089: a margin above the strip, and a strip that scrolls sideways on a phone instead of
// squeezing five labels). Only the active section is mounted. Presentation only - every list and button calls an API that decides who may do what.
const SECTIONS = [
  { id: "classes", label: "Classes" },
  { id: "subjects", label: "Subjects" },
  { id: "grading", label: "Assessment and grading" },
  { id: "staff", label: "Staff" },
  { id: "promotion", label: "Promotion & rollover" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function AcademicsSections({ branches, isSuperAdmin = false }: { branches: BranchChoice[]; isSuperAdmin?: boolean }) {
  const [active, setActive] = useState<SectionId>("classes");
  // The branch of the Classes and Subjects tabs is one choice: switching between the two keeps it.
  const [branchId, setBranchId] = useState(branches[0].id);

  return (
    <div className="space-y-6">
      <Tabs label="Academics sections" prefix="academics" tabs={SECTIONS} active={active} onChange={setActive} />
      <div role="tabpanel" id={panelId("academics", active)} aria-labelledby={tabId("academics", active)}>
        {(active === "classes" || active === "subjects") && (
          <ClassesPanel key={active} branches={branches} view={active} branchId={branchId} onBranchChange={setBranchId} />
        )}
        {active === "grading" && (
          <div className="space-y-10">
            <GradingPanel branches={branches} />
            <SchemeLevelsPanel branches={branches} isSuperAdmin={isSuperAdmin} />
          </div>
        )}
        {active === "staff" && <StaffPanel branches={branches} />}
        {active === "promotion" && <PromotionConsole branches={branches} />}
      </div>
    </div>
  );
}
