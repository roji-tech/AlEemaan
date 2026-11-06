import { ceilingSwitch, type SetSwitchInput, type SwitchesView } from "@/lib/settings/ceiling-switch";
import { done, type Result } from "./common";
import {
  PROGRAMS_ENABLED_KEY,
  PROGRAM_ASSESSMENTS_KEY,
  PROGRAM_ATTENDANCE_KEY,
  PROGRAM_FEES_KEY,
  PROGRAM_PROGRESS_GUARDIAN_KEY,
  PROGRAM_PROGRESS_KEY,
  PROGRAM_PROGRESS_STUDENT_KEY,
} from "./rules";

// The switches of programs: `programs.enabled` (slice P1) and `programs.attendance.enabled` (slice P3) (design note 8.7): the school's value is the ceiling, a branch can only narrow it. The mechanism is the shared ceiling switch
// (lib/settings/ceiling-switch.ts); this file is its key and its audit action.

export type { SwitchesView, SetSwitchInput };

const programsSwitch = ceilingSwitch({ key: PROGRAMS_ENABLED_KEY, auditAction: "PROGRAMS_SETTING_CHANGED" });

export const storedSwitches = programsSwitch.stored;

/// Whether each branch takes part in programs right now (the school's value AND the branch's own).
export const branchesTakingPart = programsSwitch.onFor;

export const switchesView = programsSwitch.view;

export async function setSwitch(actorUserId: string, input: SetSwitchInput): Promise<Result<SwitchesView>> {
  const result = await programsSwitch.set(actorUserId, input);
  return result.ok ? done(result.data) : result;
}

// Slice P3: attendance. The same ceiling rule, and a third level that belongs to the program itself (`Program.attendanceEnabled`, set in the program's Settings tab).

const attendanceSwitch = ceilingSwitch({ key: PROGRAM_ATTENDANCE_KEY, auditAction: "PROGRAMS_ATTENDANCE_SETTING_CHANGED" });

export const attendanceStored = attendanceSwitch.stored;

/// Whether each branch has attendance on right now (the school's value AND the branch's own); the program's own flag is checked by the attendance service.
export const branchesWithAttendance = attendanceSwitch.onFor;

export const attendanceSwitchesView = attendanceSwitch.view;

export async function setAttendanceSwitch(actorUserId: string, input: SetSwitchInput): Promise<Result<SwitchesView>> {
  const result = await attendanceSwitch.set(actorUserId, input);
  return result.ok ? done(result.data) : result;
}

// Slices P3b and P4: assessments and fees, the same ceiling rule and the same three levels (school, branch, the program's own flag).

const assessmentsSwitch = ceilingSwitch({ key: PROGRAM_ASSESSMENTS_KEY, auditAction: "PROGRAMS_ASSESSMENTS_SETTING_CHANGED" });
export const assessmentsStored = assessmentsSwitch.stored;
export const assessmentsSwitchesView = assessmentsSwitch.view;
export async function setAssessmentsSwitch(actorUserId: string, input: SetSwitchInput): Promise<Result<SwitchesView>> {
  const result = await assessmentsSwitch.set(actorUserId, input);
  return result.ok ? done(result.data) : result;
}

const feesSwitch = ceilingSwitch({ key: PROGRAM_FEES_KEY, auditAction: "PROGRAMS_FEES_SETTING_CHANGED" });
export const feesStored = feesSwitch.stored;
export const feesSwitchesView = feesSwitch.view;
export async function setFeesSwitch(actorUserId: string, input: SetSwitchInput): Promise<Result<SwitchesView>> {
  const result = await feesSwitch.set(actorUserId, input);
  return result.ok ? done(result.data) : result;
}

// Progress records (task 0044): the feature itself, and what pupils and guardians may see of it - three switches, each under the ceiling rule (school, branch, the program's own flag).

const progressSwitch = ceilingSwitch({ key: PROGRAM_PROGRESS_KEY, auditAction: "PROGRAMS_PROGRESS_SETTING_CHANGED" });
export const progressStored = progressSwitch.stored;
export const progressSwitchesView = progressSwitch.view;
export async function setProgressSwitch(actorUserId: string, input: SetSwitchInput): Promise<Result<SwitchesView>> {
  const result = await progressSwitch.set(actorUserId, input);
  return result.ok ? done(result.data) : result;
}

const progressStudentSwitch = ceilingSwitch({
  key: PROGRAM_PROGRESS_STUDENT_KEY,
  auditAction: "PROGRAMS_PROGRESS_STUDENT_SETTING_CHANGED",
});
export const progressStudentStored = progressStudentSwitch.stored;
export const progressStudentSwitchesView = progressStudentSwitch.view;
export async function setProgressStudentSwitch(actorUserId: string, input: SetSwitchInput): Promise<Result<SwitchesView>> {
  const result = await progressStudentSwitch.set(actorUserId, input);
  return result.ok ? done(result.data) : result;
}

const progressGuardianSwitch = ceilingSwitch({
  key: PROGRAM_PROGRESS_GUARDIAN_KEY,
  auditAction: "PROGRAMS_PROGRESS_GUARDIAN_SETTING_CHANGED",
});
export const progressGuardianStored = progressGuardianSwitch.stored;
export const progressGuardianSwitchesView = progressGuardianSwitch.view;
export async function setProgressGuardianSwitch(actorUserId: string, input: SetSwitchInput): Promise<Result<SwitchesView>> {
  const result = await progressGuardianSwitch.set(actorUserId, input);
  return result.ok ? done(result.data) : result;
}
