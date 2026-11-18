"use client";

import { useState } from "react";
import type { BranchChoice } from "@/components/academics/common";
import { RequestsPanel } from "@/components/approvals/RequestsPanel";
import { LayoutPanel } from "@/components/approvals/LayoutPanel";
import { VerificationPanel } from "@/components/approvals/VerificationPanel";
import { SelfApprovalPanel } from "@/components/approvals/SelfApprovalPanel";
import { EmailChangesPanel } from "@/components/approvals/EmailChangesPanel";
import { Tabs, panelId, tabId } from "@/components/ui/Tabs";

// The Approvals page's sections behind one tab list, drawn by the shared Tabs (task 0089: a margin above the strip, and a strip that scrolls sideways on a phone instead of squeezing
// five labels). Only the active section is mounted. Presentation only - the settings APIs decide who may do what.
type SectionId = "requests" | "email" | "layout" | "verification" | "self";

export function ApprovalsSections({
  branches,
  isSuperAdmin,
  emailChangesWaiting = 0,
}: {
  branches: BranchChoice[];
  isSuperAdmin: boolean;
  /// How many email-address changes wait for THIS administrator (task 0088), shown on the tab.
  emailChangesWaiting?: number;
}) {
  const sections: { id: SectionId; label: string }[] = [
    { id: "requests", label: "Requests" },
    { id: "email", label: emailChangesWaiting > 0 ? `Email changes (${emailChangesWaiting})` : "Email changes" },
    { id: "layout", label: "Report cards" },
    { id: "verification", label: "Verification page" },
    ...(isSuperAdmin ? [{ id: "self" as const, label: "Self-approval" }] : []),
  ];
  const [active, setActive] = useState<SectionId>("requests");

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Tabs label="Approvals sections" prefix="approvals" tabs={sections} active={active} onChange={setActive} />
      </div>
      <div role="tabpanel" id={panelId("approvals", active)} aria-labelledby={tabId("approvals", active)}>
        {active === "requests" && <RequestsPanel branches={branches} />}
        {active === "email" && <EmailChangesPanel />}
        {active === "layout" && <LayoutPanel branches={branches} isSuperAdmin={isSuperAdmin} />}
        {active === "verification" && <VerificationPanel branches={branches} isSuperAdmin={isSuperAdmin} />}
        {active === "self" && <SelfApprovalPanel branches={branches} />}
      </div>
    </div>
  );
}
