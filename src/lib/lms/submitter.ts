import { resolveBranchRole } from "@/lib/auth/branch-access";
import { prisma } from "@/lib/db";

/// Whose work is this? Found by the browser security run (2026-10-19): the submit and quiz-attempt routes took `studentId` from the body for anyone, so a
/// student of a branch could hand in work, or take a quiz, as a classmate. Now only STAFF of that branch (a teacher or admin recording work for a pupil) may name
/// a pupil, and the pupil must belong to that branch. Anyone else (a STUDENT or PARENT membership) is refused: a pupil record is not linked to a login account,
/// so there is no way to say "this is me" on a staff session; pupils and guardians act through the portal.
export async function resolveSubmitter(
  userId: string,
  branchId: string,
  studentId: unknown,
): Promise<{ ok: true; studentId: string } | { ok: false; message: string; status: 400 | 403 }> {
  if ((await resolveBranchRole(userId, branchId)) === null) {
    return { ok: false, message: "Pupils hand in work through the portal, not a staff sign-in.", status: 403 };
  }
  if (typeof studentId !== "string" || !studentId) {
    return { ok: false, message: "studentId is required to record work for a pupil", status: 400 };
  }
  const pupil = await prisma.studentRecord.findFirst({ where: { id: studentId, branchId }, select: { id: true } });
  if (!pupil) return { ok: false, message: "That pupil is not in this branch.", status: 400 };
  return { ok: true, studentId: pupil.id };
}
