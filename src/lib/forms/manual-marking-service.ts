import { prisma } from "@/lib/db";
import {
  FormMarkingStatus,
  FormResponseStatus,
} from "@prisma/client";
import {
  validateAnswerScore,
  validateTeacherFeedback,
  computeAttemptMarkingSummary,
  canMarkResponse,
  sanitizeResponseForPupil,
} from "./manual-marking";

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
}) {
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

  return responses.map((r) => {
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
      correctAnswer: a.formQuestion.correctAnswer,
      explanation: a.formQuestion.explanation,
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

/**
 * Marks a single answer on a form response.
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
  const response = await prisma.formResponse.findFirst({
    where: {
      id: params.responseId,
      formId: params.formId,
      branchId: params.branchId,
    },
    include: {
      answers: {
        include: {
          formQuestion: {
            select: { points: true, id: true },
          },
        },
      },
    },
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

  const maxPoints = targetAnswer.formQuestion.points;
  const scoreVal = validateAnswerScore(params.score, maxPoints);
  if (!scoreVal.valid) {
    throw new ManualMarkingError(scoreVal.reason || "Invalid score.", 400, "INVALID_SCORE");
  }

  const feedbackVal = validateTeacherFeedback(params.feedback);
  if (!feedbackVal.valid) {
    throw new ManualMarkingError(feedbackVal.reason || "Invalid feedback.", 400, "INVALID_FEEDBACK");
  }

  const isCorrect = params.score === maxPoints ? true : params.score > 0 ? true : false;
  const markedAt = new Date();

  return await prisma.$transaction(async (tx) => {
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

    // 2. Recompute overall summary
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
 * Marks multiple answers or full attempt for a response in a batch.
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
  const response = await prisma.formResponse.findFirst({
    where: {
      id: params.responseId,
      formId: params.formId,
      branchId: params.branchId,
    },
    include: {
      answers: {
        include: {
          formQuestion: {
            select: { points: true, id: true },
          },
        },
      },
    },
  });

  if (!response) {
    throw new ManualMarkingError("Form response not found.", 404, "NOT_FOUND");
  }

  const markCheck = canMarkResponse(response);
  if (!markCheck.canMark) {
    throw new ManualMarkingError(markCheck.reason || "Response cannot be marked.", 400, "INVALID_STATE");
  }

  if (!params.answers || params.answers.length === 0) {
    throw new ManualMarkingError("At least one answer must be marked.", 400, "EMPTY_BATCH");
  }

  const answerMap = new Map(response.answers.map((a) => [a.id, a]));

  // Validate all scores and feedback before transaction
  for (const item of params.answers) {
    const existing = answerMap.get(item.answerId);
    if (!existing) {
      throw new ManualMarkingError(`Answer with ID '${item.answerId}' not found.`, 404, "ANSWER_NOT_FOUND");
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

  const markedAt = new Date();
  const inputAnswerMap = new Map(params.answers.map((a) => [a.answerId, a]));

  return await prisma.$transaction(async (tx) => {
    // 1. Update each specified answer
    for (const item of params.answers) {
      const existing = answerMap.get(item.answerId)!;
      const isCorrect = item.score === existing.formQuestion.points ? true : item.score > 0 ? true : false;

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

    // 2. Recompute overall summary
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
