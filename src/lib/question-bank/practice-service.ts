import { Prisma, PracticeFeedbackMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeLabel } from "@/lib/question-bank/labels";
import { getEffectiveBankSettings } from "@/lib/question-bank/settings-service";
import { getPortalAccess } from "@/lib/portal/access-service";
import { accessFor, type Actor } from "@/lib/portal/access";
import {
  scrubQuestionForPupil,
  evaluatePracticeAnswer,
  computeDailyCapRemaining,
  determineSessionSize,
  aggregateGuardianSummary,
  type GuardianPracticeSummary,
} from "./practice";

export class PracticeError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "PRACTICE_ERROR",
  ) {
    super(message);
    this.name = "PracticeError";
  }
}

/**
 * Returns beginning of today in UTC.
 */
function getStartOfTodayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Shuffles an array in place (Fisher-Yates).
 */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Retrieves pupil's active class group enrollment.
 */
async function getStudentClassGroup(studentId: string) {
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId },
    orderBy: { enrolledAt: "desc" },
    include: {
      classArm: {
        select: {
          classGroupId: true,
          classGroup: { select: { id: true, name: true } },
        },
      },
    },
  });

  const classGroupId = enrollment?.classArm?.classGroupId ?? null;
  const classGroupName = enrollment?.classArm?.classGroup?.name ?? enrollment?.className ?? null;
  const classKey = classGroupName ? normalizeLabel(classGroupName) : null;

  return { classGroupId, classGroupName, classKey };
}

/**
 * Counts the questions a pupil has taken on today (UTC): the ones answered, plus the ones in sessions started today that are still open and not yet answered. The
 * cap is about what a pupil sets out to do, so a session that is started and not answered has used its questions; finishing it gives the unanswered ones back.
 */
async function countTodayAttempts(
  branchId: string,
  studentId: string,
  now = new Date(),
  db: Pick<typeof prisma, "practiceAttempt" | "practiceSession"> = prisma,
): Promise<number> {
  const todayUtc = getStartOfTodayUtc(now);
  const [answered, open] = await Promise.all([
    db.practiceAttempt.count({ where: { branchId, studentId, answeredAt: { gte: todayUtc } } }),
    db.practiceSession.findMany({
      where: { branchId, studentId, finishedAt: null, startedAt: { gte: todayUtc } },
      select: { size: true, _count: { select: { attempts: true } } },
    }),
  ]);
  const reserved = open.reduce((sum, session) => sum + Math.max(0, session.size - session._count.attempts), 0);
  return answered + reserved;
}

/**
 * Returns available practice subjects, topics, and question counts for a student.
 */
