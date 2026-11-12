"use client";

import { SwitchSettingsPanel, type SwitchCopy } from "@/components/settings/SwitchSettingsPanel";

// May an administrator of a branch suspend there (task 0045, section 4.7)? The shared switch screen with this switch's words. Expelling, terminating and reinstating stay with super admins.

const COPY: SwitchCopy = {
  endpoint: "/api/v1/settings/standing",
  title: "Suspending in a branch",
  intro:
    "A super admin can always suspend a student or a member of staff, and lift a suspension. When this is on, an administrator of a branch can do the same in their own branch, but never to another administrator. Expelling, terminating and reinstating stay with super admins. A branch can turn this off for itself but never on when the school has it off.",
  schoolOn: "Branch administrators may suspend",
  schoolOff: "Branch administrators may not suspend",
  schoolDoneOn: "Branch administrators may suspend again.",
  schoolDoneOff: "Branch administrators may no longer suspend.",
  branchOn: "its administrators may suspend",
  branchOffBySchool: "may not suspend, set by the school",
  branchOffByBranch: "may not suspend, set by the branch",
  turnOffBranchLabel: (name) => `Stop administrators of ${name} suspending`,
  turnOnBranchLabel: (name) => `Let administrators of ${name} suspend again`,
  branchDoneOff: (name) => `Administrators of ${name} may no longer suspend.`,
  branchDoneOn: (name) => `Administrators of ${name} may suspend again.`,
  idPrefix: "standing",
};

export function StandingSettingsPanel() {
  return <SwitchSettingsPanel copy={COPY} />;
}
