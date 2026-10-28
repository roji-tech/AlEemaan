import { prisma } from "@/lib/db";
import crypto from "node:crypto";
import {
  BankQuestionType,
  FormKind,
  FormStatus,
  FormAudienceKind,
  FormResponseStatus,
} from "@prisma/client";
import { FormsServiceError } from "./forms-service";
import {
  validateQuestionnaireInput,
  isQuestionnaireOpen,
  isMemberEligibleForQuestionnaire,
  formatQuestionnaireQuestionsForRespondent,
  validateAndNormalizeAnswers,
  aggregateQuestionnaireAnalytics,
} from "./questionnaires";

/**
 * Creates a new questionnaire form.
 */
export async function createQuestionnaire(params: {
  branchId: string;
  userId: string;
  title: string;
  instructions?: string | null;
  isAnonymous?: boolean;
  audienceKind?: FormAudienceKind;
  roles?: string[];
  classGroupIds?: string[];
  opensAt?: string | null;
  closesAt?: string | null;
  questions: Array<{
    prompt: string;
    questionType?: BankQuestionType;
    options?: unknown;
    sortOrder?: number;
  }>;
}) {
  const validated = validateQuestionnaireInput({
    title: params.title,
    instructions: params.instructions,
    isAnonymous: params.isAnonymous,
    audienceKind: params.audienceKind,
    roles: params.roles,
    classGroupIds: params.classGroupIds,
    opensAt: params.opensAt,
    closesAt: params.closesAt,
    questions: params.questions as never,
  });

  if (!validated.ok) {
    throw new FormsServiceError(validated.message ?? "Invalid questionnaire input", 400, "VALIDATION");
  }

  const opensAt = params.opensAt ? new Date(params.opensAt) : null;
  const closesAt = params.closesAt ? new Date(params.closesAt) : null;
  const isAnonymous = params.isAnonymous ?? false;
  const audienceKind = params.audienceKind ?? FormAudienceKind.MEMBERS;
  const shareToken = crypto.randomBytes(16).toString("hex");

  const result = await prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        branchId: params.branchId,
        kind: FormKind.QUESTIONNAIRE,
        title: params.title.trim(),
        instructions: params.instructions?.trim() ?? null,
        status: FormStatus.DRAFT,
        isAnonymous,
        shareToken,
        opensAt,
        closesAt,
        createdById: params.userId,
      },
    });

    await tx.formAudience.create({
      data: {
        branchId: params.branchId,
        formId: form.id,
        kind: audienceKind,
        roles: (params.roles ?? []) as never,
        classGroupIds: (params.classGroupIds ?? []) as never,
      },
    });

    await tx.formQuestion.createMany({
      data: params.questions.map((q, idx) => ({
        branchId: params.branchId,
        formId: form.id,
        prompt: q.prompt.trim(),
        questionType: q.questionType ?? BankQuestionType.SINGLE,
        options: (q.options ?? []) as never,
        points: 0,
        sortOrder: q.sortOrder ?? idx,
      })),
    });

    return form;
  });

  return {
    ok: true,
    formId: result.id,
    title: result.title,
    status: result.status,
    isAnonymous: result.isAnonymous,
    shareToken: result.shareToken,
    questionCount: params.questions.length,
  };
}

/**
 * Lists questionnaires in a branch for staff.
 */