export async function getPracticeOptions(params: {
  studentId: string;
  branchId: string;
  actor: Actor;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const [settings, portalAccess] = await Promise.all([
    getEffectiveBankSettings(params.branchId),
    getPortalAccess(params.branchId),
  ]);

  if (!settings["bank.access.pupils"]) {
    return { available: false, reason: "Practice is closed for this branch." };
  }

  const access = accessFor(portalAccess, params.actor);
  if (access.practice === "NONE") {
    return { available: false, reason: "Practice access is not available." };
  }

  const { classGroupName, classKey } = await getStudentClassGroup(params.studentId);
  const todayAttempts = await countTodayAttempts(params.branchId, params.studentId, now);
  const dailyCap = settings["bank.practice.dailyCap"];
  const dailyCapRemaining = computeDailyCapRemaining(todayAttempts, dailyCap);

  // Query pool of active PRACTICE items
  const where: Prisma.QuestionBankItemWhereInput = {
    bank: "ASSESSMENT",
    status: "APPROVED",
    OR: [{ branchId: params.branchId }, { branchId: null }],
    AND: [
      {
        OR: [
          { visibility: "PRACTICE" },
          { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: { lte: now } },
        ],
      },
    ],
  };

  // A pupil the school has not placed in a class is shown only the questions that name no class, never every class's.
  (where.AND as Prisma.QuestionBankItemWhereInput[]).push(
    classKey
      ? { OR: [{ classTags: { none: {} } }, { classTags: { some: { labelKey: classKey } } }] }
      : { classTags: { none: {} } },
  );

  const items = await prisma.questionBankItem.findMany({
    where,
    select: {
      subjectLabel: true,
      subjectKey: true,
      topic: true,
    },
  });

  const subjectMap = new Map<string, { label: string; count: number; topics: Map<string, number> }>();
  for (const item of items) {
    const subLabel = item.subjectLabel?.trim() || "General";
    const subKey = item.subjectKey || normalizeLabel(subLabel);
    const topic = item.topic?.trim() || "All Topics";

    const cur = subjectMap.get(subKey) ?? { label: subLabel, count: 0, topics: new Map() };
    cur.count++;
    cur.topics.set(topic, (cur.topics.get(topic) ?? 0) + 1);
    subjectMap.set(subKey, cur);
  }

  const minPoolSize = settings["bank.practice.minPoolSize"];
  const availableSubjects: Array<{ subject: string; count: number; topics: Array<{ topic: string; count: number }> }> = [];

  for (const [, val] of subjectMap.entries()) {
    if (val.count >= minPoolSize) {
      availableSubjects.push({
        subject: val.label,
        count: val.count,
        topics: Array.from(val.topics.entries()).map(([topic, count]) => ({ topic, count })),
      });
    }
  }

  return {
    available: true,
    classGroupName,
    dailyCap,
    todayAttempted: todayAttempts,
    dailyCapRemaining,
    minPoolSize,
    defaultQuestions: settings["bank.practice.defaultQuestions"],
    presets: settings["bank.practice.presets"],
    subjects: availableSubjects,
  };
}

/**
 * Starts a new pupil practice session, drawing a randomized question set.
 */
export async function startPracticeSession(params: {
  studentId: string;
  branchId: string;
  actor: Actor;
  subjectLabel?: string;
  topic?: string;
  size?: number;
  feedbackMode?: PracticeFeedbackMode;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  if (params.actor !== "PUPIL") {
    throw new PracticeError("Your sign-in does not include this.", 403, "PORTAL_ACCESS");
  }

  const [settings, portalAccess] = await Promise.all([
    getEffectiveBankSettings(params.branchId),
    getPortalAccess(params.branchId),
  ]);

  if (!settings["bank.access.pupils"]) {
    throw new PracticeError("Practice is currently closed.", 403, "PRACTICE_CLOSED");
  }

  const access = accessFor(portalAccess, params.actor);
  if (access.practice !== "FULL") {
    throw new PracticeError("Practice access is not permitted.", 403, "PORTAL_ACCESS");
  }

  const todayAttempts = await countTodayAttempts(params.branchId, params.studentId, now);
  const dailyCap = settings["bank.practice.dailyCap"];
  const dailyCapRemaining = computeDailyCapRemaining(todayAttempts, dailyCap);

  if (dailyCapRemaining <= 0) {
    throw new PracticeError("Daily practice limit reached. Try again tomorrow.", 429, "DAILY_CAP_REACHED");
  }

  const { classGroupId, classKey } = await getStudentClassGroup(params.studentId);

  const where: Prisma.QuestionBankItemWhereInput = {
    bank: "ASSESSMENT",
    status: "APPROVED",
    OR: [{ branchId: params.branchId }, { branchId: null }],
    AND: [
      {
        OR: [
          { visibility: "PRACTICE" },
          { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: { lte: now } },
        ],
      },
    ],
  };

  // A pupil the school has not placed in a class is shown only the questions that name no class, never every class's.
  (where.AND as Prisma.QuestionBankItemWhereInput[]).push(
    classKey
      ? { OR: [{ classTags: { none: {} } }, { classTags: { some: { labelKey: classKey } } }] }
      : { classTags: { none: {} } },
  );
  if (params.subjectLabel) {
    where.subjectKey = normalizeLabel(params.subjectLabel);
  }
  if (params.topic) {
    where.topic = params.topic;
  }

  const items = await prisma.questionBankItem.findMany({
    where,
    select: {
      id: true,
      bank: true,
      status: true,
      type: true,
      prompt: true,
      explanation: true,
      points: true,
      difficulty: true,
      topic: true,
      options: true,
      correctAnswer: true,
      subjectLabel: true,
      subjectKey: true,
      visibility: true,
      visibleFrom: true,
    },
  });

  const minPoolSize = settings["bank.practice.minPoolSize"];
  if (items.length < minPoolSize) {
    // Design Rule 8.4: Below minPoolSize, practice is not offered; no exam disclosure
    throw new PracticeError("Practice pool is too small for this selection.", 400, "POOL_TOO_SMALL");
  }

  const sessionSize = Math.min(
    determineSessionSize(params.size, items.length, {
      maxQuestions: settings["bank.practice.maxQuestions"],
      defaultQuestions: settings["bank.practice.defaultQuestions"],
      presets: settings["bank.practice.presets"],
    }),
    dailyCapRemaining,
  );

  if (sessionSize <= 0) {
    throw new PracticeError("Cannot start session with 0 questions.", 400, "INVALID_SIZE");
  }

  // The cap is checked again inside a transaction that holds a lock for this pupil, so several sessions started at the same moment cannot each see room.
  const { session, shuffled } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`practice:${params.studentId}`}::text))`;
    const remaining = computeDailyCapRemaining(await countTodayAttempts(params.branchId, params.studentId, now, tx), dailyCap);
    if (remaining <= 0) {
      throw new PracticeError("Daily practice limit reached. Try again tomorrow.", 429, "DAILY_CAP_REACHED");
    }
    const size = Math.min(sessionSize, remaining);
    const picked = shuffle(items).slice(0, size);
    const created = await tx.practiceSession.create({
      data: {
        branchId: params.branchId,
        studentId: params.studentId,
        classGroupId,
        subjectLabel: params.subjectLabel?.trim() ?? null,
        subjectKey: params.subjectLabel ? normalizeLabel(params.subjectLabel) : null,
        topic: params.topic?.trim() ?? null,
        size,
        feedbackMode: params.feedbackMode ?? PracticeFeedbackMode.EACH,
        itemIds: picked.map((i) => i.id),
      },
    });
    return { session: created, shuffled: picked };
  });

  return {
    session: {
      id: session.id,
      size: session.size,
      feedbackMode: session.feedbackMode,
      startedAt: session.startedAt,
      subjectLabel: session.subjectLabel,
      topic: session.topic,
    },
    questions: shuffled.map(scrubQuestionForPupil),
  };
}

/**
 * Submits an answer for a question in a practice session.
 */
export async function submitPracticeAnswer(params: {
  studentId: string;
  branchId: string;
  actor: Actor;
  sessionId: string;
  bankItemId: string;
  answer: unknown;
}) {
  if (params.actor !== "PUPIL") {
    throw new PracticeError("Your sign-in does not include this.", 403, "PORTAL_ACCESS");
  }

  // Practice may be closed, or the pupil's level lowered, after the session started: each answer is checked again, as starting a session is.
  const [settings, portalAccess] = await Promise.all([getEffectiveBankSettings(params.branchId), getPortalAccess(params.branchId)]);
  if (!settings["bank.access.pupils"]) {
    throw new PracticeError("Practice is currently closed.", 403, "PRACTICE_CLOSED");
  }
  if (accessFor(portalAccess, params.actor).practice !== "FULL") {
    throw new PracticeError("Practice access is not permitted.", 403, "PORTAL_ACCESS");
  }

  const session = await prisma.practiceSession.findUnique({
    where: { branchId_id: { branchId: params.branchId, id: params.sessionId } },
  });

  if (!session || session.studentId !== params.studentId) {
    throw new PracticeError("Practice session not found", 404, "NOT_FOUND");
  }

  if (session.finishedAt) {
    throw new PracticeError("This practice session has already been completed.", 400, "SESSION_FINISHED");
  }

  const itemIds = session.itemIds as string[];
  if (!itemIds.includes(params.bankItemId)) {
    throw new PracticeError("Question is not part of this practice session.", 400, "INVALID_QUESTION");
  }

  const item = await prisma.questionBankItem.findUnique({
    where: { id: params.bankItemId },
    select: {
      id: true,
      type: true,
      correctAnswer: true,
      explanation: true,
      version: true,
    },
  });

  if (!item) {
    throw new PracticeError("Question not found", 404, "NOT_FOUND");
  }

  const evaluation = evaluatePracticeAnswer(item, params.answer);

  // One answer per question: the check and the write are made together under a lock for this session, so two answers sent at the same moment cannot both be written.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`practice-answer:${session.id}`}::text))`;
    const existing = await tx.practiceAttempt.findFirst({ where: { sessionId: session.id, bankItemId: params.bankItemId } });
    if (existing) {
      throw new PracticeError("You have already answered this question in this session.", 400, "ALREADY_ANSWERED");
    }
    await tx.practiceAttempt.create({
      data: {
        sessionId: session.id,
        branchId: params.branchId,
        studentId: params.studentId,
        bankItemId: item.id,
        version: item.version,
        answer: (params.answer ?? null) as Prisma.InputJsonValue,
        correct: evaluation.correct,
      },
    });
  });

  if (session.feedbackMode === PracticeFeedbackMode.EACH) {
    return {
      ok: true,
      answered: true,
      correct: evaluation.correct,
      correctAnswer: evaluation.correctAnswer,
      explanation: evaluation.explanation,
    };
  }

  // Under END mode: acknowledge answer without revealing answer key or explanation
  return {
    ok: true,
    answered: true,
  };
}

