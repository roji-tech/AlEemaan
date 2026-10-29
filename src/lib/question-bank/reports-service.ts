import { Prisma, QuestionReportOutcome, QuestionReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { getEffectiveBankSettings } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { staffMaySee, reviewPower } from "@/lib/question-bank/rules";
import {
  sanitizeReportReason,
  maskReporterForReviewer,
  pupilCellsAtMinimum,
  reportCell,
  computeRegradeImpact,
  validateReportOutcome,
  type RegradeImpactSummary,
} from "./reports";

export class ReportServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "REPORT_ERROR",
  ) {
    super(message);
    this.name = "ReportServiceError";
  }
}

const ALREADY_REPORTED = "You have already reported this question; your report is waiting for a reviewer.";

/// Serialises the reports of one person on one question, so two sent at the same moment are one: the check for an open report and the filing of a new one are made together, inside the
/// transaction, with this lock held until it ends.
async function lockReporter(tx: Prisma.TransactionClient, reporter: string, itemId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report:${reporter}:${itemId}`}::text))`;
}

/**
 * Submits a question issue report as a teacher. A person has one open report on a question: another is refused (`ALREADY_REPORTED`) until a reviewer has resolved the first.
 */
export async function reportQuestionAsTeacher(params: {
  userId: string;
  branchId: string;
  itemId: string;
  reason: string;
}) {
  const settings = await getEffectiveBankSettings(params.branchId);
  if (!settings["bank.reports.teachers"]) {
    throw new ReportServiceError("Question reporting by teachers is currently disabled.", 403, "REPORTS_DISABLED");
  }

  const sanitized = sanitizeReportReason(params.reason);
  if (!sanitized.ok) {
    throw new ReportServiceError(sanitized.message, 400, "VALIDATION");
  }

  const [viewer, item, branch] = await Promise.all([
    loadViewer(params.userId),
    prisma.questionBankItem.findUnique({
      where: { id: params.itemId },
      select: {
        id: true,
        branchId: true,
        subjectKey: true,
        status: true,
        visibility: true,
        visibleFrom: true,
        submittedById: true,
        version: true,
      },
    }),
    prisma.branch.findUnique({
      where: { id: params.branchId },
      select: { name: true },
    }),
  ]);

  if (!item) {
    throw new ReportServiceError("Question not found.", 404, "NOT_FOUND");
  }

  if (!staffMaySee(viewer, item, new Date())) {
    throw new ReportServiceError("You are not authorized to view or report this question.", 403, "FORBIDDEN");
  }

  const sectionName = branch?.name ?? "Main Branch";

  const report = await prisma.$transaction(async (tx) => {
    await lockReporter(tx, `user:${params.userId}`, item.id);
    const open = await tx.questionReport.findFirst({
      where: { itemId: item.id, reporterUserId: params.userId, status: QuestionReportStatus.OPEN },
      select: { id: true },
    });
    if (open) throw new ReportServiceError(ALREADY_REPORTED, 400, "ALREADY_REPORTED");

    const created = await tx.questionReport.create({
      data: {
        branchId: item.branchId ?? params.branchId,
        itemId: item.id,
        itemVersion: item.version,
        reporterRole: "TEACHER",
        reporterSection: sectionName,
        reporterUserId: params.userId,
        reason: sanitized.cleanText,
        status: QuestionReportStatus.OPEN,
      },
    });

    await writeBankAudit(tx, {
      entity: "ITEM",
      action: "REPORT_FILED",
      branchId: item.branchId ?? params.branchId,
      itemId: item.id,
      ref: created.id,
      actorUserId: params.userId,
      newValue: {
        reportId: created.id,
        role: "TEACHER",
        section: sectionName,
      },
    });

    return created;
  });

  return { ok: true, reportId: report.id };
}

/**
 * Submits a question issue report as a pupil from practice. One open report on a question per pupil (`ALREADY_REPORTED`); the version recorded is the one the pupil last practised.
 * The section a reviewer may later see is the section of the pupil's class, or the branch's name when the class has none: never the class itself.
 */
