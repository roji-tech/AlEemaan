import { SubmissionStatus } from "@prisma/client";

export interface SubmissionStatusResolution {
  status: SubmissionStatus;
  isLate: boolean;
  isAllowed: boolean;
}

/**
 * Resolves assignment submission status based on deadlines and late policy.
 */
export function resolveSubmissionStatus(
  dueDate: Date | string | null | undefined,
  allowLate: boolean = true,
  submittedAt: Date = new Date()
): SubmissionStatusResolution {
  if (!dueDate) {
    return { status: SubmissionStatus.SUBMITTED, isLate: false, isAllowed: true };
  }

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const isLate = submittedAt.getTime() > due.getTime();

  if (isLate) {
    if (!allowLate) {
      return { status: SubmissionStatus.PENDING, isLate: true, isAllowed: false };
    }
    return { status: SubmissionStatus.LATE, isLate: true, isAllowed: true };
  }

  return { status: SubmissionStatus.SUBMITTED, isLate: false, isAllowed: true };
}

export interface QuizQuestionItem {
  id: string;
  correctAnswer: string;
  points: number;
}

export interface QuizAnswerItem {
  questionId: string;
  answer: string;
}

export interface QuizScoreResult {
  totalPoints: number;
  earnedPoints: number;
  percentage: number;
  isPassed: boolean;
  questionResults: { questionId: string; isCorrect: boolean; pointsEarned: number }[];
}

/**
 * Automatically grades quiz answers against questions and computes pass/fail metrics.
 */
export function evaluateQuizAttempt(
  questions: QuizQuestionItem[],
  answers: QuizAnswerItem[],
  passingScore?: number | null
): QuizScoreResult {
  const answerMap = new Map<string, string>();
  for (const a of answers) {
    answerMap.set(a.questionId, a.answer.trim().toLowerCase());
  }

  let totalPoints = 0;
  let earnedPoints = 0;
  const questionResults: { questionId: string; isCorrect: boolean; pointsEarned: number }[] = [];

  for (const q of questions) {
    const qPoints = Math.max(1, q.points || 1);
    totalPoints += qPoints;

    const provided = answerMap.get(q.id);
    const expected = q.correctAnswer.trim().toLowerCase();
    const isCorrect = provided !== undefined && provided === expected;

    const pointsEarned = isCorrect ? qPoints : 0;
    earnedPoints += pointsEarned;

    questionResults.push({
      questionId: q.id,
      isCorrect,
      pointsEarned,
    });
  }

  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100 * 10) / 10 : 0;
  const threshold = passingScore ?? 50;
  const isPassed = percentage >= threshold;

  return {
    totalPoints,
    earnedPoints,
    percentage,
    isPassed,
    questionResults,
  };
}

/**
 * Calculates grade status and letter band for speed grader.
 */
export function computePercentageScore(score: number, totalPoints: number): number {
  if (totalPoints <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((score / totalPoints) * 100 * 10) / 10));
}
