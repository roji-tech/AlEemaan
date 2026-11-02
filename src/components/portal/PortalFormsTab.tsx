"use client";

import { useState } from "react";
import { PortalPaperWork } from "@/components/portal/PortalPaperWork";
import { PortalPracticeSets } from "@/components/portal/PortalPracticeSets";
import { PortalQuestionnaires } from "@/components/portal/PortalQuestionnaires";
import { SectionTabs } from "@/components/forms/SectionTabs";

// The pupil's Forms tab in the portal (Task 0041, slice F3): practice sets, questionnaires and paper work. It is offered to a pupil only: every portal forms route answers a guardian
// 403, so the page does not show a tab the API would refuse. Presentation only.

const SECTIONS = [
  { id: "practice", label: "Practice sets" },
  { id: "questionnaires", label: "Questionnaires" },
  { id: "paper", label: "Paper work" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function PortalFormsTab({ studentId }: { studentId: string }) {
  const [active, setActive] = useState<SectionId>("practice");
  return (
    <div className="space-y-6">
      <SectionTabs label="Forms sections" idPrefix="pf" sections={SECTIONS} active={active} onChange={setActive}>
        {active === "practice" && <PortalPracticeSets key={`${studentId}-practice`} studentId={studentId} />}
        {active === "questionnaires" && <PortalQuestionnaires key={`${studentId}-questionnaires`} studentId={studentId} />}
        {active === "paper" && <PortalPaperWork key={`${studentId}-paper`} studentId={studentId} />}
      </SectionTabs>
    </div>
  );
}
