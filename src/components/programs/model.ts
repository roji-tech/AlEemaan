import type { ProgramDetail, ProgramSummary } from "@/lib/programs/service";

export type { ProgramDetail, ProgramSummary };

// Shared by the Programs screens: the words, the dates and the sentences of the history. Presentation only.

export type ProgramKindKey = ProgramSummary["kind"];
export type ProgramStatusKey = ProgramSummary["status"];

export const KIND_TEXT: Record<ProgramKindKey, string> = { ONGOING: "Never ends", FIXED_TERM: "For a period" };
export const STATUS_TEXT: Record<ProgramStatusKey, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const DURATIONS = [
  { value: "6-MONTHS", label: "6 months", duration: { value: 6, unit: "MONTHS" } },
  { value: "1-YEARS", label: "1 year", duration: { value: 1, unit: "YEARS" } },
  { value: "2-YEARS", label: "2 years", duration: { value: 2, unit: "YEARS" } },
  { value: "3-YEARS", label: "3 years", duration: { value: 3, unit: "YEARS" } },
  { value: "5-YEARS", label: "5 years", duration: { value: 5, unit: "YEARS" } },
] as const;

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/// "2026-11-03" -> "3 Nov 2026" (a calendar day is the same day everywhere, so it is formatted in UTC, never shifted by the viewer's time zone).
export const dayText = (iso: string | null): string => (iso ? DAY.format(new Date(`${iso}T00:00:00Z`)) : "");

/// When it runs, without repeating the kind: "3 Nov 2026 to 2 May 2027" for a period; "From 3 Nov 2026" or "No end date" for one that never ends.
export function periodText(program: { kind: ProgramKindKey; startsOn: string | null; endsOn: string | null }): string {
  if (program.kind === "FIXED_TERM") return `${dayText(program.startsOn)} to ${dayText(program.endsOn)}`;
  return program.startsOn ? `From ${dayText(program.startsOn)}` : "No end date";
}

/// The one line under a program's name and on its card: the kind and, only when it says something new, the dates ("Never ends", "Never ends, from 3 Nov 2026", "For a period, 3 Nov 2026 to 2 May 2027").
export function headlineText(program: { kind: ProgramKindKey; startsOn: string | null; endsOn: string | null }): string {
  if (program.kind === "FIXED_TERM") return `${KIND_TEXT.FIXED_TERM}, ${periodText(program)}`;
  return program.startsOn ? `${KIND_TEXT.ONGOING}, from ${dayText(program.startsOn)}` : KIND_TEXT.ONGOING;
}

const ACTION_TEXT: Record<string, string> = {
  PROGRAM_CREATED: "created the program",
  PROGRAM_CHANGED: "changed the program's details",
  PROGRAM_ACTIVATED: "activated the program",
  PROGRAM_ARCHIVED: "archived the program",
  PROGRAM_RESTORED: "restored the program",
  BRANCH_LINKED: "added a branch",
  BRANCH_UNLINKED: "removed a branch",
  LEVELS_CHANGED: "changed the level names",
  GROUP_ADDED: "added a group",
  GROUP_RENAMED: "renamed a group",
  GROUP_MOVED: "moved a group",
  GROUP_ARCHIVED: "archived a group",
  GROUP_RESTORED: "restored a group",
  ADMIN_NAMED: "named a program admin",
  ADMIN_ENDED: "ended a program admin's place",
  STAFF_NAMED: "named a member of the program's staff",
  STAFF_ENDED: "ended a place in the program's staff",
  STAFF_GROUPS_CHANGED: "changed the groups someone takes attendance for",
  ATTENDANCE_TAKEN: "took attendance",
  ATTENDANCE_CORRECTED: "corrected attendance",
  PROGRAM_SETTINGS_CHANGED: "changed the program's settings",
  ASSESSMENT_CREATED: "made an assessment",
  ASSESSMENT_CHANGED: "changed an assessment",
  ASSESSMENT_OPENED: "opened an assessment for scores",
  ASSESSMENT_MARKED: "marked an assessment complete",
  ASSESSMENT_REOPENED: "sent an assessment back for changes",
  ASSESSMENT_PUBLISHED: "published an assessment's results",
  ASSESSMENT_ARCHIVED: "archived an assessment",
  SCORES_ENTERED: "entered scores",
  SCORES_CORRECTED: "changed scores",
  FEE_ITEM_CREATED: "made a fee",
  FEE_ITEM_CHANGED: "changed a fee",
  FEE_ITEM_ARCHIVED: "archived a fee",
  INVOICES_GENERATED: "made invoices",
  FEE_ADDED_TO_OPEN_INVOICES: "added a fee to open invoices",
  PAYMENT_RECORDED: "recorded a payment",
  PAYMENT_STARTED: "started an online payment",
  DISCOUNT_APPLIED: "gave a discount",
  PAY_IN_FULL_CHANGED: "changed whether an invoice must be paid in full",
  OVERPAYMENT_ACCEPTED: "accepted a payment above a reduced total",
  PLACE_COMPLETED: "completed a place",
  PLACE_REOPENED: "reopened a completed place",
  PROGRAM_COMPLETED: "completed the program",
  CERTIFICATE_ISSUED: "issued a certificate",
  CERTIFICATE_REVOKED: "withdrew a certificate",
};

export const historyText = (action: string): string => ACTION_TEXT[action] ?? action.toLowerCase().replace(/_/g, " ");

export const when = (iso: string): string => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