export async function listQuestionnairesForStaff(params: {
  branchId: string;
  status?: FormStatus | "ALL";
}) {
  const where: {
    branchId: string;
    kind: FormKind;
    status?: FormStatus;
  } = {
    branchId: params.branchId,
    kind: FormKind.QUESTIONNAIRE,
  };

  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }

  const forms = await prisma.form.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      audiences: true,
      _count: { select: { questions: true, responses: true, participations: true } },
    },
  });

  return forms.map((f) => ({
    id: f.id,
    title: f.title,
    instructions: f.instructions,
    status: f.status,
    isAnonymous: f.isAnonymous,
    shareToken: f.shareToken,
    opensAt: f.opensAt,
    closesAt: f.closesAt,
    questionCount: f._count.questions,
    responseCount: f._count.responses,
    participationCount: f._count.participations,
    audience: f.audiences[0] ?? null,
    createdBy: f.createdBy,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}

/**
 * Retrieves questionnaire details for staff.
 */
export async function getQuestionnaireForStaff(params: {
  formId: string;
  branchId: string;
}) {
  const form = await prisma.form.findFirst({
    where: { id: params.formId, branchId: params.branchId, kind: FormKind.QUESTIONNAIRE },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
      _count: { select: { responses: true, participations: true } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  return {
    id: form.id,
    branchId: form.branchId,
    title: form.title,
    instructions: form.instructions,
    status: form.status,
    isAnonymous: form.isAnonymous,
    shareToken: form.shareToken,
    opensAt: form.opensAt,
    closesAt: form.closesAt,
    audience: form.audiences[0] ?? null,
    questions: form.questions,
    responseCount: form._count.responses,
    participationCount: form._count.participations,
    createdBy: form.createdBy,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

/**
 * Updates questionnaire fields, status, or schedule.
 */
export async function updateQuestionnaire(params: {
  formId: string;
  branchId: string;
  userId: string;
  title?: string;
  instructions?: string | null;
  status?: FormStatus;
  isAnonymous?: boolean;
  audienceKind?: FormAudienceKind;
  roles?: string[];
  classGroupIds?: string[];
  opensAt?: string | null;
  closesAt?: string | null;
}) {
  const form = await prisma.form.findFirst({
    where: { id: params.formId, branchId: params.branchId, kind: FormKind.QUESTIONNAIRE },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const data: {
    title?: string;
    instructions?: string | null;
    status?: FormStatus;
    isAnonymous?: boolean;
    opensAt?: Date | null;
    closesAt?: Date | null;
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

  if (params.isAnonymous !== undefined) {
    data.isAnonymous = params.isAnonymous;
  }

  if (params.opensAt !== undefined) {
    data.opensAt = params.opensAt ? new Date(params.opensAt) : null;
  }

  if (params.closesAt !== undefined) {
    data.closesAt = params.closesAt ? new Date(params.closesAt) : null;
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

    if (params.audienceKind || params.roles || params.classGroupIds) {
      const audienceData: {
        kind?: FormAudienceKind;
        roles?: never;
        classGroupIds?: never;
      } = {};
      if (params.audienceKind) audienceData.kind = params.audienceKind;
      if (params.roles) audienceData.roles = params.roles as never;
      if (params.classGroupIds) audienceData.classGroupIds = params.classGroupIds as never;

      await tx.formAudience.updateMany({
        where: { formId: form.id },
        data: audienceData,
      });
    }

    return updatedForm;
  });

  return {
    ok: true,
    formId: updated.id,
    title: updated.title,
    status: updated.status,
    isAnonymous: updated.isAnonymous,
  };
}

/**
 * Closes a questionnaire immediately.
 */
export async function closeQuestionnaire(params: {
  formId: string;
  branchId: string;
  userId: string;
}) {
  return updateQuestionnaire({
    formId: params.formId,
    branchId: params.branchId,
    userId: params.userId,
    status: FormStatus.CLOSED,
  });
}

/**
 * Aggregates questionnaire results and distributions for staff analytics.
 */
export async function getQuestionnaireAnalytics(params: {
  formId: string;
  branchId: string;
}) {
  const form = await prisma.form.findFirst({
    where: { id: params.formId, branchId: params.branchId, kind: FormKind.QUESTIONNAIRE },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      responses: {
        where: { status: FormResponseStatus.COMPLETED },
        include: { answers: true },
      },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const allAnswers = form.responses.flatMap((r) => r.answers);

  const analytics = aggregateQuestionnaireAnalytics({
    formId: form.id,
    title: form.title,
    isAnonymous: form.isAnonymous,
    status: form.status,
    questions: form.questions,
    answers: allAnswers,
  });

  return analytics;
}

/**
 * Lists available questionnaires for staff member to fill out.
 */
export async function listAvailableQuestionnairesForStaff(params: {
  userId: string;
  userRole: string;
  branchId: string;
}) {
  const forms = await prisma.form.findMany({
    where: {
      branchId: params.branchId,
      kind: FormKind.QUESTIONNAIRE,
      status: FormStatus.PUBLISHED,
    },
    orderBy: { createdAt: "desc" },
    include: {
      audiences: true,
      _count: { select: { questions: true } },
      participations: {
        where: { respondentId: params.userId },
        select: { id: true, createdAt: true },
      },
    },
  });

  const now = new Date();
  return forms
    .filter((f) => {
      const openCheck = isQuestionnaireOpen(f, now);
      if (!openCheck.isOpen) return false;
      const audience = f.audiences[0];
      if (!audience) return true;
      return isMemberEligibleForQuestionnaire(audience, params.userRole, null);
    })
    .map((f) => ({
      id: f.id,
      title: f.title,
      instructions: f.instructions,
      isAnonymous: f.isAnonymous,
      questionCount: f._count.questions,
      opensAt: f.opensAt,
      closesAt: f.closesAt,
      hasSubmitted: f.participations.length > 0,
    }));
}

/**
 * Lists available questionnaires for a pupil to fill out.
 */
export async function listAvailableQuestionnairesForPupil(params: {
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
      kind: FormKind.QUESTIONNAIRE,
      status: FormStatus.PUBLISHED,
    },
    orderBy: { createdAt: "desc" },
    include: {
      audiences: true,
      _count: { select: { questions: true } },
      participations: {
        where: { respondentId: params.studentId },
        select: { id: true, createdAt: true },
      },
    },
  });

  const now = new Date();
  return forms
    .filter((f) => {
      const openCheck = isQuestionnaireOpen(f, now);
      if (!openCheck.isOpen) return false;
      const audience = f.audiences[0];
      if (!audience) return true;
      return isMemberEligibleForQuestionnaire(audience, "STUDENT", pupilClassGroupId);
    })
    .map((f) => ({
      id: f.id,
      title: f.title,
      instructions: f.instructions,
      isAnonymous: f.isAnonymous,
      questionCount: f._count.questions,
      opensAt: f.opensAt,
      closesAt: f.closesAt,
      hasSubmitted: f.participations.length > 0,
    }));
}

/**
 * Gets questionnaire details for a member to take.
 */
export async function getQuestionnaireForMember(params: {
  formId: string;
  memberId: string;
  memberRole?: string | null;
  classGroupId?: string | null;
  branchId: string;
}) {
  const form = await prisma.form.findFirst({
    where: {
      id: params.formId,
      branchId: params.branchId,
      kind: FormKind.QUESTIONNAIRE,
    },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
      participations: {
        where: { respondentId: params.memberId },
        select: { id: true, createdAt: true },
      },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const openCheck = isQuestionnaireOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError(
      openCheck.reason === "NOT_YET_OPEN"
        ? "This questionnaire is not open yet."
        : "This questionnaire is closed.",
      403,
      openCheck.reason,
    );
  }

  let classGroupId = params.classGroupId;
  if (!classGroupId && params.memberRole === "STUDENT") {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId: params.memberId, branchId: params.branchId },
      orderBy: { enrolledAt: "desc" },
      include: { classArm: { select: { classGroupId: true } } },
    });
    classGroupId = enrollment?.classArm?.classGroupId ?? null;
  }

  const audience = form.audiences[0];
  if (audience && !isMemberEligibleForQuestionnaire(audience, params.memberRole, classGroupId)) {
    throw new FormsServiceError("You are not eligible for this questionnaire.", 403, "FORBIDDEN");
  }

  return {
    id: form.id,
    title: form.title,
    instructions: form.instructions,
    isAnonymous: form.isAnonymous,
    hasSubmitted: form.participations.length > 0,
    questions: formatQuestionnaireQuestionsForRespondent(form.questions),
  };
}

/**
 * Submits member responses to a questionnaire. Enforces one response per member.
 */
export async function submitQuestionnaireForMember(params: {
  formId: string;
  memberId: string;
  isStudent?: boolean;
  memberRole?: string | null;
  classGroupId?: string | null;
  branchId: string;
  answers: Array<{ formQuestionId: string; value: unknown }>;
}) {
  const form = await prisma.form.findFirst({
    where: { id: params.formId, branchId: params.branchId, kind: FormKind.QUESTIONNAIRE },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Questionnaire not found.", 404, "NOT_FOUND");
  }

  const openCheck = isQuestionnaireOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError("This questionnaire is closed.", 403, openCheck.reason);
  }

  let classGroupId = params.classGroupId;
  if (!classGroupId && params.memberRole === "STUDENT") {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId: params.memberId, branchId: params.branchId },
      orderBy: { enrolledAt: "desc" },
      include: { classArm: { select: { classGroupId: true } } },
    });
    classGroupId = enrollment?.classArm?.classGroupId ?? null;
  }

  const audience = form.audiences[0];
  if (audience && !isMemberEligibleForQuestionnaire(audience, params.memberRole, classGroupId)) {
    throw new FormsServiceError("You are not eligible for this questionnaire.", 403, "FORBIDDEN");
  }

  // Deduplication check: verify member has not already submitted
  const alreadyParticipated = await prisma.formParticipation.findFirst({
    where: {
      branchId: params.branchId,
      formId: form.id,
      respondentId: params.memberId,
    },
  });

  if (alreadyParticipated) {
    throw new FormsServiceError("You have already submitted this questionnaire.", 400, "ALREADY_SUBMITTED");
  }

  // Validate answers
  const validation = validateAndNormalizeAnswers(form.questions, params.answers);
  if (!validation.ok || !validation.normalizedAnswers) {
    throw new FormsServiceError(validation.message ?? "Invalid answer submission.", 400, "VALIDATION");
  }

  const normalizedAnswers = validation.normalizedAnswers;
  if (!normalizedAnswers) {
    throw new FormsServiceError("No answers to record.", 400, "VALIDATION");
  }

  const submittedAt = new Date();

  // Anonymity: if form.isAnonymous is true, response respondentId & studentId are null
  const respondentId = form.isAnonymous ? null : params.memberId;
  const studentId = form.isAnonymous ? null : params.isStudent ? params.memberId : null;

  await prisma.$transaction(async (tx) => {
    // 1. Record participation for deduplication
    await tx.formParticipation.create({
      data: {
        branchId: params.branchId,
        formId: form.id,
        respondentId: params.memberId,
        createdAt: submittedAt,
      },
    });

    // 2. Record response session
    const response = await tx.formResponse.create({
      data: {
        branchId: params.branchId,
        formId: form.id,
        respondentId,
        studentId,
        status: FormResponseStatus.COMPLETED,
        startedAt: submittedAt,
        submittedAt,
      },
    });

    // 3. Record answers
    await tx.formAnswer.createMany({
      data: normalizedAnswers.map((na) => ({
        branchId: params.branchId,
        responseId: response.id,
        formQuestionId: na.formQuestionId,
        value: na.value as never,
        createdAt: submittedAt,
      })),
    });
  });

  return {
    ok: true,
    formId: form.id,
    isAnonymous: form.isAnonymous,
    submittedAt,
  };
}

/**
 * Retrieves a public questionnaire via shareToken.
 */
export async function getPublicQuestionnaireByToken(token: string) {
  if (!token || token.trim().length === 0) {
    throw new FormsServiceError("Public token is required.", 400, "VALIDATION");
  }

  const form = await prisma.form.findFirst({
    where: {
      shareToken: token.trim(),
      kind: FormKind.QUESTIONNAIRE,
    },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Public questionnaire not found.", 404, "NOT_FOUND");
  }

  const openCheck = isQuestionnaireOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError("This questionnaire is closed.", 403, openCheck.reason);
  }

  const audience = form.audiences[0];
  if (!audience || audience.kind !== FormAudienceKind.PUBLIC) {
    throw new FormsServiceError("This questionnaire is not open to the public.", 403, "FORBIDDEN");
  }

  return {
    title: form.title,
    instructions: form.instructions,
    isAnonymous: form.isAnonymous,
    questions: formatQuestionnaireQuestionsForRespondent(form.questions),
  };
}

/**
 * Submits answers to a public questionnaire.
 */
export async function submitPublicQuestionnaire(params: {
  token: string;
  answers: Array<{ formQuestionId: string; value: unknown }>;
}) {
  const form = await prisma.form.findFirst({
    where: {
      shareToken: params.token.trim(),
      kind: FormKind.QUESTIONNAIRE,
    },
    include: {
      audiences: true,
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!form) {
    throw new FormsServiceError("Public questionnaire not found.", 404, "NOT_FOUND");
  }

  const openCheck = isQuestionnaireOpen(form);
  if (!openCheck.isOpen) {
    throw new FormsServiceError("This questionnaire is closed.", 403, openCheck.reason);
  }

  const audience = form.audiences[0];
  if (!audience || audience.kind !== FormAudienceKind.PUBLIC) {
    throw new FormsServiceError("This questionnaire is not open to the public.", 403, "FORBIDDEN");
  }

  const validation = validateAndNormalizeAnswers(form.questions, params.answers);
  if (!validation.ok || !validation.normalizedAnswers) {
    throw new FormsServiceError(validation.message ?? "Invalid answer submission.", 400, "VALIDATION");
  }

  const publicAnswers = validation.normalizedAnswers;
  if (!publicAnswers) {
    throw new FormsServiceError("No answers to record.", 400, "VALIDATION");
  }

  const submittedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const response = await tx.formResponse.create({
      data: {
        branchId: form.branchId,
        formId: form.id,
        respondentId: null,
        studentId: null,
        status: FormResponseStatus.COMPLETED,
        startedAt: submittedAt,
        submittedAt,
      },
    });

    await tx.formAnswer.createMany({
      data: publicAnswers.map((na) => ({
        branchId: form.branchId,
        responseId: response.id,
        formQuestionId: na.formQuestionId,
        value: na.value as never,
        createdAt: submittedAt,
      })),
    });
  });

  return {
    ok: true,
    submittedAt,
  };
}