/**
 * Concludes a practice session and returns full session summary.
 */
export async function finishPracticeSession(params: {
  studentId: string;
  branchId: string;
  actor: Actor;
  sessionId: string;
}) {
  // The summary carries the questions, the pupil's answers, the answer key and the explanations: only the pupil, whatever a guardian's practice level is.
  if (params.actor !== "PUPIL") {
    throw new PracticeError("Your sign-in does not include this.", 403, "PORTAL_ACCESS");
  }

  const session = await prisma.practiceSession.findUnique({
    where: { branchId_id: { branchId: params.branchId, id: params.sessionId } },
    include: { attempts: true },
  });

  if (!session || session.studentId !== params.studentId) {
    throw new PracticeError("Practice session not found", 404, "NOT_FOUND");
  }

  const finishedAt = session.finishedAt ?? new Date();
  if (!session.finishedAt) {
    await prisma.practiceSession.update({
      where: { id: session.id },
      data: { finishedAt },
    });
  }

  const itemIds = session.itemIds as string[];
  const items = await prisma.questionBankItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      prompt: true,
      type: true,
      options: true,
      correctAnswer: true,
      explanation: true,
    },
  });

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const detailedAttempts = session.attempts.map((att) => {
    const q = itemMap.get(att.bankItemId);
    return {
      id: att.id,
      bankItemId: att.bankItemId,
      prompt: q?.prompt ?? "",
      answer: att.answer,
      correct: att.correct,
      correctAnswer: q?.correctAnswer ?? null,
      explanation: q?.explanation ?? null,
      answeredAt: att.answeredAt,
    };
  });

  const totalCorrect = session.attempts.filter((a) => a.correct).length;

  return {
    id: session.id,
    size: session.size,
    feedbackMode: session.feedbackMode,
    startedAt: session.startedAt,
    finishedAt,
    totalAttempted: session.attempts.length,
    totalCorrect,
    overallAccuracy: session.attempts.length > 0 ? Math.round((totalCorrect / session.attempts.length) * 100) : 0,
    attempts: detailedAttempts,
  };
}

