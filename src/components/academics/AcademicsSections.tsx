"use client";

import { useCallback, useMemo, useState } from "react";
import { useBranchSelection } from "@/components/ui/useBranchSelection";
import { useTabParam } from "@/components/ui/useTabParam";
import { ClassesPanel } from "@/components/academics/ClassesPanel";
import { DepartmentsPanel } from "@/components/academics/DepartmentsPanel";
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
  initialQuery,
  openNew = false,
}: {
  branches: BranchChoice[];
  isSuperAdmin?: boolean;
  /// Which tab opens first (a link from the Overview, or /academics/sessions).
  initialSection?: SectionId;
  initialBranchId?: string;
  /// The search a link opens the first tab with (the top-bar search, task 0113).
  initialQuery?: string;
  /// Open the "new" form of the first tab at once (a shortcut from the Overview): New session or New class. Used once.
  openNew?: boolean;
}) {
  // Whether each branch uses departments (task 0101 D7). Turned on or off on the Departments tab, and the staff list (another tab) follows without a reload.
  const [departmentsOn, setDepartmentsOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(branches.map((b) => [b.id, b.departments === true])),
  );
  const branchesNow = useMemo(() => branches.map((b) => ({ ...b, departments: departmentsOn[b.id] === true })), [branches, departmentsOn]);
  // The Departments tab: for an administrator of some branch (who can turn them on), and for anyone in a branch that uses them.
  const showDepartments = branchesNow.some((b) => b.canEdit || b.departments);
  const tabs = SECTIONS.filter((s) => s.id !== "departments" || showDepartments);
  const [active, setActive] = useTabParam(
    tabs.map((s) => s.id),
    tabs.some((s) => s.id === initialSection) ? initialSection : "classes",
  );
  // The branch of the Classes, Subjects and Sessions tabs is one choice: switching between them keeps it.
  const [branchId, setBranchId] = useBranchSelection(branches, { initial: initialBranchId });
  const [pendingNew, setPendingNew] = useState(openNew);
  const autoNew = pendingNew && active === initialSection;
  const autoNewDone = useCallback(() => setPendingNew(false), []);

  return (
    <div className="space-y-6">
      <Tabs label="Academics sections" prefix="academics" tabs={tabs} active={active} onChange={setActive} />
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
            initialQuery={active === initialSection ? initialQuery : undefined}
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
        {active === "departments" && (
          <DepartmentsPanel
            key={active}
            branches={branchesNow}
            branchId={branchId}
            onBranchChange={setBranchId}
            onSwitched={(id, on) => setDepartmentsOn((all) => ({ ...all, [id]: on }))}
          />
        )}
        {active === "staff" && (
          <StaffPanel
            branches={branchesNow}
            isSuperAdmin={isSuperAdmin}
            initialBranchId={initialBranchId}
            initialQuery={initialSection === "staff" ? initialQuery : undefined}
          />
        )}
        {active === "promotion" && <PromotionConsole branches={branches} />}
      </div>
    </div>
  );
}