export async function reportQuestionAsPupil(params: {
  studentId: string;
  branchId: string;
  itemId: string;
  reason: string;
}) {
  const settings = await getEffectiveBankSettings(params.branchId);
  if (!settings["bank.reports.pupils"]) {
    throw new ReportServiceError("Question reporting by pupils is currently disabled.", 403, "REPORTS_DISABLED");
  }

  const sanitized = sanitizeReportReason(params.reason);
  if (!sanitized.ok) {
    throw new ReportServiceError(sanitized.message, 400, "VALIDATION");
  }

  // Invariant §8.5: Pupils can only report questions they have practised
  const [attempt, item, student, enrollment] = await Promise.all([
    prisma.practiceAttempt.findFirst({
      where: {
        studentId: params.studentId,
        bankItemId: params.itemId,
      },
      orderBy: { answeredAt: "desc" },
      select: { id: true, version: true },
    }),
    prisma.questionBankItem.findUnique({
      where: { id: params.itemId },
      select: { id: true, branchId: true, version: true },
    }),
    prisma.studentRecord.findUnique({
      where: { id: params.studentId },
      include: { branch: { select: { name: true } } },
    }),
    prisma.studentEnrollment.findFirst({
      where: { studentId: params.studentId },
      orderBy: { enrolledAt: "desc" },
      include: {
        classArm: {
          include: {
            classGroup: {
              include: { section: { select: { name: true } } },
            },
          },
        },
      },
    }),
  ]);

  if (!item) {
    throw new ReportServiceError("Question not found.", 404, "NOT_FOUND");
  }

  if (!attempt) {
    throw new ReportServiceError("Pupils can only report questions they have practised.", 400, "NOT_PRACTISED");
  }

  const sectionName = enrollment?.classArm?.classGroup?.section?.name ?? student?.branch?.name ?? "General";

  const report = await prisma.$transaction(async (tx) => {
    await lockReporter(tx, `pupil:${params.studentId}`, item.id);
    const open = await tx.questionReport.findFirst({
      where: { itemId: item.id, reporterStudentId: params.studentId, status: QuestionReportStatus.OPEN },
      select: { id: true },
    });
    if (open) throw new ReportServiceError(ALREADY_REPORTED, 400, "ALREADY_REPORTED");

    const created = await tx.questionReport.create({
      data: {
        branchId: item.branchId ?? params.branchId,
        itemId: item.id,
        itemVersion: attempt.version,
        reporterRole: "PUPIL",
        reporterSection: sectionName,
        reporterStudentId: params.studentId,
        reason: sanitized.cleanText,
        status: QuestionReportStatus.OPEN,
      },
    });

    await writeBankAudit(tx, {
      entity: "ITEM",
      action: "REPORT_FILED",
      branchId: item.branchId ?? params.branchId,
      itemId: item.id,
      ref: created.id,
      actorUserId: null,
      newValue: {
        reportId: created.id,
        role: "PUPIL",
        section: sectionName,
      },
    });

    return created;
  });

  return { ok: true, reportId: report.id };
}

/**
 * Lists question reports for reviewers with masked reporter identity (NDPA compliance). The queue is the reviewers': a report is listed only for a person who may review its question
 * (`reviewPower`: the rule that lets them resolve it, and the one the queue of pending questions uses); anyone else gets an empty list. A pupil's report names the pupil's section only
 * once at least `bank.smallSummary.min` different pupils of it have reported the question (`pupilCellsAtMinimum`), otherwise the reviewer sees "Pupil".
 */
export async function listReportsForReviewer(params: {
  userId: string;
  branchId?: string | null;
  status?: QuestionReportStatus | "ALL";
  itemId?: string;
}) {
  const viewer = await loadViewer(params.userId);
  const where: Prisma.QuestionReportWhereInput = {};

  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  } else if (!params.status) {
    where.status = QuestionReportStatus.OPEN;
  }

  if (params.itemId) {
    where.itemId = params.itemId;
  }

  if (params.branchId) {
    where.OR = [{ branchId: params.branchId }, { branchId: null }];
  } else if (!viewer.isSuperAdmin) {
    const branchIds = viewer.memberships.map((m) => m.branchId);
    where.OR = [{ branchId: { in: branchIds } }, { branchId: null }];
  }

  const found = await prisma.questionReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      item: {
        select: {
          id: true,
          branchId: true,
          subjectKey: true,
          prompt: true,
          type: true,
          subjectLabel: true,
          topic: true,
          version: true,
          status: true,
        },
      },
      branch: { select: { name: true } },
    },
  });

  const reports = found.filter((r) => reviewPower(viewer, { branchId: r.item.branchId, subjectKey: r.item.subjectKey }).mayReview);

  // Calculate re-grade impact for items that have reports
  const itemIds = [...new Set(reports.map((r) => r.itemId))];
  const copiedQuestions = await prisma.quizQuestion.findMany({
    where: { sourceItemId: { in: itemIds } },
    select: {
      sourceItemId: true,
      id: true,
      quizId: true,
      quiz: { select: { title: true, _count: { select: { attempts: true } } } },
    },
  });

  const impactMap = new Map<string, RegradeImpactSummary>();
  for (const itemId of itemIds) {
    const matches = copiedQuestions
      .filter((q) => q.sourceItemId === itemId)
      .map((q) => ({
        quizId: q.quizId,
        quizTitle: q.quiz.title,
        questionId: q.id,
        attemptsCount: q.quiz._count.attempts,
      }));
    impactMap.set(itemId, computeRegradeImpact(matches));
  }

  // How many different pupils of a section have reported a question counts every pupil report of it, whatever its status and whatever the list was filtered to.
  const pupilReports = itemIds.length
    ? await prisma.questionReport.findMany({
        where: { itemId: { in: itemIds }, reporterRole: "PUPIL" },
        select: { itemId: true, reporterSection: true, reporterStudentId: true },
      })
    : [];
  const minimumByBranch = new Map<string | null, number>();
  for (const branchId of new Set(reports.map((r) => r.branchId))) {
    minimumByBranch.set(branchId, (await getEffectiveBankSettings(branchId))["bank.smallSummary.min"]);
  }
  const named = new Map<number, Set<string>>();
  const namedAt = (minimum: number) => {
    if (!named.has(minimum)) named.set(minimum, pupilCellsAtMinimum(pupilReports, minimum));
    return named.get(minimum)!;
  };

  return reports.map((r) => ({
    id: r.id,
    itemId: r.itemId,
    itemVersion: r.itemVersion,
    item: {
      id: r.item.id,
      prompt: r.item.prompt,
      type: r.item.type,
      subjectLabel: r.item.subjectLabel,
      topic: r.item.topic,
      version: r.item.version,
      status: r.item.status,
    },
    reason: r.reason,
    status: r.status,
    outcome: r.outcome,
    outcomeReason: r.outcomeReason,
    reporter: maskReporterForReviewer({
      reporterRole: r.reporterRole as "TEACHER" | "PUPIL",
      reporterSection: r.reporterSection,
      branchName: r.branch?.name,
      showSection: r.reporterRole !== "PUPIL" || namedAt(minimumByBranch.get(r.branchId)!).has(reportCell(r.itemId, r.reporterSection)),
    }),
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    regradeImpact: impactMap.get(r.itemId) ?? null,
  }));
}

