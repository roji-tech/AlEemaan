// The shapes the guardian screens read (task 0113 D9, D10), as the guardian API answers them, and the words they show. Client-safe.

export type Relationship = "MOTHER" | "FATHER" | "GUARDIAN" | "OTHER";
export const RELATIONSHIP_OPTIONS: { value: Relationship; label: string }[] = [
  { value: "MOTHER", label: "Mother" },
  { value: "FATHER", label: "Father" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "OTHER", label: "Other" },
];
export const relationshipLabel = (r: Relationship | null): string | null => RELATIONSHIP_OPTIONS.find((o) => o.value === r)?.label ?? null;

export type Blocked = { at: string; by: string | null; reason: string | null };

export type GuardianCard = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  codeAt: string | null;
  children: number;
  otherBranches: number;
  blocked: number;
};

export type GuardianChild = {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string | null;
  branchId: string;
  branchName: string;
  archived: boolean;
  relationship: Relationship | null;
  isMain: boolean;
  blocked: Blocked | null;
  canManage: boolean;
};

export type GuardianDetail = {
  guardian: { id: string; name: string; phone: string | null; email: string | null; codeAt: string | null; archived: boolean };
  children: GuardianChild[];
  otherBranches: number;
  can: { edit: boolean; code: boolean };
};

/// One guardian of a pupil, as the pupil's Guardians dialog lists them.
export type PupilGuardian = {
  guardianId: string;
  name: string;
  phone: string | null;
  email: string | null;
  codeAt: string | null;
  relationship: Relationship | null;
  isMain: boolean;
  blocked: Blocked | null;
  otherChildren: number;
  canAct: boolean;
};

export type GuardianMatch = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  children: string[];
  otherBranches: number;
};

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const dayText = (iso: string): string => DAY.format(new Date(iso));

/// "Blocked on 19 Nov 2026 by Amina Bello: court order".
export const blockedText = (b: Blocked): string =>
  `Blocked on ${dayText(b.at)}${b.by ? ` by ${b.by}` : ""}${b.reason ? `: ${b.reason}` : ""}`;

export const codeText = (codeAt: string | null): string => (codeAt ? `Code made ${dayText(codeAt)}` : "No code yet");
