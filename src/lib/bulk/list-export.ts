import { z } from "zod";
import { STAFF_CATEGORY_LABELS } from "@/lib/academics/staff-rules";
import { pupilEntity } from "./pupils";
import { staffColumns } from "./staff";
import { classColumns } from "./classes";
import { subjectColumns } from "./subjects";
import type { BulkColumn } from "./types";

// Exporting a list (task 0103 D3): the four lists' rows as the import template's columns, in the same order and wording, so an export can be corrected in a spreadsheet and imported again.
// Pure: no database and no browser. The server picks the rows (and audits the export); the browser writes the CSV or Excel file with the same writers as the templates (`toCsv` neutralises
// every cell that a spreadsheet would run as a formula; `buildWorkbook` writes every cell as text).

export const EXPORT_KINDS = ["pupils", "staff", "classes", "subjects"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
/// The most rows one export may hold; beyond it the export is refused and says so.
export const EXPORT_MAX_ROWS = 20_000;
/// Exports one person may make in the rate limiter's window (5 minutes).
export const EXPORT_LIMIT = 5;
/// The most ids a "the ones shown" export of staff, classes or subjects may name.
export const EXPORT_MAX_IDS = 5_000;

export const EXPORT_COLUMNS: Record<ExportKind, BulkColumn[]> = {
  pupils: pupilEntity.columns,
  staff: staffColumns,
  classes: classColumns,
  subjects: subjectColumns,
};
export const EXPORT_NOUN: Record<ExportKind, string> = { pupils: "pupils", staff: "staff", classes: "classes", subjects: "subjects" };

const cuid = z.string().trim().min(1).max(64);
export const exportRequestSchema = z.strictObject({
  kind: z.enum(EXPORT_KINDS),
  branchId: cuid,
  /// "shown": what the list shows now, with its search and filters (every page); "all": every current record of the branch.
  scope: z.enum(["shown", "all"]),
  /// With "all": also the archived records.
  includeArchived: z.boolean().optional(),
  /// Pupils, with "shown": the list's own search, Show choice and filters (task 0103 D1), read by the same rules as the list.
  pupils: z
    .strictObject({
      q: z.string().max(100).optional(),
      show: z.enum(["live", "suspended", "expelled", "archived"]).optional(),
      query: z.string().max(500).optional(),
    })
    .optional(),
  /// Staff, classes and subjects, with "shown": the records the screen shows (those lists are loaded whole and filtered on the screen).
  ids: z.array(cuid).max(EXPORT_MAX_IDS).optional(),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;

const GENDER: Record<string, string> = { MALE: "Male", FEMALE: "Female" };
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const text = (v: string | null | undefined) => v ?? "";

export type PupilExportRow = {
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: string | null;
  dateOfBirth: Date | null;
  admissionNo: string;
  className: string | null;
  arm: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  /// Day or boarding (task 0113 R1); absent or null = not set.
  residence?: string | null;
  /// Task 0113 S1: the names of the pupil's live scholarships and their shares added up (an administrator's export only: exports already are).
  scholarship?: string | null;
  scholarshipPercent?: number | null;
};
export type StaffExportRow = {
  category: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  title: string | null;
  gender: string | null;
  designation: string | null;
  qualification: string | null;
  corpsMember: boolean;
};
export type ClassExportRow = { name: string; arms: string[]; subjects: string[] };
export type SubjectExportRow = { name: string; code: string | null };

/// One record's cells, keyed by the import's column keys.
export const exportValues = {
  pupils: (r: PupilExportRow): Record<string, string> => ({
    firstName: r.firstName,
    middleName: text(r.middleName),
    lastName: r.lastName,
    gender: r.gender ? (GENDER[r.gender] ?? "") : "",
    dateOfBirth: day(r.dateOfBirth),
    admissionNo: r.admissionNo,
    className: text(r.className),
    arm: text(r.arm),
    guardianName: text(r.guardianName),
    guardianPhone: text(r.guardianPhone),
    guardianEmail: text(r.guardianEmail),
    residence: r.residence === "DAY" ? "Day" : r.residence === "BOARDING" ? "Boarding" : "",
    scholarship: text(r.scholarship),
    scholarshipPercent: r.scholarshipPercent ? String(r.scholarshipPercent) : "",
  }),
  staff: (r: StaffExportRow): Record<string, string> => ({
    category: STAFF_CATEGORY_LABELS[r.category as keyof typeof STAFF_CATEGORY_LABELS] ?? r.category,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: text(r.phone),
    email: text(r.email),
    title: text(r.title),
    gender: r.gender ? (GENDER[r.gender] ?? "") : "",
    designation: text(r.designation),
    qualification: text(r.qualification),
    corpsMember: r.corpsMember ? "Yes" : "No",
  }),
  classes: (r: ClassExportRow): Record<string, string> => ({ name: r.name, arms: r.arms.join(", "), subjects: r.subjects.join(", ") }),
  subjects: (r: SubjectExportRow): Record<string, string> => ({ name: r.name, code: text(r.code) }),
};

/// The header row and the rows, in the template's column order.
export function exportTable(kind: ExportKind, values: Record<string, string>[]): { headers: string[]; rows: string[][] } {
  const columns = EXPORT_COLUMNS[kind];
  return { headers: columns.map((c) => c.label), rows: values.map((v) => columns.map((c) => v[c.key] ?? "")) };
}

/// `pupils-primary-2026-11-19`: the list, the branch and the day, in letters, digits and dashes only (a name never carries a path or a quote into the download).
export function exportFileStem(kind: ExportKind, branchName: string, today: string, scope: "shown" | "all"): string {
  const slug = branchName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return [kind, slug || "branch", scope === "shown" ? "filtered" : "", today].filter(Boolean).join("-");
}
