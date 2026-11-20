import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/academics/structure";

// Deleting a staff record (task 0117, the maintainer, 2026-11-20: "I mistakenly added the main superadmin to staff ... maybe you should have the option to delete staff record for superadmins
// only"). The ONE explicit exception to "nothing here is ever deleted", for a SUPERADMIN only (the route checks), and only for a record with no history: a record that teaches, is a class
// teacher, holds attendance grants or timetable slots, takes part in a program or authored coursework is archived instead. The account and the membership of a linked record are never
// touched: the link goes with the record and the person stays a member of the branch.

type Counts = {
  assignments: number;
  teacherOfArms: number;
  attendanceGrants: number;
  timetableSlots: number;
  programPlaces: number;
  createdAssignments: number;
  gradedSubmissions: number;
  createdMaterials: number;
  createdQuizzes: number;
};

/// Why a record cannot be deleted, as sentences ("teaches 2 subject-and-class pairings"). Empty = it has no history. Pure.
export function deleteBlockers(c: Counts): string[] {
  const one = (n: number, singular: string, plural: string) => (n === 1 ? `1 ${singular}` : `${n} ${plural}`);
  const found: string[] = [];
  if (c.assignments > 0) found.push(`teaches ${one(c.assignments, "subject in a class", "subjects in classes")}`);
  if (c.teacherOfArms > 0) found.push(`is the class teacher of ${one(c.teacherOfArms, "class arm", "class arms")} (current or archived)`);
  if (c.attendanceGrants > 0) found.push(`holds ${one(c.attendanceGrants, "attendance permission", "attendance permissions")}`);
  if (c.timetableSlots > 0) found.push(`is on ${one(c.timetableSlots, "timetable slot", "timetable slots")}`);
  if (c.programPlaces > 0) found.push(`takes part in ${one(c.programPlaces, "program", "programs")}`);
  const coursework = c.createdAssignments + c.createdMaterials + c.createdQuizzes + c.gradedSubmissions;
  if (coursework > 0) found.push(`authored or graded ${one(coursework, "piece of coursework", "pieces of coursework")}`);
  return found;
}

export const DELETE_BLOCKED_PREFIX = "This record cannot be deleted because it";
/// The sentence the route answers with: the reasons, and what to do instead.
export const blockedMessage = (reasons: readonly string[]): string =>
  `${DELETE_BLOCKED_PREFIX} ${reasons.join(", ")}. Archive it instead: archiving hides it and keeps its history.`;

/// Deletes the record and writes `STAFF_DELETED` in the same transaction; `null` when there is no such record. 409 (`ConflictError`) with the reasons when it has history.
export async function deleteStaffRecord(actorUserId: string, id: string): Promise<{ id: string; name: string } | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.staffRecord.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              assignments: true,
              teacherOfArms: true,
              attendanceGrants: true,
              timetableSlots: true,
              programPlaces: true,
              createdAssignments: true,
              gradedSubmissions: true,
              createdMaterials: true,
              createdQuizzes: true,
            },
          },
        },
      });
      if (!row) return null;
      const reasons = deleteBlockers(row._count);
      if (reasons.length > 0) throw new ConflictError(blockedMessage(reasons));
      await tx.staffRecord.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STAFF_DELETED",
          targetType: "StaffRecord",
          targetId: id,
          beforeValue: {
            branchId: row.branchId,
            category: row.category,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            linkedUserId: row.userId,
            archived: row.archivedAt !== null,
          },
        },
      });
      return { id, name: `${row.firstName} ${row.lastName}` };
    });
  } catch (error) {
    // Something else still points at the record (a table this list does not know): the answer is the same as for history, never a server error.
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2003" || error.code === "P2014")) {
      throw new ConflictError(
        `${DELETE_BLOCKED_PREFIX} is still used elsewhere. Archive it instead: archiving hides it and keeps its history.`,
      );
    }
    throw error;
  }
}
