"use client";

import { useState } from "react";
import { PracticeHistory } from "@/components/portal/PracticeHistory";
import { PracticeNow } from "@/components/portal/PracticeNow";
import { PracticeReports } from "@/components/portal/PracticeReports";
import { SectionTabs } from "@/components/forms/SectionTabs";

// The Practice tab in the portal (Task 0041, slice F4). A pupil at the full level has three sections: Practise now, History, My reports. Anyone else (a guardian, or a pupil whose school
// gave only the summary level) has one view and cannot start, answer, finish, archive, report or print: those routes refuse a guardian, so the screen does not offer them. Presentation
// only: the API checks the level of every request again.

const SECTIONS = [
  { id: "now", label: "Practise now" },
  { id: "history", label: "History" },
  { id: "reports", label: "My reports" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function PortalPracticeTab({ studentId, actor, level }: { studentId: string; actor: string; level: "SUMMARY" | "FULL" }) {
  const [active, setActive] = useState<SectionId>("now");
  if (actor !== "PUPIL" || level !== "FULL") return <PracticeHistory key={studentId} studentId={studentId} canAct={false} />;
  return (
    <div className="space-y-6">
      <SectionTabs label="Practice sections" idPrefix="pp" sections={SECTIONS} active={active} onChange={setActive}>
        {active === "now" && <PracticeNow key={`${studentId}-now`} studentId={studentId} />}
        {active === "history" && <PracticeHistory key={`${studentId}-history`} studentId={studentId} canAct />}
        {active === "reports" && <PracticeReports key={`${studentId}-reports`} studentId={studentId} />}
      </SectionTabs>
    </div>
  );
}
