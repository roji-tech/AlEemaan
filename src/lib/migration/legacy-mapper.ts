import { Gender, EnrollmentStatus, ResultStatus, SessionStatus, PeriodKind } from "@prisma/client";
import { WAEC_TEMPLATE } from "@/lib/academics/assessment";

// --- Types for Legacy Firestore Payloads ---

export interface LegacyStudentDoc {
  uid: string;
  name?: string;
  email?: string;
  class?: string;
  gender?: string;
  number?: string;
  hasPaid?: boolean;
  paymentUpdatedAt?: string | number | Date | { toDate?: () => Date; _seconds?: number };
  createdAt?: string | number | Date | { toDate?: () => Date; _seconds?: number };
  updatedAt?: string | number | Date | { toDate?: () => Date; _seconds?: number };
  dateOfBirth?: string | number | Date | { toDate?: () => Date; _seconds?: number };
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  promotionHistory?: Array<{
    from?: string;
    to?: string;
    session?: string;
    promotedAt?: string | number | Date | { toDate?: () => Date; _seconds?: number };
  }>;
}

export interface LegacyTestItem {
  id?: string;
  name: string;
  score: number;
  max?: number;
}

export interface LegacySubjectScore {
  name: string;
  tests?: LegacyTestItem[];
  caTotal?: number;
  exam?: number;
  total?: number;
  grade?: string;
  remark?: string;
}

export interface LegacyResultDoc {
  id?: string;
  studentNumber?: string;
  studentUid?: string;
  studentName?: string;
  class: string;
  term: string;
  session: string;
  gender?: string;
  subjects?: LegacySubjectScore[];
  totalScore?: number;
  average?: number;
  assessmentConfig?: {
    tests?: Array<{ id?: string; name: string; max: number }>;
    caMax?: number;
    examMax?: number;
  };
  teacherRemark?: string;
  principalRemark?: string;
  submittedAt?: string | number | Date | { toDate?: () => Date; _seconds?: number };
  updatedAt?: string | number | Date | { toDate?: () => Date; _seconds?: number };
}

// --- Mapped Target Record Types ---

export interface MappedStudent {
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: Gender;
  dateOfBirth: Date;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  className: string | null;
  hasPaid: boolean;
}

export interface MappedEnrollment {
  admissionNo: string;
  className: string;
  arm: string;
  sessionLabel: string;
  status: EnrollmentStatus;
}

export interface MappedClassGroup {
  name: string;
  sortOrder: number;
  armNames: string[];
}

export interface MappedSubject {
  name: string;
  code: string;
}

export interface MappedSession {
  label: string;
  startDate: Date;
  endDate: Date;
  status: SessionStatus;
  periods: Array<{
    ordinal: number;
    label: string;
    kind: PeriodKind;
    startDate: Date;
    endDate: Date;
  }>;
}

export interface MappedResult {
  studentAdmissionNo: string;
  subjectName: string;
  className: string;
  armName: string;
  sessionLabel: string;
  termOrdinal: number;
  componentScores: Array<{ name: string; max: number; score: number }>;
  examScore: number;
  examMax: number;
  caTotal: number;
  total: number;
  maxScore: number;
  gradeLetter: string;
  gradeRemark: string;
  status: ResultStatus;
}

export interface MappedReportRemark {
  studentAdmissionNo: string;
  sessionLabel: string;
  termOrdinal: number;
  teacherRemark: string | null;
  principalRemark: string | null;
}

export interface ReconciliationSummary {
  branchName: string;
  totalLegacyStudents: number;
  mappedStudents: number;
  duplicateStudentsSkipped: number;
  totalLegacyResults: number;
  mappedResults: number;
  invalidResultsSkipped: number;
  mappedRemarks: number;
  classesIdentified: string[];
  subjectsIdentified: string[];
  sessionsIdentified: string[];
  gradeDistribution: Record<string, number>;
  warnings: string[];
}

// --- Helper Date Parsing ---

