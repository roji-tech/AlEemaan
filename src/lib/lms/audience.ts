import { resolveBranchRole } from "@/lib/auth/branch-access";

/// What a reader of coursework may see. Found by the browser security run (2026-10-19): the read routes answered a STUDENT or PARENT membership exactly as they
/// answer a teacher, so a pupil's session received every quiz's `correctAnswer`, draft work, and every classmate's submission (with names). Staff of the branch keep
/// the full view; anyone else gets published items only, with the answer key and other pupils' work removed.
export const isBranchStaff = async (userId: string, branchId: string): Promise<boolean> => (await resolveBranchRole(userId, branchId)) !== null;

type WithQuestions = { questions?: { correctAnswer?: string }[]; attempts?: unknown };

/// A copy of a question with its answer key taken off.
const withoutAnswer = <Q extends { correctAnswer?: string }>(question: Q): Q => {
  const copy = { ...question };
  delete copy.correctAnswer;
  return copy;
};

export function hideAnswerKey<T extends WithQuestions>(quiz: T): T {
  return {
    ...quiz,
    ...(quiz.questions ? { questions: quiz.questions.map((q) => withoutAnswer(q)) } : {}),
    ...("attempts" in quiz ? { attempts: [] } : {}),
  };
}

export function hideSubmissions<T extends { submissions?: unknown }>(assignment: T): T {
  return "submissions" in assignment ? { ...assignment, submissions: [] } : assignment;
}
