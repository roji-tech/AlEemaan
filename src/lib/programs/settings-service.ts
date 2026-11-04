import { ceilingSwitch, type SetSwitchInput, type SwitchesView } from "@/lib/settings/ceiling-switch";
import { done, type Result } from "./common";
import { PROGRAMS_ENABLED_KEY } from "./rules";

// The one switch of slice P1, `programs.enabled` (design note 8.7): the school's value is the ceiling, a branch can only narrow it. The mechanism is the shared ceiling switch
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