export function parseFirestoreTimestamp(val: unknown, fallback: Date = new Date()): Date {
  if (!val) return fallback;
  if (val instanceof Date) return isNaN(val.getTime()) ? fallback : val;
  if (typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? fallback : d;
  }
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? fallback : d;
  }
  if (typeof val === "object" && val !== null) {
    if ("toDate" in val && typeof (val as { toDate: () => unknown }).toDate === "function") {
      try {
        const d = (val as { toDate: () => unknown }).toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {
        // fallback below
      }
    }
    if ("_seconds" in val && typeof (val as { _seconds: number })._seconds === "number") {
      const d = new Date((val as { _seconds: number })._seconds * 1000);
      return isNaN(d.getTime()) ? fallback : d;
    }
    if ("seconds" in val && typeof (val as { seconds: number }).seconds === "number") {
      const d = new Date((val as { seconds: number }).seconds * 1000);
      return isNaN(d.getTime()) ? fallback : d;
    }
  }
  return fallback;
}

// --- Name Splitting ---

export function splitFullName(rawName: string | undefined | null): {
  firstName: string;
  middleName: string | null;
  lastName: string;
} {
  const cleaned = (rawName ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return { firstName: "Unknown", middleName: null, lastName: "Student" };
  }

  const parts = cleaned.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: null, lastName: parts[0] };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], middleName: null, lastName: parts[1] };
  }

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const middleName = parts.slice(1, -1).join(" ");
  return { firstName, middleName: middleName || null, lastName };
}

// --- Gender Normalization ---

export function normalizeGender(rawGender: string | undefined | null): Gender {
  const g = (rawGender ?? "").trim().toLowerCase();
  if (g.startsWith("f") || g === "girl" || g === "female") {
    return Gender.FEMALE;
  }
  return Gender.MALE;
}

// --- Class Name Normalization & Sort Order ---

