import { ceilingSwitch } from "@/lib/settings/ceiling-switch";

// The one setting of standing (design note 0045, section 4.7): may an administrator of a branch suspend there? The school's value is the ceiling; a branch can only turn it
// off. It holds administrators, never a super admin. The mechanism is the shared ceiling switch.

export const MAY_SUSPEND_KEY = "standing.branchAdminMaySuspend";

export const maySuspendSwitch = ceilingSwitch({ key: MAY_SUSPEND_KEY, auditAction: "STANDING_SETTING_CHANGED" });

/// Whether administrators of this branch may suspend there right now.
export async function branchAdminMaySuspend(branchId: string): Promise<boolean> {
  return (await maySuspendSwitch.onFor([branchId])).get(branchId) ?? true;
}
