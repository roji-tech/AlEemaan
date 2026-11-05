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

// Slice P3: attendance has its own switch under the same ceiling rule; a program has a third, its own, in the program's Settings tab.
const ATTENDANCE_COPY: SwitchCopy = {
  endpoint: "/api/v1/settings/programs-attendance",
  title: "Attendance in programs",
  intro:
    "Teachers and recorders take attendance for the groups of a program. When this is off for the school, no program takes attendance and what was recorded can only be read. A branch can turn it off for itself but never on when the school has it off, and each program has its own switch as well.",
  schoolOn: "Attendance is on for the school",
  schoolOff: "Attendance is off for the school",
  schoolDoneOn: "Attendance in programs is on for the school.",
  schoolDoneOff: "Attendance in programs is off for the school.",
  branchOn: "takes attendance",
  branchOffBySchool: "off, set by the school",
  branchOffByBranch: "off, set by the branch",
  turnOffBranchLabel: (name) => `Turn off program attendance for ${name}`,
  turnOnBranchLabel: (name) => `Turn program attendance back on for ${name}`,
  branchDoneOff: (name) => `${name} no longer takes attendance in programs.`,
  branchDoneOn: (name) => `${name} takes attendance in programs again.`,
  idPrefix: "programs-attendance",
  turnOffSchool: "Turn off attendance for the school",
  turnOnSchool: "Turn on attendance for the school",
  branchesTitle: "Branches taking attendance",
};

export function ProgramsSettingsPanel() {
  return (
    <div className="space-y-8">
      <SwitchSettingsPanel copy={COPY} />
      <SwitchSettingsPanel copy={ATTENDANCE_COPY} />
    </div>
  );
}
