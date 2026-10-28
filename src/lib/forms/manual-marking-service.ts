import { prisma } from "@/lib/db";
import {
  FormMarkingMethod,
  FormMarkingStatus,
  FormResponseStatus,
  type Prisma,
} from "@prisma/client";
import {
  validateAnswerScore,
  validateTeacherFeedback,
  computeAttemptMarkingSummary,
  canMarkResponse,
  isFullMarks,
  sanitizeResponseForPupil,
} from "./manual-marking";
import { formViewerIn, mayAccessForm, reachForm } from "./access";

export class ManualMarkingError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "ManualMarkingError";
  }
}

/**
 * Lists form responses requiring manual marking in a branch.
 * Supports filtering by formId or markingStatus.
 */
export async function listPendingMarkingResponses(params: {
  branchId: string;
  formId?: string;
  markingStatus?: FormMarkingStatus;
  actorUserId: string;
}) {
  // The queue is made of the answers of forms the person may READ; asking for one form they may not read is the same 404 as a form that does not exist.
  if (params.formId && !(await reachForm({ branchId: params.branchId, userId: params.actorUserId, formId: params.formId, access: "read" }))) {
    throw new ManualMarkingError("Form not found.", 404, "NOT_FOUND");
  }
  const viewer = await formViewerIn(params.branchId, params.actorUserId);
  const where: Record<string, unknown> = {
    branchId: params.branchId,
    status: FormResponseStatus.COMPLETED,
  };

  if (params.formId) {
    where.formId = params.formId;
  }

  if (params.markingStatus) {
    where.markingStatus = params.markingStatus;
  } else {
    // Default to responses needing marking: PENDING or PARTIALLY_MARKED
    where.markingStatus = {
      in: [FormMarkingStatus.PENDING, FormMarkingStatus.PARTIALLY_MARKED],
    };
  }

  const responses = await prisma.formResponse.findMany({
    where,
    orderBy: { submittedAt: "asc" },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          kind: true,
          createdById: true,
        },
      },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
        },
      },
      answers: {
        select: {
          id: true,
          markingStatus: true,
          score: true,
          formQuestion: {
            select: {
              points: true,
              markingMethod: true,
            },
          },
        },
      },
      markedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return responses
    .filter((r) => mayAccessForm({ userId: params.actorUserId, ...viewer, createdById: r.form.createdById }, "read"))
    .map((r) => {
    const totalQuestions = r.answers.length;
    const pendingQuestions = r.answers.filter(
      (a) => a.markingStatus === FormMarkingStatus.PENDING,
    ).length;
    const markedQuestions = r.answers.filter(
      (a) => a.markingStatus === FormMarkingStatus.MARKED,
    ).length;

    return {
      responseId: r.id,
      formId: r.formId,
      formTitle: r.form.title,
      formKind: r.form.kind,
      student: r.student
        ? {
            id: r.student.id,
            admissionNo: r.student.admissionNo,
            name: `${r.student.firstName} ${r.student.lastName}`.trim(),
          }
        : null,
      status: r.status,
      markingStatus: r.markingStatus,
      score: r.score,
      maxScore: r.maxScore,
      submittedAt: r.submittedAt,
      totalQuestions,
      pendingQuestions,
      markedQuestions,
      markedBy: r.markedBy,
      markedAt: r.markedAt,
    };
  });
}

/**
 * Retrieves detailed response and all question answers for teacher marking.
 */
