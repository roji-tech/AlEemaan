import { ceilingSwitch, type SetSwitchInput, type SwitchesView } from "@/lib/settings/ceiling-switch";
import { done, type Result } from "./common";
import { PROGRAMS_ENABLED_KEY, PROGRAM_ATTENDANCE_KEY } from "./rules";

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
