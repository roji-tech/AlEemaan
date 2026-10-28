import { prisma } from "@/lib/db";
import {
  PrintTargetKind,
  Role,
  BankVisibility,
} from "@prisma/client";
import {
  canPrintTarget,
  canPupilPrintAttempt,
  generateWatermarkText,
  generateExamPdf,
  type PrintableDocument,
  type PrintableQuestion,
} from "@/lib/question-bank/printing";

export class PrintingServiceError extends Error {
  statusCode: number;
  code?: string;
  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = "PrintingServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Checks whether a user holds active Exam Approver credentials for a branch.
 * (Design §6, §7.7, §8.1: Exam approvers can view overlap flags and print exam questions during the exam window).
 */
export async function isUserExamApprover(userId: string, branchId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  if (user?.isSuperAdmin) {
    return true;
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, branchId, deactivatedAt: null },
    select: { role: true },
  });
  if (membership?.role === Role.ADMIN) {
    return true;
  }

  const reviewer = await prisma.questionBankReviewer.findFirst({
    where: {
      userId,
      isExamApprover: true,
      OR: [{ branchId }, { branchId: null }],
    },
  });

  return Boolean(reviewer);
}

/**
 * Loads the effective near-exam days configuration for a branch (default 7).
 */
export async function getNearExamDays(branchId: string): Promise<number> {
  const setting = await prisma.settingValue.findFirst({
    where: {
      key: "bank.print.nearExamDays",
      OR: [{ branchId }, { scope: "GLOBAL" }],
    },
    orderBy: { scope: "desc" }, // branch-specific overrides global
  });

  if (setting && typeof setting.value === "number" && setting.value >= 0) {
    return setting.value;
  }
  if (setting && typeof setting.value === "string") {
    const parsed = parseInt(setting.value, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }
  return 7;
}

/**
 * Extracts clean string array of options from JSON options column.
 */
function extractOptions(optionsJson: unknown): string[] {
  if (!Array.isArray(optionsJson)) return [];
  return optionsJson.map((opt: unknown) => {
    if (typeof opt === "string") return opt;
    if (typeof opt === "object" && opt !== null && "text" in opt) {
      return String((opt as { text: unknown }).text);
    }
    return String(opt);
  });
}

export interface PrintTargetParams {
  branchId: string;
  userId: string;
  targetKind: PrintTargetKind;
  targetId: string;
  includeAnswerKey?: boolean;
  reason?: string;
  recipientStudentId?: string;
  ipAddress?: string;
  userAgent?: string;
  now?: Date;
}

/**
 * Staff printing service: validates permissions (including near-exam restrictions),
 * compiles printable question layout, formats tamper-evident watermarks, generates PDF bytes,
 * and records an append-only audit log row in QuestionBankPrintLog.
 */
export async function printTarget(params: PrintTargetParams): Promise<{
  pdfBuffer: Buffer;
  logId: string;
  watermark: string;
  pageCount: number;
  title: string;
}> {
  const now = params.now ?? new Date();

  // 1. Verify caller user & active branch membership
  const [user, membership, branch] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, name: true, email: true, isSuperAdmin: true },
    }),
    prisma.membership.findFirst({
      where: { userId: params.userId, branchId: params.branchId, deactivatedAt: null },
      select: { role: true },
    }),
    prisma.branch.findUnique({
      where: { id: params.branchId },
      select: { id: true, name: true },
    }),
  ]);

  if (!user || (!membership && !user.isSuperAdmin)) {
    throw new PrintingServiceError("User is not an active staff member of this branch.", 403, "FORBIDDEN");
  }
  if (!branch) {
    throw new PrintingServiceError("Branch not found.", 404, "NOT_FOUND");
  }

  const isExamApprover = await isUserExamApprover(params.userId, params.branchId);
  const nearExamDays = await getNearExamDays(params.branchId);

  // 2. Validate recipient pupil if specified (Handout release per §7.7)
  let recipientStudent: { firstName: string; lastName: string; admissionNo: string } | null = null;
  if (params.recipientStudentId) {
    recipientStudent = await prisma.studentRecord.findFirst({
      where: { id: params.recipientStudentId, branchId: params.branchId },
      select: { firstName: true, lastName: true, admissionNo: true },
    });
    if (!recipientStudent) {
      throw new PrintingServiceError("Recipient student not found in this branch.", 404, "NOT_FOUND");
    }
  }

  // 3. Resolve target facts and printable questions
  let docTitle = "";
  let docInstructions: string | null = null;
  let docTotalPoints = 0;
  let kindLabel = "ASSESSMENT & PRACTICE";
  const printableQuestions: PrintableQuestion[] = [];

  switch (params.targetKind) {
    case PrintTargetKind.QUESTION_BANK_ITEM: {
      const item = await prisma.questionBankItem.findUnique({
        where: { id: params.targetId },
        include: { branch: true },
      });
      if (!item) {
        throw new PrintingServiceError("Question bank item not found.", 404, "NOT_FOUND");
      }
      if (item.branchId !== null && item.branchId !== params.branchId) {
        throw new PrintingServiceError("Cross-branch item access denied.", 403, "FORBIDDEN");
      }

      // Check linked assessment if TEACHERS_ONLY_UNTIL
      let examWindowStart: Date | null = null;
      let examWindowEnd: Date | null = null;
      if (item.visibility === BankVisibility.TEACHERS_ONLY_UNTIL && item.visibleAfterQuizId) {
        const linkedQuiz = await prisma.quiz.findUnique({
          where: { id: item.visibleAfterQuizId },
          select: { examWindowStart: true, examWindowEnd: true },
        });
        if (linkedQuiz) {
          examWindowStart = linkedQuiz.examWindowStart;
          examWindowEnd = linkedQuiz.examWindowEnd;
        }
      }

      const permCheck = canPrintTarget(
        {
          isExam: item.visibility === BankVisibility.TEACHERS_ONLY,
          visibility: item.visibility,
          examWindowStart,
          examWindowEnd,
          authorUserId: item.submittedById,
        },
        {
          userId: params.userId,
          role: membership?.role ?? Role.TEACHING_STAFF,
          isSuperAdmin: user.isSuperAdmin,
          isExamApprover,
        },
        nearExamDays,
        now,
      );

      if (!permCheck.allowed) {
        throw new PrintingServiceError(permCheck.reason ?? "Printing restricted during exam window.", 403, "FORBIDDEN");
      }

      docTitle = `Question #${item.version}: ${item.topic || item.subjectLabel || "General"}`;
      docTotalPoints = item.points;
      kindLabel = "QUESTION BANK ITEM";

      let correctAnswerStr: string | null = null;
      if (params.includeAnswerKey) {
        if (typeof item.correctAnswer === "string") correctAnswerStr = item.correctAnswer;
        else if (Array.isArray(item.correctAnswer)) correctAnswerStr = item.correctAnswer.join(", ");
        else if (item.correctAnswer !== null) correctAnswerStr = JSON.stringify(item.correctAnswer);
      }

      printableQuestions.push({
        prompt: item.prompt,
        points: item.points,
        questionType: item.type,
        options: extractOptions(item.options),
        correctAnswer: correctAnswerStr,
        explanation: params.includeAnswerKey ? item.explanation : null,
      });
      break;
    }

    case PrintTargetKind.FORM: {
      const form = await prisma.form.findFirst({
        where: { id: params.targetId, branchId: params.branchId },
        include: {
          questions: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!form) {
        throw new PrintingServiceError("Form not found in this branch.", 404, "NOT_FOUND");
      }

      const permCheck = canPrintTarget(
        {
          isExam: false,
          examWindowStart: form.opensAt,
          examWindowEnd: form.closesAt,
          authorUserId: form.createdById,
        },
        {
          userId: params.userId,
          role: membership?.role ?? Role.TEACHING_STAFF,
          isSuperAdmin: user.isSuperAdmin,
          isExamApprover,
        },
        nearExamDays,
        now,
      );

      if (!permCheck.allowed) {
        throw new PrintingServiceError(permCheck.reason ?? "Printing restricted.", 403, "FORBIDDEN");
      }

      docTitle = form.title;
      docInstructions = form.instructions;
      kindLabel = form.kind === "PAPER_WORK" ? "PAPER WORK ASSIGNMENT" : form.kind === "QUESTIONNAIRE" ? "SURVEY & QUESTIONNAIRE" : "PRACTICE SET";

      for (const q of form.questions) {
        docTotalPoints += q.points;
        printableQuestions.push({
          prompt: q.prompt,
          points: q.points,
          questionType: q.questionType,
          options: extractOptions(q.options),
          correctAnswer: params.includeAnswerKey ? q.correctAnswer : null,
          explanation: params.includeAnswerKey ? q.explanation : null,
        });
      }
      break;
    }

    case PrintTargetKind.QUIZ: {
      const quiz = await prisma.quiz.findFirst({
        where: { id: params.targetId, branchId: params.branchId },
        include: {
          questions: { orderBy: { sortOrder: "asc" } },
          classGroup: { select: { name: true } },
        },
      });
      if (!quiz) {
        throw new PrintingServiceError("Quiz or exam not found in this branch.", 404, "NOT_FOUND");
      }

      const permCheck = canPrintTarget(
        {
          isExam: quiz.isExamTemplate || Boolean(quiz.examWindowStart),
          isExamTemplate: quiz.isExamTemplate,
          examWindowStart: quiz.examWindowStart,
          examWindowEnd: quiz.examWindowEnd,
          authorUserId: quiz.createdById,
        },
        {
          userId: params.userId,
          role: membership?.role ?? Role.TEACHING_STAFF,
          isSuperAdmin: user.isSuperAdmin,
          isExamApprover,
        },
        nearExamDays,
        now,
      );

      if (!permCheck.allowed) {
        throw new PrintingServiceError(permCheck.reason ?? "Printing exam materials during near-exam window is restricted.", 403, "FORBIDDEN");
      }

      docTitle = quiz.title;
      docInstructions = quiz.instructions;
      kindLabel = quiz.isExamTemplate ? "EXAMINATION PAPER" : "COURSE ASSESSMENT";

      for (const q of quiz.questions) {
        docTotalPoints += q.points;
        printableQuestions.push({
          prompt: q.prompt,
          points: q.points,
          questionType: q.questionType,
          options: extractOptions(q.options),
          correctAnswer: params.includeAnswerKey ? q.correctAnswer : null,
          explanation: null,
        });
      }
      break;
    }

    default:
      throw new PrintingServiceError(`Unsupported target kind: ${params.targetKind}`, 400, "VALIDATION");
  }

  // 4. Generate watermark text
  const watermark = generateWatermarkText({
    actorName: user.name || user.email || "Staff Member",
    actorIdentifier: user.email || user.id,
    branchName: branch.name,
    targetTitle: docTitle,
    timestamp: now,
    recipientStudentName: recipientStudent ? `${recipientStudent.firstName} ${recipientStudent.lastName}` : undefined,
    recipientStudentAdmissionNo: recipientStudent?.admissionNo,
  });

  // 5. Build printable document & generate PDF
  const doc: PrintableDocument = {
    title: docTitle,
    branchName: branch.name,
    watermark,
    date: now.toISOString().substring(0, 10),
    instructions: docInstructions,
    totalPoints: docTotalPoints,
    kindLabel,
    questions: printableQuestions,
  };

  const pdfBuffer = generateExamPdf(doc);

  // Calculate approximate page count from PDF stream
  const countMatch = pdfBuffer.toString("latin1").match(/\/Count\s+(\d+)/);
  const pageCount = countMatch ? parseInt(countMatch[1], 10) : 1;

  // 6. Record append-only print log
  const log = await prisma.questionBankPrintLog.create({
    data: {
      branchId: params.branchId,
      userId: params.userId,
      targetKind: params.targetKind,
      targetId: params.targetId,
      title: docTitle,
      watermark,
      pageCount,
      reason: params.reason?.trim() || null,
      recipientStudentId: params.recipientStudentId || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      createdAt: now,
    },
  });

  return {
    pdfBuffer,
    logId: log.id,
    watermark,
    pageCount,
    title: docTitle,
  };
}

export interface ListPrintLogsParams {
  branchId: string;
  userId?: string;
  targetKind?: PrintTargetKind;
  targetId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Lists print audit log entries for a branch with optional actor or target filters.
 */
export async function listPrintLogs(params: ListPrintLogsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
  const skip = (page - 1) * pageSize;

  const where = {
    branchId: params.branchId,
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.targetKind ? { targetKind: params.targetKind } : {}),
    ...(params.targetId ? { targetId: params.targetId } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.questionBankPrintLog.count({ where }),
    prisma.questionBankPrintLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        recipientStudent: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    logs: items.map((l) => ({
      id: l.id,
      branchId: l.branchId,
      targetKind: l.targetKind,
      targetId: l.targetId,
      title: l.title,
      watermark: l.watermark,
      pageCount: l.pageCount,
      reason: l.reason,
      createdAt: l.createdAt,
      printedBy: l.user ? { id: l.user.id, name: l.user.name, email: l.user.email } : null,
      student: l.student ? { id: l.student.id, name: `${l.student.firstName} ${l.student.lastName}`, admissionNo: l.student.admissionNo } : null,
      recipientStudent: l.recipientStudent ? { id: l.recipientStudent.id, name: `${l.recipientStudent.firstName} ${l.recipientStudent.lastName}`, admissionNo: l.recipientStudent.admissionNo } : null,
    })),
  };
}

/**
 * Pupil Portal: prints a completed practice session.
 * (Design §7.7: Pupils may print their own finished practice session; never an in-progress session).
 */
export async function printPupilPracticeSession(params: {
  branchId: string;
  studentId: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  now?: Date;
}): Promise<{
  pdfBuffer: Buffer;
  logId: string;
  watermark: string;
  pageCount: number;
  title: string;
}> {
  const now = params.now ?? new Date();

  const [session, student, branch] = await Promise.all([
    prisma.practiceSession.findFirst({
      where: { id: params.sessionId, branchId: params.branchId, studentId: params.studentId },
      include: {
        attempts: {
          include: { bankItem: true },
          orderBy: { answeredAt: "asc" },
        },
      },
    }),
    prisma.studentRecord.findFirst({
      where: { id: params.studentId, branchId: params.branchId },
      select: { id: true, firstName: true, lastName: true, admissionNo: true },
    }),
    prisma.branch.findUnique({
      where: { id: params.branchId },
      select: { name: true },
    }),
  ]);

  if (!session) {
    throw new PrintingServiceError("Practice session not found.", 404, "NOT_FOUND");
  }
  if (!student) {
    throw new PrintingServiceError("Student record not found.", 404, "NOT_FOUND");
  }

  const check = canPupilPrintAttempt({ finishedAt: session.finishedAt });
  if (!check.allowed) {
    throw new PrintingServiceError(check.reason ?? "Pupils may only print completed practice sessions.", 400, "NOT_FINISHED");
  }

  const docTitle = `Practice Session: ${session.topic || session.subjectKey || "Self-Study"}`;
  const watermark = generateWatermarkText({
    actorName: `${student.firstName} ${student.lastName}`,
    actorIdentifier: student.admissionNo,
    branchName: branch?.name,
    targetTitle: docTitle,
    timestamp: now,
  });

  const printableQuestions: PrintableQuestion[] = session.attempts.map((att) => ({
    prompt: att.bankItem.prompt,
    points: att.bankItem.points,
    questionType: att.bankItem.type,
    options: extractOptions(att.bankItem.options),
    studentAnswer: typeof att.answer === "string" ? att.answer : JSON.stringify(att.answer),
    isCorrect: att.correct,
    correctAnswer: att.bankItem.correctAnswer != null ? String(att.bankItem.correctAnswer) : null,
    explanation: att.bankItem.explanation,
  }));

  const doc: PrintableDocument = {
    title: docTitle,
    branchName: branch?.name || "Al-Eemaan",
    watermark,
    date: (session.finishedAt || now).toISOString().substring(0, 10),
    kindLabel: "PUPIL PRACTICE REVIEW",
    questions: printableQuestions,
  };

  const pdfBuffer = generateExamPdf(doc);
  const countMatch = pdfBuffer.toString("latin1").match(/\/Count\s+(\d+)/);
  const pageCount = countMatch ? parseInt(countMatch[1], 10) : 1;

  const log = await prisma.questionBankPrintLog.create({
    data: {
      branchId: params.branchId,
      studentId: params.studentId,
      targetKind: PrintTargetKind.PRACTICE_SESSION,
      targetId: params.sessionId,
      title: docTitle,
      watermark,
      pageCount,
      reason: "Pupil self-service practice download",
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      createdAt: now,
    },
  });

  return {
    pdfBuffer,
    logId: log.id,
    watermark,
    pageCount,
    title: docTitle,
  };
}

/**
 * Pupil Portal: prints a completed form submission.
 * (Design §7.7: Pupils may print their finished work with answers after submission;
 * pending manual questions withhold score and explanation per Slice 9).
 */
export async function printPupilFormResponse(params: {
  branchId: string;
  studentId: string;
  formId: string;
  responseId: string;
  ipAddress?: string;
  userAgent?: string;
  now?: Date;
}): Promise<{
  pdfBuffer: Buffer;
  logId: string;
  watermark: string;
  pageCount: number;
  title: string;
}> {
  const now = params.now ?? new Date();

  const [response, student, branch] = await Promise.all([
    prisma.formResponse.findFirst({
      where: { id: params.responseId, branchId: params.branchId, formId: params.formId, studentId: params.studentId },
      include: {
        form: true,
        answers: {
          include: { formQuestion: true },
        },
      },
    }),
    prisma.studentRecord.findFirst({
      where: { id: params.studentId, branchId: params.branchId },
      select: { id: true, firstName: true, lastName: true, admissionNo: true },
    }),
    prisma.branch.findUnique({
      where: { id: params.branchId },
      select: { name: true },
    }),
  ]);

  if (!response) {
    throw new PrintingServiceError("Form submission not found.", 404, "NOT_FOUND");
  }
  if (!student) {
    throw new PrintingServiceError("Student record not found.", 404, "NOT_FOUND");
  }

  const check = canPupilPrintAttempt({ status: response.status });
  if (!check.allowed) {
    throw new PrintingServiceError(check.reason ?? "Pupils may only print completed submissions.", 400, "NOT_FINISHED");
  }

  const docTitle = `${response.form.title} (Submission Review)`;
  const watermark = generateWatermarkText({
    actorName: `${student.firstName} ${student.lastName}`,
    actorIdentifier: student.admissionNo,
    branchName: branch?.name,
    targetTitle: docTitle,
    timestamp: now,
  });

  const printableQuestions: PrintableQuestion[] = response.answers.map((ans) => {
    const isManualPending = ans.markingStatus === "PENDING";
    return {
      prompt: ans.formQuestion.prompt,
      points: ans.formQuestion.points,
      questionType: ans.formQuestion.questionType,
      options: extractOptions(ans.formQuestion.options),
      studentAnswer: typeof ans.value === "string" ? ans.value : JSON.stringify(ans.value),
      isCorrect: isManualPending ? null : ans.isCorrect,
      awardedScore: isManualPending ? null : ans.score,
      correctAnswer: isManualPending ? null : ans.formQuestion.correctAnswer,
      explanation: isManualPending ? null : ans.formQuestion.explanation,
      feedback: ans.feedback,
    };
  });

  const doc: PrintableDocument = {
    title: docTitle,
    branchName: branch?.name || "Al-Eemaan",
    watermark,
    date: (response.submittedAt || now).toISOString().substring(0, 10),
    totalPoints: response.score ?? 0,
    kindLabel: "SUBMISSION RESULT",
    questions: printableQuestions,
  };

  const pdfBuffer = generateExamPdf(doc);
  const countMatch = pdfBuffer.toString("latin1").match(/\/Count\s+(\d+)/);
  const pageCount = countMatch ? parseInt(countMatch[1], 10) : 1;

  const log = await prisma.questionBankPrintLog.create({
    data: {
      branchId: params.branchId,
      studentId: params.studentId,
      targetKind: PrintTargetKind.FORM_RESPONSE,
      targetId: params.responseId,
      title: docTitle,
      watermark,
      pageCount,
      reason: "Pupil submission result print",
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      createdAt: now,
    },
  });

  return {
    pdfBuffer,
    logId: log.id,
    watermark,
    pageCount,
    title: docTitle,
  };
}