export async function getResponseForMarking(params: {
  branchId: string;
  formId: string;
  responseId: string;
  actorUserId: string;
}) {
  const response = await prisma.formResponse.findFirst({
    where: {
      id: params.responseId,
      formId: params.formId,
      branchId: params.branchId,
    },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          instructions: true,
          kind: true,
          status: true,
        },
      },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
        },
      },
      markedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      answers: {
        orderBy: { formQuestion: { sortOrder: "asc" } },
        include: {
          formQuestion: {
            select: {
              id: true,
              prompt: true,
              questionType: true,
              options: true,
              correctAnswer: true,
              explanation: true,
              points: true,
              markingMethod: true,
              sortOrder: true,
            },
          },
          markedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      audits: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!response) {
    throw new ManualMarkingError("Form response not found for marking.", 404, "NOT_FOUND");
  }
  const reach = { branchId: params.branchId, userId: params.actorUserId, formId: response.formId };
  if (!(await reachForm({ ...reach, access: "read" }))) {
    throw new ManualMarkingError("Form response not found for marking.", 404, "NOT_FOUND");
  }
  // the answer key is for those who manage the form; whoever else may read the answers reads them without it
  const mayKey = (await reachForm({ ...reach, access: "manage" })) !== null;

  const markCheck = canMarkResponse(response);
  if (!markCheck.canMark) {
    throw new ManualMarkingError(markCheck.reason || "Response cannot be marked.", 400, "INVALID_STATE");
  }

  return {
    responseId: response.id,
    formId: response.formId,
    formTitle: response.form.title,
    formInstructions: response.form.instructions,
    formKind: response.form.kind,
    student: response.student
      ? {
          id: response.student.id,
          admissionNo: response.student.admissionNo,
          name: `${response.student.firstName} ${response.student.lastName}`.trim(),
        }
      : null,
    status: response.status,
    markingStatus: response.markingStatus,
    score: response.score,
    maxScore: response.maxScore,
    startedAt: response.startedAt,
    submittedAt: response.submittedAt,
    markedAt: response.markedAt,
    markedBy: response.markedBy,
    answers: response.answers.map((a) => ({
      answerId: a.id,
      formQuestionId: a.formQuestionId,
      prompt: a.formQuestion.prompt,
      questionType: a.formQuestion.questionType,
      options: a.formQuestion.options,
      ...(mayKey ? { correctAnswer: a.formQuestion.correctAnswer, explanation: a.formQuestion.explanation } : {}),
      points: a.formQuestion.points,
      markingMethod: a.formQuestion.markingMethod,
      submittedValue: a.value,
      score: a.score,
      isCorrect: a.isCorrect,
      feedback: a.feedback,
      markingStatus: a.markingStatus,
      markedAt: a.markedAt,
      markedBy: a.markedBy,
    })),
    audits: response.audits.map((au) => ({
      id: au.id,
      answerId: au.answerId,
      scoreAwarded: au.scoreAwarded,
      maxScore: au.maxScore,
      feedback: au.feedback,
      action: au.action,
      actorName: au.actor.name,
      createdAt: au.createdAt,
    })),
  };
}

/// Serialises everyone who writes to the same attempt: the teachers marking it and the pupil submitting it. The total of an attempt is the sum of its answers AS THEY ARE when a mark is written, so two marks of one attempt must not be
/// written from the same stale picture, and two submissions of one attempt must not both find it open: the lock is held until the transaction ends, and the attempt is read after it is taken.
export async function lockAttempt(tx: Prisma.TransactionClient, responseId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mark:${responseId}`}::text))`;
}

const NOT_MANUAL = "Only a question set for hand marking can be marked by hand.";

/**
 * Marks a single answer on a form response. Only the form's creator and the administrators mark; only a question set for hand marking is marked by hand; the answer counts as
 * correct only for full marks; the total is worked out from the answers as they are under the attempt's lock.
 */