export function normalizeClassName(rawClass: string | undefined | null): string {
  const trimmed = (rawClass ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "General";

  // Match JSS1, JSS-1, JSS 1, etc.
  const jssMatch = trimmed.match(/^JSS\s*[-_]?\s*([1-3])$/i);
  if (jssMatch) return `JSS ${jssMatch[1]}`;

  // Match SS1, SS-1, SS 1, etc.
  const ssMatch = trimmed.match(/^SS\s*[-_]?\s*([1-3])$/i);
  if (ssMatch) return `SS ${ssMatch[1]}`;

  // Match Primary 1-6 or Basic 1-6 or Pry 1-6
  const pryMatch = trimmed.match(/^(?:Primary|Basic|Pry)\s*[-_]?\s*([1-6])$/i);
  if (pryMatch) return `Primary ${pryMatch[1]}`;

  // Match Nursery 1-3 or Nur 1-3
  const nurMatch = trimmed.match(/^(?:Nursery|Nur)\s*[-_]?\s*([1-3])$/i);
  if (nurMatch) return `Nursery ${nurMatch[1]}`;

  // Match KG 1-2 or Kindergarten 1-2
  const kgMatch = trimmed.match(/^(?:KG|Kindergarten)\s*[-_]?\s*([1-2])$/i);
  if (kgMatch) return `KG ${kgMatch[1]}`;

  // Match Creche
  if (/^Creche$/i.test(trimmed)) return "Creche";

  return trimmed;
}

export function computeClassSortOrder(className: string): number {
  const norm = normalizeClassName(className);
  if (norm.startsWith("Creche")) return 1;
  const kgMatch = norm.match(/^KG\s*([1-2])$/);
  if (kgMatch) return 1 + parseInt(kgMatch[1], 10);
  const nurMatch = norm.match(/^Nursery\s*([1-3])$/);
  if (nurMatch) return 3 + parseInt(nurMatch[1], 10);
  const pryMatch = norm.match(/^Primary\s*([1-6])$/);
  if (pryMatch) return 10 + parseInt(pryMatch[1], 10);
  const jssMatch = norm.match(/^JSS\s*([1-3])$/);
  if (jssMatch) return 20 + parseInt(jssMatch[1], 10);
  const ssMatch = norm.match(/^SS\s*([1-3])$/);
  if (ssMatch) return 30 + parseInt(ssMatch[1], 10);
  return 50;
}

// --- Subject Normalization & Code Generation ---

export function normalizeSubjectName(rawSubject: string | undefined | null): string {
  const trimmed = (rawSubject ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "General Subject";

  // Common aliases
  const lower = trimmed.toLowerCase();
  if (lower === "math" || lower === "maths" || lower === "mathematics") return "Mathematics";
  if (lower === "english" || lower === "eng" || lower === "english language") return "English Language";
  if (lower === "basic science" || lower === "basic sci" || lower === "integrated science") return "Basic Science";
  if (lower === "basic technology" || lower === "basic tech") return "Basic Technology";
  if (lower === "social studies" || lower === "sos") return "Social Studies";
  if (lower === "civic education" || lower === "civic ed" || lower === "civics") return "Civic Education";
  if (lower === "agricultural science" || lower === "agric science" || lower === "agric") return "Agricultural Science";
  if (lower === "computer studies" || lower === "computer science" || lower === "ict") return "Computer Studies";
  if (lower === "islamic religious studies" || lower === "irs" || lower === "islamic studies") return "Islamic Studies";
  if (lower === "physical and health education" || lower === "phe" || lower === "p.h.e") return "Physical and Health Education";
  if (lower === "business studies" || lower === "bus studies") return "Business Studies";
  if (lower === "further mathematics" || lower === "further maths") return "Further Mathematics";

  // Capitalize words
  return trimmed
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function generateSubjectCode(subjectName: string): string {
  const norm = normalizeSubjectName(subjectName);
  const words = norm
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }
  if (words.length === 2) {
    return (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase();
  }
  return words
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 6)
    .toUpperCase();
}

// --- Session and Term Normalization ---

export function normalizeSessionLabel(rawSession: string | undefined | null): string {
  const trimmed = (rawSession ?? "").trim().replace(/\s+/g, "");
  // Match 2024/2025 or 2024-2025
  const match = trimmed.match(/^(\d{4})[/-](\d{4})$/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  const singleYear = trimmed.match(/^(\d{4})$/);
  if (singleYear) {
    const y = parseInt(singleYear[1], 10);
    return `${y}/${y + 1}`;
  }
  return "2024/2025";
}

export function normalizeTerm(rawTerm: string | undefined | null): { ordinal: number; label: string } {
  const lower = (rawTerm ?? "").trim().toLowerCase();
  if (lower.includes("1") || lower.includes("first") || lower.includes("1st")) {
    return { ordinal: 1, label: "1st Term" };
  }
  if (lower.includes("2") || lower.includes("second") || lower.includes("2nd")) {
    return { ordinal: 2, label: "2nd Term" };
  }
  if (lower.includes("3") || lower.includes("third") || lower.includes("3rd")) {
    return { ordinal: 3, label: "3rd Term" };
  }
  return { ordinal: 1, label: "1st Term" };
}

export function buildSessionRecord(sessionLabel: string, isActive = false): MappedSession {
  const normLabel = normalizeSessionLabel(sessionLabel);
  const [startYearStr, endYearStr] = normLabel.split("/");
  const startYear = parseInt(startYearStr, 10);
  const endYear = parseInt(endYearStr, 10);

  const startDate = new Date(Date.UTC(startYear, 8, 1)); // September 1
  const endDate = new Date(Date.UTC(endYear, 6, 31)); // July 31

  const p1Start = new Date(Date.UTC(startYear, 8, 1));
  const p1End = new Date(Date.UTC(startYear, 11, 20));
  const p2Start = new Date(Date.UTC(endYear, 0, 10));
  const p2End = new Date(Date.UTC(endYear, 3, 15));
  const p3Start = new Date(Date.UTC(endYear, 4, 1));
  const p3End = new Date(Date.UTC(endYear, 6, 31));

  return {
    label: normLabel,
    startDate,
    endDate,
    status: isActive ? SessionStatus.ACTIVE : SessionStatus.CLOSED,
    periods: [
      { ordinal: 1, label: "1st Term", kind: PeriodKind.TERM, startDate: p1Start, endDate: p1End },
      { ordinal: 2, label: "2nd Term", kind: PeriodKind.TERM, startDate: p2Start, endDate: p2End },
      { ordinal: 3, label: "3rd Term", kind: PeriodKind.TERM, startDate: p3Start, endDate: p3End },
    ],
  };
}

// --- Grade Determination ---

export function determineGrade(
  scoreOutOf100: number,
  preferredGrade?: string,
  preferredRemark?: string,
): {
  gradeLetter: string;
  gradeRemark: string;
} {
  const clamped = Math.min(100, Math.max(0, Math.round(scoreOutOf100 * 100) / 100));

  // If legacy already provided valid WAEC grade, check if it matches template
  if (preferredGrade) {
    const cleanGrade = preferredGrade.trim().toUpperCase();
    const match = WAEC_TEMPLATE.find((b) => b.letter.toUpperCase() === cleanGrade);
    if (match) {
      return { gradeLetter: match.letter, gradeRemark: preferredRemark?.trim() || match.remark };
    }
  }

  // Lookup in WAEC template
  for (const band of WAEC_TEMPLATE) {
    if (band.max === 100) {
      if (clamped >= band.min && clamped <= band.max) {
        return { gradeLetter: band.letter, gradeRemark: preferredRemark?.trim() || band.remark };
      }
    } else {
      if (clamped >= band.min && clamped < band.max) {
        return { gradeLetter: band.letter, gradeRemark: preferredRemark?.trim() || band.remark };
      }
    }
  }

  return { gradeLetter: "F9", gradeRemark: "Fail" };
}

// --- Main Student Document Mapper ---

export function mapLegacyStudent(
  doc: LegacyStudentDoc,
  branchName: string,
  defaultSessionLabel = "2024/2025",
): {
  student: MappedStudent;
  enrollment: MappedEnrollment | null;
} {
  const admissionNo = doc.number?.trim() || doc.uid?.trim() || `LEGACY-${Math.random().toString(36).slice(2, 9)}`;
  const { firstName, middleName, lastName } = splitFullName(doc.name);
  const gender = normalizeGender(doc.gender);
  const now = new Date();

  // Fallback DOB based on branch if missing
  const isSecondary = branchName.toLowerCase().includes("secondary");
  const fallbackDob = isSecondary ? new Date(Date.UTC(2010, 0, 1)) : new Date(Date.UTC(2016, 0, 1));
  const dateOfBirth = doc.dateOfBirth ? parseFirestoreTimestamp(doc.dateOfBirth, fallbackDob) : fallbackDob;

  const createdAt = parseFirestoreTimestamp(doc.createdAt, now);
  const updatedAt = parseFirestoreTimestamp(doc.updatedAt, now);

  const guardianEmail = doc.guardianEmail?.trim() || (doc.email?.includes("@") ? doc.email.trim() : null);
  const guardianPhone = doc.guardianPhone?.trim() || null;
  const guardianName = doc.guardianName?.trim() || null;

  const rawClass = doc.class?.trim() || null;
  const className = rawClass ? normalizeClassName(rawClass) : null;
  const hasPaid = Boolean(doc.hasPaid);

  const student: MappedStudent = {
    admissionNo,
    firstName,
    middleName,
    lastName,
    gender,
    dateOfBirth,
    guardianName,
    guardianPhone,
    guardianEmail,
    createdAt,
    updatedAt,
    className,
    hasPaid,
  };

  let enrollment: MappedEnrollment | null = null;
  if (className) {
    // Check if latest session in promotion history exists, else use defaultSessionLabel
    let targetSession = defaultSessionLabel;
    if (doc.promotionHistory && doc.promotionHistory.length > 0) {
      const lastPromo = doc.promotionHistory[doc.promotionHistory.length - 1];
      if (lastPromo.session) {
        targetSession = normalizeSessionLabel(lastPromo.session);
      }
    }

    enrollment = {
      admissionNo,
      className,
      arm: "Main",
      sessionLabel: targetSession,
      status: EnrollmentStatus.ACTIVE,
    };
  }

  return { student, enrollment };
}

// --- Main Result Document Mapper ---

export function mapLegacyResult(
  doc: LegacyResultDoc,
  branchName: string,
): {
  results: MappedResult[];
  remark: MappedReportRemark | null;
} {
  const admissionNo = doc.studentNumber?.trim() || doc.studentUid?.trim();
  if (!admissionNo) {
    return { results: [], remark: null };
  }

  const className = normalizeClassName(doc.class);
  const sessionLabel = normalizeSessionLabel(doc.session);
  const { ordinal: termOrdinal } = normalizeTerm(doc.term);
  const isSecondary = branchName.toLowerCase().includes("secondary");
  const defaultExamMax = isSecondary ? 70 : 60;
  const defaultCaMax = isSecondary ? 30 : 40;

  const results: MappedResult[] = [];

  if (Array.isArray(doc.subjects)) {
    for (const sub of doc.subjects) {
      if (!sub || !sub.name) continue;
      const subjectName = normalizeSubjectName(sub.name);

      // Compute scores
      let caTotal = 0;
      let examScore = 0;
      let components: Array<{ name: string; max: number; score: number }> = [];

      if (Array.isArray(sub.tests) && sub.tests.length > 0) {
        components = sub.tests.map((t, idx) => ({
          name: t.name?.trim() || `Test ${idx + 1}`,
          max: typeof t.max === "number" && t.max > 0 ? t.max : 10,
          score: typeof t.score === "number" ? Math.max(0, t.score) : 0,
        }));
        caTotal = components.reduce((acc, c) => acc + c.score, 0);
      } else if (typeof sub.caTotal === "number") {
        caTotal = Math.max(0, sub.caTotal);
        components = [
          {
            name: "Continuous Assessment",
            max: defaultCaMax,
            score: caTotal,
          },
        ];
      }

      const examMax = doc.assessmentConfig?.examMax ?? defaultExamMax;
      const caMax = doc.assessmentConfig?.caMax ?? defaultCaMax;

      if (typeof sub.exam === "number") {
        examScore = Math.max(0, sub.exam);
      }

      // Clamping
      caTotal = Math.min(caMax, Math.round(caTotal * 100) / 100);
      examScore = Math.min(examMax, Math.round(examScore * 100) / 100);
      const total = Math.min(100, Math.round((caTotal + examScore) * 100) / 100);

      const { gradeLetter, gradeRemark } = determineGrade(total, sub.grade, sub.remark);

      results.push({
        studentAdmissionNo: admissionNo,
        subjectName,
        className,
        armName: "Main",
        sessionLabel,
        termOrdinal,
        componentScores: components,
        examScore,
        examMax,
        caTotal,
        total,
        maxScore: 100,
        gradeLetter,
        gradeRemark,
        status: ResultStatus.PUBLISHED,
      });
    }
  }

  let remark: MappedReportRemark | null = null;
  if (doc.teacherRemark?.trim() || doc.principalRemark?.trim()) {
    remark = {
      studentAdmissionNo: admissionNo,
      sessionLabel,
      termOrdinal,
      teacherRemark: doc.teacherRemark?.trim() || null,
      principalRemark: doc.principalRemark?.trim() || null,
    };
  }

  return { results, remark };
}

// --- Batch Dataset Mapper & Reconciliation Generator ---

export interface LegacyDatasetInput {
  branchName: string; // "Secondary (English)" | "Primary (English)"
  students: LegacyStudentDoc[];
  results: LegacyResultDoc[];
  defaultSessionLabel?: string;
}

export interface MappedDatasetOutput {
  summary: ReconciliationSummary;
  students: MappedStudent[];
  enrollments: MappedEnrollment[];
  classes: MappedClassGroup[];
  subjects: MappedSubject[];
  sessions: MappedSession[];
  results: MappedResult[];
  remarks: MappedReportRemark[];
}

export function mapLegacyDataset(input: LegacyDatasetInput): MappedDatasetOutput {
  const { branchName, students, results, defaultSessionLabel = "2024/2025" } = input;

  const studentMap = new Map<string, MappedStudent>();
  const enrollmentList: MappedEnrollment[] = [];
  const classMap = new Map<string, Set<string>>();
  const subjectSet = new Set<string>();
  const sessionSet = new Set<string>();
  const resultsList: MappedResult[] = [];
  const remarksList: MappedReportRemark[] = [];
  const gradeDistribution: Record<string, number> = {};
  const warnings: string[] = [];

  let duplicateStudentsSkipped = 0;
  let invalidResultsSkipped = 0;

  // 1. Map Students
  for (const sDoc of students) {
    if (!sDoc.uid && !sDoc.number) {
      warnings.push(`Student doc missing both uid and number; skipped.`);
      continue;
    }
    const { student, enrollment } = mapLegacyStudent(sDoc, branchName, defaultSessionLabel);
    if (studentMap.has(student.admissionNo)) {
      duplicateStudentsSkipped++;
      warnings.push(`Duplicate admissionNo/UID "${student.admissionNo}" found. Kept first occurrence.`);
      continue;
    }
    studentMap.set(student.admissionNo, student);

    if (enrollment) {
      enrollmentList.push(enrollment);
      if (!classMap.has(enrollment.className)) {
        classMap.set(enrollment.className, new Set());
      }
      classMap.get(enrollment.className)!.add(enrollment.arm);
      sessionSet.add(enrollment.sessionLabel);
    }
  }

  // 2. Map Results & Remarks
  for (const rDoc of results) {
    const admissionNo = rDoc.studentNumber?.trim() || rDoc.studentUid?.trim();
    if (!admissionNo) {
      invalidResultsSkipped++;
      warnings.push(`Result doc missing student UID/number; skipped.`);
      continue;
    }

    const { results: mappedResults, remark } = mapLegacyResult(rDoc, branchName);
    for (const res of mappedResults) {
      resultsList.push(res);
      subjectSet.add(res.subjectName);
      sessionSet.add(res.sessionLabel);
      if (!classMap.has(res.className)) {
        classMap.set(res.className, new Set());
      }
      classMap.get(res.className)!.add(res.armName);

      gradeDistribution[res.gradeLetter] = (gradeDistribution[res.gradeLetter] || 0) + 1;
    }

    if (remark) {
      remarksList.push(remark);
      sessionSet.add(remark.sessionLabel);
    }
  }

  // Build Classes
  const classes: MappedClassGroup[] = Array.from(classMap.entries())
    .map(([name, arms]) => ({
      name,
      sortOrder: computeClassSortOrder(name),
      armNames: Array.from(arms).length > 0 ? Array.from(arms) : ["Main"],
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  // Build Subjects
  const subjects: MappedSubject[] = Array.from(subjectSet)
    .map((name) => ({
      name,
      code: generateSubjectCode(name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build Sessions
  const sessions: MappedSession[] = Array.from(sessionSet)
    .map((label, idx) => buildSessionRecord(label, idx === 0))
    .sort((a, b) => b.label.localeCompare(a.label));

  const summary: ReconciliationSummary = {
    branchName,
    totalLegacyStudents: students.length,
    mappedStudents: studentMap.size,
    duplicateStudentsSkipped,
    totalLegacyResults: results.length,
    mappedResults: resultsList.length,
    invalidResultsSkipped,
    mappedRemarks: remarksList.length,
    classesIdentified: classes.map((c) => c.name),
    subjectsIdentified: subjects.map((s) => s.name),
    sessionsIdentified: sessions.map((s) => s.label),
    gradeDistribution,
    warnings,
  };

  return {
    summary,
    students: Array.from(studentMap.values()),
    enrollments: enrollmentList,
    classes,
    subjects,
    sessions,
    results: resultsList,
    remarks: remarksList,
  };
}
