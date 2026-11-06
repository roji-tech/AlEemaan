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

const ASSESSMENTS_COPY: SwitchCopy = {
  endpoint: "/api/v1/settings/programs-assessments",
  title: "Assessments in programs",
  intro:
    "A program can give assessments (tests, recitation checks, practicals) and publish results. When this is off for the school, no program uses assessments and what was recorded can only be read. A branch can turn it off for itself but never on when the school has it off, and each program has its own switch as well, which starts off.",
  schoolOn: "Assessments is on for the school",
  schoolOff: "Assessments is off for the school",
  schoolDoneOn: "Assessments in programs is on for the school.",
  schoolDoneOff: "Assessments in programs is off for the school.",
  branchOn: "uses assessments",
  branchOffBySchool: "off, set by the school",
  branchOffByBranch: "off, set by the branch",
  turnOffBranchLabel: (name) => `Turn off program assessments for ${name}`,
  turnOnBranchLabel: (name) => `Turn program assessments back on for ${name}`,
  branchDoneOff: (name) => `${name} no longer uses assessments in programs.`,
  branchDoneOn: (name) => `${name} uses assessments in programs again.`,
  idPrefix: "programs-assessments",
  turnOffSchool: "Turn off assessments for the school",
  turnOnSchool: "Turn on assessments for the school",
  branchesTitle: "Branches using assessments",
};

const FEES_COPY: SwitchCopy = {
  endpoint: "/api/v1/settings/programs-fees",
  title: "Fees in programs",
  intro:
    "A program can charge its own fees and take payments. When this is off for the school, no program charges fees and what was recorded can only be read. A branch can turn it off for itself but never on when the school has it off, and each program has its own switch as well, which starts off.",
  schoolOn: "Fees is on for the school",
  schoolOff: "Fees is off for the school",
  schoolDoneOn: "Fees in programs is on for the school.",
  schoolDoneOff: "Fees in programs is off for the school.",
  branchOn: "uses fees",
  branchOffBySchool: "off, set by the school",
  branchOffByBranch: "off, set by the branch",
  turnOffBranchLabel: (name) => `Turn off program fees for ${name}`,
  turnOnBranchLabel: (name) => `Turn program fees back on for ${name}`,
  branchDoneOff: (name) => `${name} no longer uses fees in programs.`,
  branchDoneOn: (name) => `${name} uses fees in programs again.`,
  idPrefix: "programs-fees",
  turnOffSchool: "Turn off fees for the school",
  turnOnSchool: "Turn on fees for the school",
  branchesTitle: "Branches using fees",
};

export function ProgramsSettingsPanel() {
  return (
    <div className="space-y-8">
      <SwitchSettingsPanel copy={COPY} />
      <SwitchSettingsPanel copy={ATTENDANCE_COPY} />
      <SwitchSettingsPanel copy={ASSESSMENTS_COPY} />
      <SwitchSettingsPanel copy={FEES_COPY} />
    </div>
  );
}