export async function markFormAnswer(params: {
  branchId: string;
  formId: string;
  responseId: string;
  answerId: string;
  score: number;
  feedback?: string | null;
  actorUserId: string;
}) {
  if (!(await reachForm({ branchId: params.branchId, userId: params.actorUserId, formId: params.formId, access: "manage" }))) {
    throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
  }
  const markedAt = new Date();

  return await prisma.$transaction(async (tx) => {
    await lockAttempt(tx, params.responseId);
    const response = await tx.formResponse.findFirst({
      where: { id: params.responseId, formId: params.formId, branchId: params.branchId },
      include: { answers: { include: { formQuestion: { select: { points: true, id: true, markingMethod: true } } } } },
    });
    if (!response) {
      throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
    }

    const markCheck = canMarkResponse(response);
    if (!markCheck.canMark) {
      throw new ManualMarkingError(markCheck.reason || "Response cannot be marked.", 400, "INVALID_STATE");
    }

    const targetAnswer = response.answers.find((a) => a.id === params.answerId);
    if (!targetAnswer) {
      throw new ManualMarkingError("Target answer not found in response.", 404, "ANSWER_NOT_FOUND");
    }
    if (targetAnswer.formQuestion.markingMethod !== FormMarkingMethod.MANUAL) {
      throw new ManualMarkingError(NOT_MANUAL, 400, "NOT_MANUAL");
    }

    const maxPoints = targetAnswer.formQuestion.points;
    const scoreVal = validateAnswerScore(params.score, maxPoints);
    if (!scoreVal.valid) {
      throw new ManualMarkingError(scoreVal.reason || "Invalid score.", 400, "INVALID_SCORE");
    }

    const feedbackVal = validateTeacherFeedback(params.feedback);
    if (!feedbackVal.valid) {
      throw new ManualMarkingError(feedbackVal.reason || "Invalid feedback.", 400, "INVALID_FEEDBACK");
    }

    const isCorrect = isFullMarks(params.score, maxPoints);

    // 1. Update the answer
    await tx.formAnswer.update({
      where: { id: targetAnswer.id },
      data: {
        score: params.score,
        isCorrect,
        feedback: params.feedback?.trim() || null,
        markingStatus: FormMarkingStatus.MARKED,
        markedById: params.actorUserId,
        markedAt,
      },
    });

    // 2. Recompute overall summary from the answers as they are now
    const updatedAnswers = response.answers.map((a) => {
      if (a.id === targetAnswer.id) {
        return {
          score: params.score,
          points: a.formQuestion.points,
          markingStatus: FormMarkingStatus.MARKED,
        };
      }
      return {
        score: a.score,
        points: a.formQuestion.points,
        markingStatus: a.markingStatus,
      };
    });

    const summary = computeAttemptMarkingSummary(updatedAnswers);

    // 3. Update the response
    await tx.formResponse.update({
      where: { id: response.id },
      data: {
        score: summary.totalScore,
        markingStatus: summary.markingStatus,
        markedById: params.actorUserId,
        markedAt: summary.markingStatus === FormMarkingStatus.MARKED ? markedAt : response.markedAt,
      },
    });

    // 4. Create audit log
    await tx.formMarkingAudit.create({
      data: {
        branchId: params.branchId,
        responseId: response.id,
        answerId: targetAnswer.id,
        formId: response.formId,
        studentId: response.studentId,
        scoreAwarded: params.score,
        maxScore: maxPoints,
        feedback: params.feedback?.trim() || null,
        action: "ANSWER_MARKED",
        actorUserId: params.actorUserId,
        createdAt: markedAt,
      },
    });

    return {
      ok: true,
      answerId: targetAnswer.id,
      responseId: response.id,
      score: params.score,
      isCorrect,
      feedback: params.feedback?.trim() || null,
      markingStatus: FormMarkingStatus.MARKED,
      overallResponseScore: summary.totalScore,
      overallResponseMarkingStatus: summary.markingStatus,
      accuracyPercentage: summary.accuracyPercentage,
    };
  });
}

/**
 * Marks multiple answers or full attempt for a response in a batch. The same rules as a single mark, for every answer named; a batch names each answer once, and it is all
 * or nothing.
 */
