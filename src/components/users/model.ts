import type { SelectOption } from "@/components/ui/SelectField";
import { ROLE_LABELS } from "@/lib/roles";

// What the Users page gets from the members/invitations API (plan §0.5.4), and the small display rules around it.

export type RoleName = keyof typeof ROLE_LABELS;
export type BranchOption = { id: string; name: string };

export type Member = {
  /// The MEMBERSHIP's id — what every action addresses (the schema allows one person several; the id keeps each action unambiguous).
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: RoleName;
  branchId: string;
  branchName: string;
  status: "active" | "deactivated";
  joinedAt: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: RoleName;
  branchId: string;
  branchName: string;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "expired";
};

export type PageMeta = { page: number; limit: number; total: number; pages: number; hasNext: boolean };

export const ROLE_OPTIONS: SelectOption[] = (Object.keys(ROLE_LABELS) as RoleName[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

export const displayName = (member: Pick<Member, "name" | "email">) => member.name?.trim() || member.email || "Unnamed person";

const UNITS: [string, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/// "Expires in 6 days" · "Expires in 3 hours" · "Expires in 1 minute" · "Expired".
export function expiryText(expiresAt: string, now: number = Date.now()): string {
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 0) return "Expired";
  for (const [unit, size] of UNITS) {
    const count = Math.floor(left / size);
    if (count >= 1) return `Expires in ${count} ${unit}${count === 1 ? "" : "s"}`;
  }
  return "Expires in under a minute";
}
