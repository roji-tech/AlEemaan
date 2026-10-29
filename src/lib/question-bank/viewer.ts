import { prisma } from "@/lib/db";
import { normalizeLabel } from "@/lib/question-bank/labels";
import type { BankViewer } from "@/lib/question-bank/rules";

/// Everything `rules.ts` needs to know about the person asking, read fresh in one round trip: whether they are a superadmin (only while they still hold an active
/// membership, as everywhere else), their ACTIVE memberships, their reviewer assignments, and the subjects they teach.
///
/// "The subjects they teach" are the person's `StaffSubjectAssignment` rows reached through `StaffRecord.userId`. A `Subject` is a per-branch row with a free-text name, while
/// the bank's `subjectKey` is the normalised name, so a teacher's subjects are the distinct folded names of those rows, per branch. An archived subject, or an archived staff
/// record, counts as no subject. Two branches that both teach "Mathematics" share a key, which is intended: whether a general item is visible across branches is decided by
/// its own `branchId`, not by the subject.
///
/// Called inside a transaction when a decision is being taken, so a person removed or deactivated a moment ago is not trusted on a read from before.
export async function loadViewer(
  userId: string,
  db: Pick<typeof prisma, "user" | "membership" | "questionBankReviewer" | "staffSubjectAssignment"> = prisma,
): Promise<BankViewer> {
  const [user, memberships, reviewerRows, assignments] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    db.membership.findMany({ where: { userId, deactivatedAt: null }, select: { branchId: true, role: true } }),
    db.questionBankReviewer.findMany({
      where: { userId },
      select: { branchId: true, scope: true, subjectKey: true, isExamApprover: true },
    }),
    db.staffSubjectAssignment.findMany({
      where: { staffRecord: { userId, archivedAt: null }, subject: { archivedAt: null } },
      select: { branchId: true, subject: { select: { name: true } } },
    }),
  ]);

  const seen = new Set<string>();
  const teaches: BankViewer["teaches"][number][] = [];
  for (const row of assignments) {
    const subjectKey = normalizeLabel(row.subject.name);
    if (!subjectKey) continue;
    const id = `${row.branchId}\u0000${subjectKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    teaches.push({ branchId: row.branchId, subjectKey });
  }

  return {
    userId,
    isSuperAdmin: Boolean(user?.isSuperAdmin) && memberships.length > 0,
    memberships,
    reviewerRows,
    teaches,
  };
}