export async function markFormAttempt(params: {
  branchId: string;
  formId: string;
  responseId: string;
  answers: Array<{
    answerId: string;
    score: number;
    feedback?: string | null;
  }>;
  overallFeedback?: string | null;
  actorUserId: string;
}) {
  if (!(await reachForm({ branchId: params.branchId, userId: params.actorUserId, formId: params.formId, access: "manage" }))) {
    throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
  }

  if (!params.answers || params.answers.length === 0) {
    throw new ManualMarkingError("At least one answer must be marked.", 400, "EMPTY_BATCH");
  }
  if (new Set(params.answers.map((a) => a.answerId)).size !== params.answers.length) {
    throw new ManualMarkingError("A batch names each answer once.", 400, "DUPLICATE_ANSWER");
  }

  const markedAt = new Date();
  const inputAnswerMap = new Map(params.answers.map((a) => [a.answerId, a]));

  return await prisma.$transaction(async (tx) => {
    await lockAttempt(tx, params.responseId);
    const response = await tx.formResponse.findFirst({
      where: { id: params.responseId, formId: params.formId, branchId: params.branchId },
      include: { answers: { include: { formQuestion: { select: { points: true, id: true, markingMethod: true } } } } },
    });
    if (!response) {
      throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
    }

    const markCheck = canMarkResponse(response);
    if (!markCheck.canMark) {
      throw new ManualMarkingError(markCheck.reason || "Response cannot be marked.", 400, "INVALID_STATE");
    }

    const answerMap = new Map(response.answers.map((a) => [a.id, a]));

    // Validate every score and feedback before anything is written
    for (const item of params.answers) {
      const existing = answerMap.get(item.answerId);
      if (!existing) {
        throw new ManualMarkingError(`Answer with ID '${item.answerId}' not found.`, 404, "ANSWER_NOT_FOUND");
      }
      if (existing.formQuestion.markingMethod !== FormMarkingMethod.MANUAL) {
        throw new ManualMarkingError(NOT_MANUAL, 400, "NOT_MANUAL");
      }
      const scoreVal = validateAnswerScore(item.score, existing.formQuestion.points);
      if (!scoreVal.valid) {
        throw new ManualMarkingError(scoreVal.reason || "Invalid score.", 400, "INVALID_SCORE");
      }
      const feedbackVal = validateTeacherFeedback(item.feedback);
      if (!feedbackVal.valid) {
        throw new ManualMarkingError(feedbackVal.reason || "Invalid feedback.", 400, "INVALID_FEEDBACK");
      }
    }

    // 1. Update each specified answer
    for (const item of params.answers) {
      const existing = answerMap.get(item.answerId)!;
      const isCorrect = isFullMarks(item.score, existing.formQuestion.points);

      await tx.formAnswer.update({
        where: { id: item.answerId },
        data: {
          score: item.score,
          isCorrect,
          feedback: item.feedback?.trim() || null,
          markingStatus: FormMarkingStatus.MARKED,
          markedById: params.actorUserId,
          markedAt,
        },
      });

      // Audit row for this answer
      await tx.formMarkingAudit.create({
        data: {
          branchId: params.branchId,
          responseId: response.id,
          answerId: item.answerId,
          formId: response.formId,
          studentId: response.studentId,
          scoreAwarded: item.score,
          maxScore: existing.formQuestion.points,
          feedback: item.feedback?.trim() || null,
          action: "ANSWER_MARKED",
          actorUserId: params.actorUserId,
          createdAt: markedAt,
        },
      });
    }

    // 2. Recompute overall summary from the answers as they are now
    const updatedAnswers = response.answers.map((a) => {
      const updatedInput = inputAnswerMap.get(a.id);
      if (updatedInput) {
        return {
          score: updatedInput.score,
          points: a.formQuestion.points,
          markingStatus: FormMarkingStatus.MARKED,
        };
      }
      return {
        score: a.score,
        points: a.formQuestion.points,
        markingStatus: a.markingStatus,
      };
    });

    const summary = computeAttemptMarkingSummary(updatedAnswers);

    // 3. Update response
    await tx.formResponse.update({
      where: { id: response.id },
      data: {
        score: summary.totalScore,
        markingStatus: summary.markingStatus,
        markedById: params.actorUserId,
        markedAt,
      },
    });

    // 4. Audit row for attempt
    await tx.formMarkingAudit.create({
      data: {
        branchId: params.branchId,
        responseId: response.id,
        formId: response.formId,
        studentId: response.studentId,
        scoreAwarded: summary.totalScore,
        maxScore: summary.maxScore,
        feedback: params.overallFeedback?.trim() || null,
        action: "ATTEMPT_MARKED",
        actorUserId: params.actorUserId,
        createdAt: markedAt,
      },
    });

    return {
      ok: true,
      responseId: response.id,
      totalScore: summary.totalScore,
      maxScore: summary.maxScore,
      accuracyPercentage: summary.accuracyPercentage,
      markingStatus: summary.markingStatus,
      markedAnswersCount: params.answers.length,
      pendingAnswersCount: summary.pendingCount,
    };
  });
}

/**
 * Returns a pupil's response sanitized per manual marking visibility rules.
 */
export async function getPupilResponseWithMarking(params: {
  branchId: string;
  studentId: string;
  formId: string;
  responseId: string;
}) {
  const response = await prisma.formResponse.findFirst({
    where: {
      id: params.responseId,
      formId: params.formId,
      studentId: params.studentId,
      branchId: params.branchId,
    },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          instructions: true,
          kind: true,
          status: true,
        },
      },
      answers: {
        orderBy: { formQuestion: { sortOrder: "asc" } },
        include: {
          formQuestion: {
            select: {
              id: true,
              prompt: true,
              questionType: true,
              options: true,
              correctAnswer: true,
              explanation: true,
              points: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  if (!response) {
    throw new ManualMarkingError("Practice set response not found.", 404, "NOT_FOUND");
  }

  const sanitized = sanitizeResponseForPupil(
    {
      status: response.status,
      markingStatus: response.markingStatus,
      score: response.score,
      maxScore: response.maxScore,
    },
    response.answers,
  );

  return {
    formId: response.formId,
    formTitle: response.form.title,
    formInstructions: response.form.instructions,
    responseId: response.id,
    status: sanitized.status,
    markingStatus: sanitized.markingStatus,
    isPendingReview: sanitized.isPendingReview,
    score: sanitized.score,
    maxScore: sanitized.maxScore,
    answers: sanitized.answers.map((a) => ({
      answerId: a.id,
      formQuestionId: a.formQuestionId,
      prompt: a.formQuestion?.prompt,
      questionType: a.formQuestion?.questionType,
      options: a.formQuestion?.options,
      points: a.formQuestion?.points,
      submittedValue: a.value,
      score: a.score,
      isCorrect: a.isCorrect,
      feedback: a.feedback,
      isPending: a.isPending,
      correctAnswer: a.correctAnswer,
      explanation: a.explanation,
    })),
  };
}
