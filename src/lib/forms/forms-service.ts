import { prisma } from "@/lib/db";
import {
  BankQuestionType,
  FormKind,
  FormStatus,
  FormAudienceKind,
  FormResponseStatus,
  FormMarkingMethod,
  FormMarkingStatus,
} from "@prisma/client";
import {
  isFormOpen,
  scrubFormQuestionsForPupil,
  isPupilAudienceEligible,
  validatePracticeSetInput,
} from "./practice-sets";
import {
  resolveMarkingMethod,
  evaluateSubmissionWithMarking,
} from "./manual-marking";

export class FormsServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "FormsServiceError";
  }
}

/**
 * Creates a new Practice Set (ungraded form) with audience and questions.
 */
export async function createPracticeSet(params: {
  branchId: string;
  userId: string;
  title: string;
  instructions?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  maxDurationMinutes?: number | null;
  classGroupIds?: string[];
  questions: Array<{
    sourceItemId?: string | null;
    prompt?: string;
    questionType?: BankQuestionType;
    options?: unknown;
    correctAnswer?: string | null;
    explanation?: string | null;
    points?: number;
    sortOrder?: number;
  }>;
}) {
  const validated = validatePracticeSetInput({
    title: params.title,
    instructions: params.instructions,
    opensAt: params.opensAt,
    closesAt: params.closesAt,
    maxDurationMinutes: params.maxDurationMinutes,
  });

  if (!validated.ok) {
    throw new FormsServiceError(validated.message, 400, "VALIDATION");
  }

  if (!params.questions || params.questions.length === 0) {
    throw new FormsServiceError("A practice set must contain at least one question.", 400, "VALIDATION");
  }

  // Pre-load bank items if questions are copied from question bank
  const sourceItemIds = params.questions
    .map((q) => q.sourceItemId)
    .filter((id): id is string => Boolean(id));

  const bankItems = sourceItemIds.length > 0
    ? await prisma.questionBankItem.findMany({
        where: { id: { in: sourceItemIds } },
        select: {
          id: true,
          version: true,
          prompt: true,
          type: true,
          options: true,
          correctAnswer: true,
          explanation: true,
          points: true,
        },
      })
    : [];

  const bankItemMap = new Map(bankItems.map((item) => [item.id, item]));

  // Compose question payloads
  const questionsToCreate = params.questions.map((q, index) => {
    let prompt = q.prompt;
    let questionType: BankQuestionType = q.questionType ?? BankQuestionType.SINGLE;
    let options: unknown = q.options ?? [];
    let correctAnswer: string | null = q.correctAnswer ?? null;
    let explanation: string | null = q.explanation ?? null;
    let points = q.points ?? 1;
    let sourceVersion: number | null = null;

    if (q.sourceItemId) {
      const source = bankItemMap.get(q.sourceItemId);
      if (source) {
        prompt = prompt || source.prompt;
        questionType = questionType || source.type;
        options = options && Array.isArray(options) && options.length > 0 ? options : (source.options ?? []);
        correctAnswer = correctAnswer ?? (source.correctAnswer != null ? (typeof source.correctAnswer === "string" ? source.correctAnswer : JSON.stringify(source.correctAnswer)) : null);
        explanation = explanation ?? source.explanation;
        points = points !== undefined ? points : source.points;
        sourceVersion = source.version;
      }
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new FormsServiceError(`Question #${index + 1} has an empty prompt.`, 400, "VALIDATION");
    }

    return {
      branchId: params.branchId,
      sourceItemId: q.sourceItemId ?? null,
      sourceVersion,
      prompt: prompt.trim(),
      questionType,
      options: options as never,
      correctAnswer: correctAnswer ?? null,
      explanation: explanation ?? null,
      points: Math.max(0, points),
      markingMethod: resolveMarkingMethod(questionType, (q as { markingMethod?: FormMarkingMethod }).markingMethod),
      sortOrder: q.sortOrder ?? index,
    };
  });

  const opensAt = params.opensAt ? new Date(params.opensAt) : null;
  const closesAt = params.closesAt ? new Date(params.closesAt) : null;

  const result = await prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        branchId: params.branchId,
        kind: FormKind.PRACTICE_SET,
        title: params.title.trim(),
        instructions: params.instructions?.trim() ?? null,
        status: FormStatus.DRAFT,
        opensAt,
        closesAt,
        maxDurationMinutes: params.maxDurationMinutes ?? null,
        createdById: params.userId,
      },
    });

    await tx.formAudience.create({
      data: {
        branchId: params.branchId,
        formId: form.id,
        kind: FormAudienceKind.MEMBERS,
        roles: ["STUDENT"],
        classGroupIds: params.classGroupIds ?? [],
      },
    });

    await tx.formQuestion.createMany({
      data: questionsToCreate.map((q) => ({
        ...q,
        formId: form.id,
      })),
    });

    return form;
  });

  return {
    ok: true,
    formId: result.id,
    title: result.title,
    status: result.status,
    questionCount: questionsToCreate.length,
  };
}

