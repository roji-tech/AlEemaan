import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// What a branch holds, for deleting it (the single-branch page). Nearly every table of the school points at `Branch` with `ON DELETE CASCADE`, so `branch.delete()` on a branch
// with pupils, results, invoices or forms would remove all of it in one statement. The rule is therefore the other way round: a branch can be deleted only when everything that
// points at it is *set-up*, never people or what happened. The tables are read from the database's own foreign keys, so a table added later is counted too, and — because it is not
// in `FOLDS_WITH_BRANCH` — it blocks until someone decides that it is set-up.

/// Rows of these tables are the branch's structure and set-up. They are removed with the branch, and the confirmation says how many there are.
export const FOLDS_WITH_BRANCH: ReadonlySet<string> = new Set([
  "Invitation",
  "Membership", // only the deactivated ones: an active membership is a person who still belongs here
  "AcademicSession",
  "AcademicPeriod",
  "ClassGroup",
  "ClassArm",
  "Section",
  "Subject",
  "SubjectOffering",
  "TimetableSlot",
  "AssessmentScheme",
  "AssessmentSchemeScope",
  "AssessmentSchemeDraft",
  "AssessmentComponent",
  "GradeScale",
  "GradeBand",
  "ResultApprovalScope",
  "AttendanceGrant",
  "AdminSelfApprovalGrant",
  "SettingValue",
  "SettingApproval",
  "SettingAudit",
  "VerificationPageConfig",
  "FeeStructure",
  "InvoiceCounter",
  "ReceiptCounter",
  "NotificationTemplate",
  "ProgramBranch",
]);

const NOUNS: Record<string, string> = {
  Membership: "active members",
  StudentRecord: "pupils",
  StudentEnrollment: "class placements",
  StaffRecord: "staff records",
  StaffSubjectAssignment: "teaching assignments",
  AttendanceRecord: "attendance records",
  Result: "results",
  ResultAudit: "result changes",
  ReportRemark: "report remarks",
  Invoice: "invoices",
  InvoiceDiscount: "invoice discounts",
  Payment: "payments",
  Announcement: "announcements",
  Form: "forms",
  FormResponse: "form responses",
  Assignment: "assignments",
  AssignmentSubmission: "assignment submissions",
  LearningMaterial: "learning materials",
  Quiz: "quizzes",
  QuizAttempt: "quiz attempts",
  PracticeSession: "practice sessions",
  Program: "programs",
  PromotionBatch: "promotion batches",
  QuestionBankItem: "questions in the question bank",
  GuardianLinkToken: "guardian links",
  NotificationDispatch: "messages sent",
  NotificationAuditLog: "message audit records",
  AcademicSession: "academic sessions",
  AcademicPeriod: "terms",
  ClassGroup: "classes",
  ClassArm: "class arms",
  Section: "sections",
  Subject: "subjects",
  SubjectOffering: "subject offerings",
  TimetableSlot: "timetable slots",
  AssessmentScheme: "assessment schemes",
  GradeScale: "grade scales",
  GradeBand: "grade bands",
  Invitation: "invitations",
  FeeStructure: "fee items",
  SettingValue: "settings",
};
export const holdingLabel = (table: string, deactivatedMembers = false): string => {
  if (table === "Membership" && deactivatedMembers) return "deactivated memberships";
  return NOUNS[table] ?? `${table.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} records`;
};

export type Holding = { label: string; count: number; /** true: this stops the branch from being deleted */ blocks: boolean };

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;
const quote = (identifier: string) => Prisma.raw(`"${identifier.replaceAll('"', '""')}"`);

let foreignKeys: Promise<{ table: string; column: string }[]> | undefined;
/// Every column of every table that references Branch(id), from the catalog. The schema does not change while the process runs, so it is read once.
function referencingColumns(db: Db) {
  foreignKeys ??= db
    .$queryRaw<{ tbl: string; col: string }[]>(
      Prisma.sql`SELECT cl.relname AS tbl, a.attname AS col
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = current_schema()
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.confrelid = to_regclass('"Branch"')
        ORDER BY cl.relname`,
    )
    .then((rows) => rows.map((r) => ({ table: r.tbl, column: r.col })))
    .catch((error) => {
      foreignKeys = undefined; // do not remember a failure
      throw error;
    });
  return foreignKeys;
}

/// How a count of rows in one table counts for the branch. Pure, so the rule can be tested without a database.
export function toHolding(table: string, count: number, deactivatedMembers = false): Holding | null {
  if (count <= 0) return null;
  const active = table === "Membership" && !deactivatedMembers;
  return { label: holdingLabel(table, deactivatedMembers), count, blocks: active || !FOLDS_WITH_BRANCH.has(table) };
}

/// Everything that points at the branch and is not empty: blocking ones first, each group by name. One query, however many tables there are.
export async function branchHoldings(db: Db = prisma, branchId: string): Promise<Holding[]> {
  const columns = await referencingColumns(db);
  const parts = columns.flatMap(({ table, column }) =>
    table === "Membership"
      ? [
          Prisma.sql`SELECT ${table} AS t, false AS deactivated, count(*)::int AS n FROM ${quote(table)} WHERE ${quote(column)} = ${branchId} AND "deactivatedAt" IS NULL`,
          Prisma.sql`SELECT ${table} AS t, true AS deactivated, count(*)::int AS n FROM ${quote(table)} WHERE ${quote(column)} = ${branchId} AND "deactivatedAt" IS NOT NULL`,
        ]
      : [
          Prisma.sql`SELECT ${table} AS t, false AS deactivated, count(*)::int AS n FROM ${quote(table)} WHERE ${quote(column)} = ${branchId}`,
        ],
  );
  const rows = await db.$queryRaw<{ t: string; deactivated: boolean; n: number }[]>(Prisma.join(parts, " UNION ALL "));
  return rows
    .map((r) => toHolding(r.t, r.n, r.deactivated))
    .filter((h): h is Holding => h !== null)
    .sort((a, b) => Number(b.blocks) - Number(a.blocks) || a.label.localeCompare(b.label));
}
