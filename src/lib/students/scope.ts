import { fail } from "@/lib/api/envelope";
import { prisma } from "@/lib/db";
import { canAdminister } from "@/lib/auth/branch-access";

// Who may ADMINISTER (write) a student record or a branch's students: a superadmin, or an administrator of the student's branch (plan S3).
// Reading is a different question, answered by `resolveBranchRole` (ADR 0012).

/// `null` when the caller may administer this student; otherwise the ONE answer the route returns. A student of another branch is
/// "no such student" (404), the same as an unknown id — never a 403 that confirms it exists.
export async function studentOutOfScope(userId: string, studentId: string): Promise<Response | null> {
  const found = await prisma.studentRecord.findUnique({ where: { id: studentId }, select: { branchId: true } });
  if (!found || !(await canAdminister(userId, found.branchId))) return fail("Student not found", 404, "NOT_FOUND");
  return null;
}

/// `null` when the caller administers this branch; otherwise 403. A branch named in a request body is not secret (the school's branches are
/// listed to its administrators), so this says what is wrong instead of pretending it does not exist.
export async function branchOutOfScope(userId: string, branchId: string): Promise<Response | null> {
  return (await canAdminister(userId, branchId)) ? null : fail("You don't administer that branch.", 403, "FORBIDDEN");
}

/// The branch a student record belongs to, or `null` for an unknown id - what `withBranch({ of })` looks up for an entity route (ADR 0015).
export async function studentBranchId(studentId: string): Promise<string | null> {
  return (await prisma.studentRecord.findUnique({ where: { id: studentId }, select: { branchId: true } }))?.branchId ?? null;
}

/// The refusal `withBranch` gives for a student the caller may not administer: the same words as `studentOutOfScope`, so no response changes.
export const studentNotFound = () => fail("Student not found", 404, "NOT_FOUND");