/**
 * Lists practice sets in a branch for teachers and administrators.
 */
export async function listPracticeSetsForStaff(params: {
  branchId: string;
  status?: FormStatus | "ALL";
}) {
  const where: {
    branchId: string;
    kind: FormKind;
    status?: FormStatus;
  } = {
    branchId: params.branchId,
    kind: FormKind.PRACTICE_SET,
  };

  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }

  const forms = await prisma.form.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      audiences: { select: { classGroupIds: true } },
      _count: { select: { questions: true, responses: true } },
    },
  });

  return forms.map((f) => ({
    id: f.id,
    title: f.title,
    instructions: f.instructions,
    status: f.status,
    opensAt: f.opensAt,
    closesAt: f.closesAt,
    maxDurationMinutes: f.maxDurationMinutes,
    questionCount: f._count.questions,
    responseCount: f._count.responses,
    classGroupIds: f.audiences[0]?.classGroupIds ?? [],
    createdBy: f.createdBy,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}

/**
 * Gets details of a practice set for staff including answer keys.
 */
export async function getPracticeSetForStaff(params: {
  formId: string;
  branchId: string;
}) {
  const form = await prisma.form.findFirst({
    where: { id: params.formId, branchId: params.branchId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
      _count: { select: { responses: true } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  return {
    id: form.id,
    branchId: form.branchId,
    title: form.title,
    instructions: form.instructions,
    status: form.status,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
    maxDurationMinutes: form.maxDurationMinutes,
    audiences: form.audiences,
    questions: form.questions,
    responseCount: form._count.responses,
    createdBy: form.createdBy,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

/**
 * Updates a practice set (e.g. title, schedule, publishing).
 */
export async function updatePracticeSet(params: {
  formId: string;
  branchId: string;
  userId: string;
  title?: string;
  instructions?: string | null;
  status?: FormStatus;
  opensAt?: string | null;
  closesAt?: string | null;
  maxDurationMinutes?: number | null;
  classGroupIds?: string[];
}) {
  const form = await prisma.form.findFirst({
    where: { id: params.formId, branchId: params.branchId },
  });

  if (!form) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  const data: {
    title?: string;
    instructions?: string | null;
    status?: FormStatus;
    opensAt?: Date | null;
    closesAt?: Date | null;
    maxDurationMinutes?: number | null;
    closedById?: string | null;
    closedAt?: Date | null;
  } = {};

  if (params.title !== undefined) {
    if (params.title.trim().length === 0 || params.title.trim().length > 200) {
      throw new FormsServiceError("Title must be between 1 and 200 characters.", 400, "VALIDATION");
    }
    data.title = params.title.trim();
  }

  if (params.instructions !== undefined) {
    data.instructions = params.instructions ? params.instructions.trim() : null;
  }

  if (params.opensAt !== undefined) {
    data.opensAt = params.opensAt ? new Date(params.opensAt) : null;
  }

  if (params.closesAt !== undefined) {
    data.closesAt = params.closesAt ? new Date(params.closesAt) : null;
  }

  if (params.maxDurationMinutes !== undefined) {
    data.maxDurationMinutes = params.maxDurationMinutes;
  }

  if (params.status) {
    data.status = params.status;
    if (params.status === FormStatus.CLOSED) {
      data.closedById = params.userId;
      data.closedAt = new Date();
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedForm = await tx.form.update({
      where: { id: form.id },
      data,
    });

    if (params.classGroupIds) {
      await tx.formAudience.updateMany({
        where: { formId: form.id },
        data: { classGroupIds: params.classGroupIds },
      });
    }

    return updatedForm;
  });

  return {
    ok: true,
    formId: updated.id,
    title: updated.title,
    status: updated.status,
  };
}

/**
 * Closes a practice set so no further attempts can be submitted.
 */
export async function closePracticeSet(params: {
  formId: string;
  branchId: string;
  userId: string;
}) {
  return updatePracticeSet({
    formId: params.formId,
    branchId: params.branchId,
    userId: params.userId,
    status: FormStatus.CLOSED,
  });
}

/**
 * Lists available open practice sets for a pupil.
 */
export async function listAvailablePracticeSetsForPupil(params: {
  studentId: string;
  branchId: string;
}) {
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: params.studentId, branchId: params.branchId },
    orderBy: { enrolledAt: "desc" },
    include: { classArm: { select: { classGroupId: true } } },
  });

  const pupilClassGroupId = enrollment?.classArm?.classGroupId ?? null;

  const forms = await prisma.form.findMany({
    where: {
      branchId: params.branchId,
      kind: FormKind.PRACTICE_SET,
      status: FormStatus.PUBLISHED,
    },
    orderBy: { createdAt: "desc" },
    include: {
      audiences: true,
      _count: { select: { questions: true } },
      responses: {
        where: { studentId: params.studentId },
        select: { id: true, status: true, score: true, maxScore: true, submittedAt: true },
      },
    },
  });

  const now = new Date();
  const available = forms
    .filter((f) => {
      const openCheck = isFormOpen(f, now);
      if (!openCheck.isOpen) return false;
      const audience = f.audiences[0];
      if (!audience) return true;
      return isPupilAudienceEligible(audience, pupilClassGroupId);
    })
    .map((f) => {
      const existingResponse = f.responses[0] ?? null;
      return {
        id: f.id,
        title: f.title,
        instructions: f.instructions,
        questionCount: f._count.questions,
        maxDurationMinutes: f.maxDurationMinutes,
        opensAt: f.opensAt,
        closesAt: f.closesAt,
        hasSubmitted: existingResponse?.status === FormResponseStatus.COMPLETED,
        submission: existingResponse,
      };
    });

  return available;
}

/**
 * Retrieves a practice set for a pupil with scrubbed questions (no answer keys).
 */
export async function getPracticeSetForPupil(params: {
  formId: string;
  studentId: string;
  branchId: string;
}) {
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: params.studentId, branchId: params.branchId },
    orderBy: { enrolledAt: "desc" },
    include: { classArm: { select: { classGroupId: true } } },
  });

  const pupilClassGroupId = enrollment?.classArm?.classGroupId ?? null;

  const form = await prisma.form.findFirst({
    where: {
      id: params.formId,
      branchId: params.branchId,
      kind: FormKind.PRACTICE_SET,
    },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
      responses: {
        where: { studentId: params.studentId },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!form) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  const openCheck = isFormOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError(
      openCheck.reason === "NOT_YET_OPEN"
        ? "This practice set is not open yet."
        : "This practice set is closed.",
      403,
      openCheck.reason,
    );
  }

  const audience = form.audiences[0];
  if (audience && !isPupilAudienceEligible(audience, pupilClassGroupId)) {
    throw new FormsServiceError("You are not eligible for this practice set.", 403, "FORBIDDEN");
  }

  const scrubbedQuestions = scrubFormQuestionsForPupil(form.questions);
  const existingResponse = form.responses[0] ?? null;

  return {
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    maxDurationMinutes: form.maxDurationMinutes,
    questions: scrubbedQuestions,
    activeResponse: existingResponse,
  };
}

/**
 * Starts a new practice set response session for a pupil.
 */
export async function startPracticeSetForPupil(params: {
  formId: string;
  studentId: string;
  branchId: string;
}) {
  const form = await prisma.form.findFirst({
    where: { id: params.formId, branchId: params.branchId, kind: FormKind.PRACTICE_SET },
    include: { audiences: true },
  });

  if (!form) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  const openCheck = isFormOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError("This practice set is not currently open.", 403, openCheck.reason);
  }

  // Check if an in-progress response already exists
  const existing = await prisma.formResponse.findFirst({
    where: {
      formId: form.id,
      studentId: params.studentId,
      status: FormResponseStatus.IN_PROGRESS,
    },
  });

  if (existing) {
    return {
      responseId: existing.id,
      startedAt: existing.startedAt,
      isResume: true,
    };
  }

  const response = await prisma.formResponse.create({
    data: {
      branchId: params.branchId,
      formId: form.id,
      studentId: params.studentId,
      respondentId: params.studentId,
      status: FormResponseStatus.IN_PROGRESS,
      startedAt: new Date(),
    },
  });

  return {
    responseId: response.id,
    startedAt: response.startedAt,
    isResume: false,
  };
}

/**
 * Submits pupil answers, evaluates accuracy, and reveals explanations.
 */
export async function submitPracticeSetForPupil(params: {
  formId: string;
  responseId: string;
  studentId: string;
  branchId: string;
  answers: Array<{ formQuestionId: string; value: unknown }>;
}) {
  const [form, response, questions] = await Promise.all([
    prisma.form.findFirst({ where: { id: params.formId, branchId: params.branchId } }),
    prisma.formResponse.findFirst({
      where: { id: params.responseId, formId: params.formId, studentId: params.studentId },
    }),
    prisma.formQuestion.findMany({
      where: { formId: params.formId, branchId: params.branchId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!form || !response) {
    throw new FormsServiceError("Active practice set response not found.", 404, "NOT_FOUND");
  }

  if (response.status !== FormResponseStatus.IN_PROGRESS) {
    throw new FormsServiceError("This practice set has already been completed.", 400, "ALREADY_COMPLETED");
  }

  // Evaluate answers taking manual marking into account
  const evaluation = evaluateSubmissionWithMarking(questions, params.answers);

  const completedAt = new Date();

  await prisma.$transaction(async (tx) => {
    // Write answer records
    await tx.formAnswer.createMany({
      data: evaluation.evaluatedAnswers.map((ea) => ({
        branchId: params.branchId,
        responseId: response.id,
        formQuestionId: ea.formQuestionId,
        value: ea.value as never,
        isCorrect: ea.isCorrect,
        score: ea.score,
        markingStatus: ea.markingStatus,
        createdAt: completedAt,
      })),
    });

    // Update response status
    await tx.formResponse.update({
      where: { id: response.id },
      data: {
        status: FormResponseStatus.COMPLETED,
        score: evaluation.totalScore,
        maxScore: evaluation.maxScore,
        markingStatus: evaluation.markingStatus,
        submittedAt: completedAt,
      },
    });
  });

  return {
    ok: true,
    responseId: response.id,
    status: FormResponseStatus.COMPLETED,
    markingStatus: evaluation.markingStatus,
    isPendingReview: evaluation.markingStatus === FormMarkingStatus.PENDING,
    totalScore: evaluation.totalScore,
    maxScore: evaluation.maxScore,
    accuracyPercentage: evaluation.accuracyPercentage,
    results: evaluation.evaluatedAnswers,
  };
}

/**
 * Returns responses and performance overview for staff.
 */
export async function getPracticeSetResponsesForStaff(params: {
  formId: string;
  branchId: string;
}) {
  const form = await prisma.form.findFirst({
    where: { id: params.formId, branchId: params.branchId },
  });

  if (!form) {
    throw new FormsServiceError("Practice set not found.", 404, "NOT_FOUND");
  }

  const responses = await prisma.formResponse.findMany({
    where: { formId: params.formId, branchId: params.branchId },
    orderBy: { submittedAt: "desc" },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
        },
      },
    },
  });

  return responses.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    studentName: r.student ? `${r.student.firstName} ${r.student.lastName}` : "Unknown",
    admissionNo: r.student?.admissionNo ?? "N/A",
    status: r.status,
    score: r.score,
    maxScore: r.maxScore,
    startedAt: r.startedAt,
    submittedAt: r.submittedAt,
  }));
}
