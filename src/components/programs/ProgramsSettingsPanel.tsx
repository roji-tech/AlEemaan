"use client";

import { SwitchSettingsPanel, type SwitchCopy } from "@/components/settings/SwitchSettingsPanel";

// The programs switch on the Settings page (task 0043, section 8.7): the school's value is the ceiling, each branch can only turn it off. The shared switch screen with this
// switch's words.

const COPY: SwitchCopy = {
  endpoint: "/api/v1/settings/programs",
  title: "Programs in the school",
  intro:
    "Programs are learning that is not a normal class. When this is off for the school, no program can be created or changed anywhere and only a super admin can still read what exists. A branch can turn it off for itself but never on when the school has it off.",
  schoolOn: "On for the school",
  schoolOff: "Off for the school",
  schoolDoneOn: "Programs are on for the school.",
  schoolDoneOff: "Programs are off for the school.",
  branchOn: "takes part",
  branchOffBySchool: "off, set by the school",
  branchOffByBranch: "off, set by the branch",
  turnOffBranchLabel: (name) => `Turn off programs for ${name}`,
  turnOnBranchLabel: (name) => `Turn programs back on for ${name}`,
  branchDoneOff: (name) => `${name} no longer takes part in programs.`,
  branchDoneOn: (name) => `${name} takes part in programs again.`,
  idPrefix: "programs",
};

export function ProgramsSettingsPanel() {
  return <SwitchSettingsPanel copy={COPY} />;
}