/**
 * Resolves a question report with an outcome, reason, and optional assessment re-grade offer. A report is resolved once: the report is claimed with a conditional update inside the
 * transaction (it must still be open), so reviewers resolving it at the same moment cannot each succeed, write an audit row and apply a re-grade.
 */
export async function resolveQuestionReport(params: {
  userId: string;
  reportId: string;
  outcome: QuestionReportOutcome;
  outcomeReason: string;
  applyRegrade?: boolean;
}) {
  const validated = validateReportOutcome(params.outcome, params.outcomeReason);
  if (!validated.ok) {
    throw new ReportServiceError(validated.message, 400, "VALIDATION");
  }

  const [viewer, report] = await Promise.all([
    loadViewer(params.userId),
    prisma.questionReport.findUnique({
      where: { id: params.reportId },
      include: { item: { select: { id: true, branchId: true, subjectKey: true } } },
    }),
  ]);

  if (!report) {
    throw new ReportServiceError("Report not found.", 404, "NOT_FOUND");
  }

  if (report.status !== QuestionReportStatus.OPEN) {
    throw new ReportServiceError("This report has already been resolved or dismissed.", 400, "ALREADY_RESOLVED");
  }

  const power = reviewPower(viewer, report.item);
  if (!power.mayReview) {
    throw new ReportServiceError("You are not authorized to resolve reports for this question.", 403, "FORBIDDEN");
  }

  let regradeCount = 0;

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.questionReport.updateMany({
      where: { id: report.id, status: QuestionReportStatus.OPEN },
      data: {
        status: validated.targetStatus,
        outcome: validated.outcome,
        outcomeReason: validated.outcomeReason,
        resolvedById: params.userId,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ReportServiceError("This report has already been resolved or dismissed.", 400, "ALREADY_RESOLVED");
    }

    // If FIXED and applyRegrade requested, update linked quiz questions
    if (params.applyRegrade && validated.outcome === QuestionReportOutcome.FIXED) {
      const updatedQuestions = await tx.quizQuestion.updateMany({
        where: { sourceItemId: report.itemId },
        data: { exposedToPractice: true },
      });
      regradeCount = updatedQuestions.count;
    }

    const updated = await tx.questionReport.findUniqueOrThrow({ where: { id: report.id } });

    await writeBankAudit(tx, {
      entity: "ITEM",
      action: "REPORT_RESOLVED",
      branchId: report.branchId,
      itemId: report.itemId,
      ref: report.id,
      actorUserId: params.userId,
      oldValue: { status: report.status },
      newValue: {
        status: validated.targetStatus,
        outcome: validated.outcome,
        outcomeReason: validated.outcomeReason,
        regradeApplied: Boolean(params.applyRegrade),
      },
    });

    return updated;
  });

  return {
    ok: true,
    reportId: result.id,
    status: result.status,
    outcome: result.outcome,
    outcomeReason: result.outcomeReason,
    regradeCount,
  };
}

/**
 * Returns reports filed by a pupil with outcomes visible to the student.
 */
export async function getPupilReportHistory(params: {
  studentId: string;
}) {
  const reports = await prisma.questionReport.findMany({
    where: { reporterStudentId: params.studentId },
    orderBy: { createdAt: "desc" },
    include: {
      item: {
        select: {
          prompt: true,
          subjectLabel: true,
          topic: true,
        },
      },
    },
  });

  return reports.map((r) => ({
    id: r.id,
    questionPrompt: r.item.prompt,
    subjectLabel: r.item.subjectLabel,
    topic: r.item.topic,
    reason: r.reason,
    status: r.status,
    outcome: r.outcome,
    outcomeReason: r.outcomeReason,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
  }));
}
