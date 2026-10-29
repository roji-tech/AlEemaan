import { Prisma, QuestionReportOutcome, QuestionReportStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { getEffectiveBankSettings } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { staffMaySee, reviewPower } from "@/lib/question-bank/rules";
import { copyFromBankItem, type BankItemToCopy } from "./assessments";
import { startOfSchoolDay } from "./school-day";
import { MAX_REGRADE_ATTEMPTS, groupChanges, planAttemptRegrade, type AttemptChange } from "./regrade";
import {
  sanitizeReportReason,
  maskReporterForReviewer,
  pupilCellsAtMinimum,
  reportCell,
  reportLimitReached,
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

/// Serialises the reports of one person, so two sent at the same moment are one and cannot slip past the limits: the checks (one open report per question, how many in all) and the filing
/// of a new report are made together, inside the transaction, with this lock held until it ends.
async function lockReporter(tx: Prisma.TransactionClient, reporter: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report:${reporter}`}::text))`;
}

/// Refuses a report from a person who has too many waiting or has made too many today (429 `REPORT_LIMIT`). `who` is the filter that picks out their reports.
async function enforceReportLimits(tx: Prisma.TransactionClient, role: "PUPIL" | "TEACHER", who: Prisma.QuestionReportWhereInput) {
  const [openCount, todayCount] = await Promise.all([
    tx.questionReport.count({ where: { ...who, status: QuestionReportStatus.OPEN } }),
    tx.questionReport.count({ where: { ...who, createdAt: { gte: startOfSchoolDay() } } }),
  ]);
  const reached = reportLimitReached(role, openCount, todayCount);
  if (reached === "OPEN") {
    throw new ReportServiceError("You have too many reports waiting for a reviewer. Wait until some are answered.", 429, "REPORT_LIMIT");
  }
  if (reached === "DAY") {
    throw new ReportServiceError("You have made the most reports allowed in a day. Try again tomorrow.", 429, "REPORT_LIMIT");
  }
}

/**
 * Submits a question issue report as a teacher. A person has one open report on a question: another is refused (`ALREADY_REPORTED`) until a reviewer has resolved the first. A teacher may have
 * 20 reports waiting and make 50 a day (`REPORT_LIMIT`, 429).
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
    await lockReporter(tx, `user:${params.userId}`);
    const open = await tx.questionReport.findFirst({
      where: { itemId: item.id, reporterUserId: params.userId, status: QuestionReportStatus.OPEN },
      select: { id: true },
    });
    if (open) throw new ReportServiceError(ALREADY_REPORTED, 400, "ALREADY_REPORTED");
    await enforceReportLimits(tx, "TEACHER", { reporterUserId: params.userId, reporterRole: "TEACHER" });

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
 * Submits a question issue report as a pupil from practice. One open report on a question per pupil (`ALREADY_REPORTED`); at most 10 waiting and 20 a day (`REPORT_LIMIT`, 429); the version recorded is the one the pupil last practised.
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
    await lockReporter(tx, `pupil:${params.studentId}`);
    const open = await tx.questionReport.findFirst({
      where: { itemId: item.id, reporterStudentId: params.studentId, status: QuestionReportStatus.OPEN },
      select: { id: true },
    });
    if (open) throw new ReportServiceError(ALREADY_REPORTED, 400, "ALREADY_REPORTED");
    await enforceReportLimits(tx, "PUPIL", { reporterStudentId: params.studentId });

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

export interface CorrectionSummary {
  copiesCorrected: number;
  attemptsChecked: number;
  attemptsChanged: number;
  attemptsUnreadable: number;
  skippedArchived: number;
}

/// How many changed attempts the audit row lists one by one (the counts always cover all of them).
const AUDITED_CHANGES = 200;

/**
 * Puts the corrected question into the assessments that copied it, and scores the attempts already made again. An exception to "past papers are immutable", so it is narrow:
 *   - only the copies in the BRANCH the report came from (a general question may be copied in other branches; their teachers are not changed under them);
 *   - only copies that are behind the question's version, and not in archived quizzes (past papers), which are counted and left as they were;
 *   - a copy takes the corrected prompt, type, options and key; its points are the quiz's own and stay, and so does its place in the quiz;
 *   - the finished attempts of the affected quizzes are scored again with the rule a quiz is graded by (`planAttemptRegrade`); attempts whose stored answers cannot be read are left alone;
 *   - more than `MAX_REGRADE_ATTEMPTS` attempts are refused before anything is written (`TOO_MANY_ATTEMPTS`): the correction is all or nothing, and runs in the report's transaction;
 *   - what was done is written to the audit trail with the scores before and after.
 */
async function applyCorrection(
  tx: Prisma.TransactionClient,
  p: { reportId: string; branchId: string | null; itemId: string; actorUserId: string },
): Promise<CorrectionSummary> {
  const none: CorrectionSummary = { copiesCorrected: 0, attemptsChecked: 0, attemptsChanged: 0, attemptsUnreadable: 0, skippedArchived: 0 };
  const item = await tx.questionBankItem.findUniqueOrThrow({ where: { id: p.itemId } });
  const branchId = p.branchId;
  if (!branchId) return none;

  const behind = { sourceItemId: item.id, branchId, OR: [{ sourceVersion: null }, { sourceVersion: { lt: item.version } }] };
  const [skippedArchived, copies] = await Promise.all([
    tx.quizQuestion.count({ where: { ...behind, quiz: { archivedAt: { not: null } } } }),
    tx.quizQuestion.findMany({ where: { ...behind, quiz: { archivedAt: null } }, select: { id: true, quizId: true } }),
  ]);
  if (copies.length === 0) {
    await auditCorrection(tx, p, item.version, { ...none, skippedArchived }, []);
    return { ...none, skippedArchived };
  }

  const quizIds = [...new Set(copies.map((c) => c.quizId))];
  const finished = { branchId, quizId: { in: quizIds }, completedAt: { not: null } };
  const attemptCount = await tx.quizAttempt.count({ where: finished });
  if (attemptCount > MAX_REGRADE_ATTEMPTS) {
    throw new ReportServiceError(
      `This correction would score ${attemptCount} attempts again; the most one correction does is ${MAX_REGRADE_ATTEMPTS}. Nothing was changed.`,
      400,
      "TOO_MANY_ATTEMPTS",
    );
  }

  const corrected = copyFromBankItem(item as unknown as BankItemToCopy);
  await tx.quizQuestion.updateMany({
    where: { id: { in: copies.map((c) => c.id) } },
    data: {
      prompt: corrected.prompt,
      questionType: corrected.questionType,
      options: corrected.options,
      correctAnswer: corrected.correctAnswer,
      sourceVersion: corrected.sourceVersion,
    },
  });

  // The quizzes are read after the copies are corrected, so the attempts are scored against the questions as they now are.
  const [quizzes, attempts] = await Promise.all([
    tx.quiz.findMany({
      where: { branchId, id: { in: quizIds } },
      select: { id: true, passingScore: true, questions: { select: { id: true, correctAnswer: true, points: true } } },
    }),
    tx.quizAttempt.findMany({ where: finished, select: { id: true, quizId: true, answers: true, score: true, isPassed: true } }),
  ]);
  const changes: AttemptChange[] = [];
  let unreadable = 0;
  for (const quiz of quizzes) {
    const plan = planAttemptRegrade(quiz.questions, quiz.passingScore, attempts.filter((a) => a.quizId === quiz.id));
    changes.push(...plan.changes);
    unreadable += plan.unreadable;
  }
  for (const group of groupChanges(changes)) {
    await tx.quizAttempt.updateMany({ where: { branchId, id: { in: group.attemptIds } }, data: { score: group.score, isPassed: group.isPassed } });
  }

  const summary: CorrectionSummary = {
    copiesCorrected: copies.length,
    attemptsChecked: attempts.length,
    attemptsChanged: changes.length,
    attemptsUnreadable: unreadable,
    skippedArchived,
  };
  await auditCorrection(tx, p, item.version, summary, changes);
  return summary;
}

async function auditCorrection(
  tx: Prisma.TransactionClient,
  p: { reportId: string; branchId: string | null; itemId: string; actorUserId: string },
  itemVersion: number,
  summary: CorrectionSummary,
  changes: AttemptChange[],
) {
  await writeBankAudit(tx, {
    entity: "ITEM",
    action: "REGRADE_APPLIED",
    branchId: p.branchId,
    itemId: p.itemId,
    ref: p.reportId,
    actorUserId: p.actorUserId,
    newValue: {
      itemVersion,
      ...summary,
      changes: changes.slice(0, AUDITED_CHANGES),
      changesTruncated: changes.length > AUDITED_CHANGES,
    } as unknown as Prisma.InputJsonValue,
  });
}

/**
 * Resolves a question report with an outcome, reason, and optional correction of the assessments that copied the question. A report is resolved once: the report is claimed with a
 * conditional update inside the transaction (it must still be open), so reviewers resolving it at the same moment cannot each succeed, write an audit row and apply a re-grade.
 *
 * `applyRegrade` is the explicit exception to "past papers are immutable" (see `applyCorrection`): only for a report resolved as FIXED and a question that is APPROVED; all or nothing.
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

  if (params.applyRegrade && validated.outcome !== QuestionReportOutcome.FIXED) {
    throw new ReportServiceError("A correction can only be applied to assessments when the report is resolved as fixed.", 400, "VALIDATION");
  }

  const [viewer, report] = await Promise.all([
    loadViewer(params.userId),
    prisma.questionReport.findUnique({
      where: { id: params.reportId },
      include: { item: { select: { id: true, branchId: true, subjectKey: true, status: true } } },
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

  if (params.applyRegrade && report.item.status !== "APPROVED") {
    throw new ReportServiceError("Approve the corrected question before applying it to assessments.", 400, "ITEM_NOT_APPROVED");
  }

  let regrade: CorrectionSummary | null = null;

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

    // FIXED with the correction asked for: the copies are corrected and the attempts scored again, in this same transaction
    if (params.applyRegrade) {
      regrade = await applyCorrection(tx, { reportId: report.id, branchId: report.branchId, itemId: report.itemId, actorUserId: params.userId });
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
  }, { timeout: 60_000, maxWait: 10_000 });

  return {
    ok: true,
    reportId: result.id,
    status: result.status,
    outcome: result.outcome,
    outcomeReason: result.outcomeReason,
    regradeCount: (regrade as CorrectionSummary | null)?.copiesCorrected ?? 0,
    regrade: regrade as CorrectionSummary | null,
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