/**
 * Retrieves pupil's practice history, conforming to pupil vs guardian privacy levels.
 */
export async function getPracticeHistory(params: {
  studentId: string;
  branchId: string;
  actor: Actor;
  archived?: boolean;
}) {
  const portalAccess = await getPortalAccess(params.branchId);
  const access = accessFor(portalAccess, params.actor);

  if (access.practice === "NONE") {
    throw new PracticeError("Your sign-in does not include this.", 403, "PORTAL_ACCESS");
  }

  // A summary level is a summary for whoever it is set for, the pupil included.
  if (access.practice === "SUMMARY") {
    const sessionsCount = await prisma.practiceSession.count({
      where: { branchId: params.branchId, studentId: params.studentId },
    });

    const attempts = await prisma.practiceAttempt.findMany({
      where: {
        branchId: params.branchId,
        studentId: params.studentId,
        archivedAt: null,
      },
      include: {
        bankItem: { select: { subjectLabel: true, topic: true } },
      },
    });

    const summary: GuardianPracticeSummary = aggregateGuardianSummary(
      sessionsCount,
      attempts.map((a) => ({
        correct: a.correct,
        subjectLabel: a.bankItem.subjectLabel,
        topic: a.bankItem.topic,
      })),
    );

    return { mode: "SUMMARY" as const, summary };
  }

  // FULL mode: detailed session and attempts list
  const sessions = await prisma.practiceSession.findMany({
    where: { branchId: params.branchId, studentId: params.studentId },
    orderBy: { startedAt: "desc" },
    include: {
      attempts: {
        where: params.archived ? { archivedAt: { not: null } } : { archivedAt: null },
        include: {
          bankItem: {
            select: { prompt: true, type: true, options: true, correctAnswer: true, explanation: true },
          },
        },
        orderBy: { answeredAt: "asc" },
      },
    },
  });

  return {
    mode: "FULL" as const,
    sessions: sessions.map((s) => ({
      id: s.id,
      size: s.size,
      feedbackMode: s.feedbackMode,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      subjectLabel: s.subjectLabel,
      topic: s.topic,
      totalAttempted: s.attempts.length,
      totalCorrect: s.attempts.filter((a) => a.correct).length,
      attempts: s.attempts.map((a) => ({
        id: a.id,
        bankItemId: a.bankItemId,
        prompt: a.bankItem.prompt,
        answer: a.answer,
        correct: a.correct,
        correctAnswer: a.bankItem.correctAnswer,
        explanation: a.bankItem.explanation,
        answeredAt: a.answeredAt,
        archivedAt: a.archivedAt,
      })),
    })),
  };
}

/**
 * Toggles archival status of a practice attempt.
 */
export async function archivePracticeAttempt(params: {
  studentId: string;
  branchId: string;
  actor: Actor;
  attemptId: string;
  archived: boolean;
}) {
  // Archiving changes what the guardian's summary counts, so it is the pupil's own choice.
  if (params.actor !== "PUPIL") {
    throw new PracticeError("Your sign-in does not include this.", 403, "PORTAL_ACCESS");
  }

  const attempt = await prisma.practiceAttempt.findUnique({
    where: { branchId_id: { branchId: params.branchId, id: params.attemptId } },
  });

  if (!attempt || attempt.studentId !== params.studentId) {
    throw new PracticeError("Practice attempt not found", 404, "NOT_FOUND");
  }

  const updated = await prisma.practiceAttempt.update({
    where: { id: attempt.id },
    data: {
      archivedAt: params.archived ? new Date() : null,
    },
    select: { id: true, archivedAt: true },
  });

  return { ok: true, id: updated.id, archived: Boolean(updated.archivedAt) };
}
