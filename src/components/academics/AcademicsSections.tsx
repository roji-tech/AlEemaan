"use client";

import { useCallback, useState } from "react";
import { useTabParam } from "@/components/ui/useTabParam";
import { ClassesPanel } from "@/components/academics/ClassesPanel";
import { GradingPanel } from "@/components/academics/GradingPanel";
import { SchemeLevelsPanel } from "@/components/academics/SchemeLevelsPanel";
import { SessionsPanel } from "@/components/academics/SessionsPanel";
import { StaffPanel } from "@/components/academics/StaffPanel";
import { PromotionConsole } from "@/components/academics/promotion/PromotionConsole";
import type { BranchChoice } from "@/components/academics/common";
import { Tabs, panelId, tabId } from "@/components/ui/Tabs";
import { SECTIONS, type SectionId } from "./sections";

// The Academics page's sections behind one tab list (Slice P1 & P7), drawn by the shared Tabs (task 0089: a margin above the strip, and a strip that scrolls sideways on a phone instead of
// squeezing five labels). Only the active section is mounted. Presentation only - every list and button calls an API that decides who may do what.
export function AcademicsSections({
  branches,
  isSuperAdmin = false,
  initialSection = "classes",
  initialBranchId,
  openNew = false,
}: {
  branches: BranchChoice[];
  isSuperAdmin?: boolean;
  /// Which tab opens first (a link from the Overview, or /academics/sessions).
  initialSection?: SectionId;
  initialBranchId?: string;
  /// Open the "new" form of the first tab at once (a shortcut from the Overview): New session or New class. Used once.
  openNew?: boolean;
}) {
  const [active, setActive] = useTabParam(
    SECTIONS.map((s) => s.id),
    initialSection,
  );
  // The branch of the Classes, Subjects and Sessions tabs is one choice: switching between them keeps it.
  const [branchId, setBranchId] = useState(branches.some((b) => b.id === initialBranchId) ? initialBranchId! : branches[0].id);
  const [pendingNew, setPendingNew] = useState(openNew);
  const autoNew = pendingNew && active === initialSection;
  const autoNewDone = useCallback(() => setPendingNew(false), []);

  return (
    <div className="space-y-6">
      <Tabs label="Academics sections" prefix="academics" tabs={SECTIONS} active={active} onChange={setActive} />
      <div role="tabpanel" id={panelId("academics", active)} aria-labelledby={tabId("academics", active)}>
        {(active === "classes" || active === "subjects") && (
          <ClassesPanel
            key={active}
            branches={branches}
            view={active}
            branchId={branchId}
            onBranchChange={setBranchId}
            autoNew={autoNew}
            onAutoNewDone={autoNewDone}
          />
        )}
        {active === "sessions" && (
          <SessionsPanel
            key={active}
            branches={branches}
            branchId={branchId}
            onBranchChange={setBranchId}
            autoNew={autoNew}
            onAutoNewDone={autoNewDone}
          />
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
