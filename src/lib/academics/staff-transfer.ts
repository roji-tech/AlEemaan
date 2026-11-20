import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mayAdminister, type AdminScope } from "@/lib/auth/branch-access";
import { roleForCategory } from "@/lib/academics/staff";

// Transfer a member of staff to another branch, or add them to another branch as well (task 0114, task 0101 R1: "a teacher teaching in two or more branches"). Nothing is typed again.
//
// Both make a record in the other branch with the person's own details (names, title, gender, contacts, qualification, corps member, job title, role, next of kin) and tie the two records with
// one `personId`, so each card says "Also in …". What belongs to a branch is never copied: subjects and arms taught, class-teacher roles, attendance grants, standing, program places.
//   - "also":  the record here stays as it is.
//   - "move":  the record here is archived, and what it held in this branch ends with it: its subject assignments and attendance grants are removed and its class-teacher roles cleared
//              (the dialog says how many first). The audit entry keeps the counts.
// The sign-in follows the person: when the record here has an account, the account becomes a member of the other branch with the role the kind gives (never an administrator) and is linked to
// the new record; on a move, its membership here is deactivated (they lose this branch, as a transfer means). A deactivated membership in the other branch is left alone and reported.
// Who: a superadmin, or an administrator of BOTH branches. Everything runs in one transaction.

export type TransferMode = "move" | "also";
export type TransferResult =
  | { ok: false; status: 404 | 403 | 409; message: string }
  | {
      ok: true;
      newId: string;
      branchName: string;
      account: "none" | "linked" | "deactivated-there";
      ended: { assignments: number; classTeacher: number; grants: number };
    };

const COPY = {
  category: true,
  title: true,
  firstName: true,
  middleName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  email: true,
  address: true,
  designation: true,
  qualification: true,
  corpsMember: true,
  role: true,
  employmentDate: true,
  nextOfKinName: true,
  nextOfKinRelationship: true,
  nextOfKinPhone: true,
  nextOfKinAddress: true,
} satisfies Prisma.StaffRecordSelect;

/// What a move would end, for the dialog to say before anyone confirms. Null for a record the caller may not act on.
export async function transferPreview(scope: AdminScope, staffId: string) {
  const record = await prisma.staffRecord.findUnique({
    where: { id: staffId },
    select: { branchId: true, archivedAt: true, _count: { select: { assignments: true, teacherOfArms: true, attendanceGrants: true } } },
  });
  if (!record || !mayAdminister(scope, record.branchId)) return null;
  return { assignments: record._count.assignments, classTeacher: record._count.teacherOfArms, grants: record._count.attendanceGrants };
}

export async function transferStaff(
  actorUserId: string,
  scope: AdminScope,
  staffId: string,
  input: { toBranchId: string; mode: TransferMode },
): Promise<TransferResult> {
  const source = await prisma.staffRecord.findUnique({ where: { id: staffId }, select: { branchId: true } });
  // Not found and not yours answer alike, so the answer never says that a record exists in a branch you do not run.
  if (!source || !mayAdminister(scope, source.branchId)) return { ok: false, status: 404, message: "Staff record not found." };
  if (!mayAdminister(scope, input.toBranchId))
    return { ok: false, status: 403, message: "You can only move or add staff to a branch you administer." };
  if (input.toBranchId === source.branchId) return { ok: false, status: 409, message: "Choose a different branch." };

  try {
    return await prisma.$transaction(async (tx): Promise<TransferResult> => {
      // Two transfers of the same person at once queue here.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff-transfer:${staffId}`}::text))`;
      const record = await tx.staffRecord.findUnique({
        where: { id: staffId },
        select: { ...COPY, id: true, branchId: true, userId: true, personId: true, archivedAt: true, standing: true, isDraft: true },
      });
      const target = await tx.branch.findUnique({ where: { id: input.toBranchId }, select: { id: true, name: true } });
      if (!record || !target) return { ok: false, status: 404, message: "Staff record not found." };
      if (record.archivedAt) return { ok: false, status: 409, message: "Restore this record before moving it." };
      if (record.isDraft)
        return { ok: false, status: 409, message: "Complete this draft before moving it or adding it to another branch." };
      if (record.standing !== "ACTIVE") return { ok: false, status: 409, message: "Lift the suspension before moving this person." };
      const personId = record.personId ?? randomUUID();
      const there = await tx.staffRecord.findFirst({
        where: {
          branchId: target.id,
          archivedAt: null,
          OR: [{ personId }, ...(record.email ? [{ email: { equals: record.email, mode: Prisma.QueryMode.insensitive } }] : [])],
        },
        select: { id: true },
      });
      if (there)
        return {
          ok: false,
          status: 409,
          message: `${target.name} already has a staff record for this person (or one with the same e-mail).`,
        };

      const { id: _id, branchId: _b, userId, personId: _p, archivedAt: _a, standing: _s, ...details } = record;
      (void _id, _b, _p, _a, _s);
      if (!record.personId) await tx.staffRecord.update({ where: { id: record.id }, data: { personId } });
      const created = await tx.staffRecord.create({ data: { ...details, branchId: target.id, personId }, select: { id: true } });

      // The sign-in follows the person.
      let account: "none" | "linked" | "deactivated-there" = "none";
      if (userId) {
        const role = roleForCategory(record.category);
        const membership = await tx.membership.findUnique({
          where: { userId_branchId: { userId, branchId: target.id } },
          select: { role: true, deactivatedAt: true },
        });
        if (membership?.deactivatedAt) account = "deactivated-there";
        else {
          if (!membership) await tx.membership.create({ data: { userId, branchId: target.id, role } });
          const free = (await tx.staffRecord.count({ where: { branchId: target.id, userId } })) === 0;
          if (free && (!membership || membership.role === role)) {
            await tx.staffRecord.update({ where: { id: created.id }, data: { userId } });
            account = "linked";
          }
        }
      }

      const ended = { assignments: 0, classTeacher: 0, grants: 0 };
      if (input.mode === "move") {
        ended.assignments = (await tx.staffSubjectAssignment.deleteMany({ where: { staffRecordId: record.id } })).count;
        ended.classTeacher = (await tx.classArm.updateMany({ where: { classTeacherId: record.id }, data: { classTeacherId: null } })).count;
        ended.grants = (await tx.attendanceGrant.deleteMany({ where: { staffRecordId: record.id } })).count;
        await tx.staffRecord.update({ where: { id: record.id }, data: { archivedAt: new Date() } });
        if (userId)
          await tx.membership.updateMany({
            where: { userId, branchId: record.branchId, deactivatedAt: null },
            data: { deactivatedAt: new Date() },
          });
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: input.mode === "move" ? "STAFF_TRANSFERRED" : "STAFF_ADDED_TO_BRANCH",
          targetType: "StaffRecord",
          targetId: record.id,
          afterValue: { toBranchId: target.id, newRecordId: created.id, personId, account, ended },
          beforeValue: { branchId: record.branchId },
        },
      });
      return { ok: true, newId: created.id, branchName: target.name, account, ended };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { ok: false, status: 409, message: "The other branch already has a staff record with this e-mail address." };
    throw error;
  }
}
