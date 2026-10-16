import { prisma } from "@/lib/db";
import { canAdminister } from "@/lib/auth/branch-access";

export type AttendanceArmGrantType = "ADMIN" | "CLASS_TEACHER" | "EXPLICIT_GRANT";

export type ArmAttendanceAccessResult =
  | {
      allowed: true;
      grantType: AttendanceArmGrantType;
      staffRecordId?: string;
      grantId?: string;
    }
  | {
      allowed: false;
      reason: "NOT_STAFF" | "ARM_NOT_FOUND" | "BRANCH_MISMATCH" | "FORBIDDEN";
    };

export class ForbiddenAttendanceError extends Error {
  constructor(message = "You are not authorized to record or view attendance for this arm") {
    super(message);
    this.name = "ForbiddenAttendanceError";
  }
}

/**
 * Checks whether a user has permission to view/mark attendance for a specific class arm.
 * Authorization hierarchy:
 * 1. Superadmin / Branch Admin in branchId -> allowed ("ADMIN")
 * 2. Class teacher of the arm -> allowed ("CLASS_TEACHER")
 * 3. Explicit AttendanceGrant holder for (branchId, staffRecordId, classArmId) -> allowed ("EXPLICIT_GRANT")
 * 4. Otherwise -> forbidden
 */
export async function checkArmAttendanceAccess(branchId: string, userId: string, classArmId: string): Promise<ArmAttendanceAccessResult> {
  // 1. Superadmin or Branch Admin
  const isAdmin = await canAdminister(userId, branchId);
  if (isAdmin) {
    return { allowed: true, grantType: "ADMIN" };
  }

  // 2. Arm must exist in this branch
  const arm = await prisma.classArm.findFirst({
    where: { id: classArmId, branchId, archivedAt: null },
    select: { id: true, classTeacherId: true, branchId: true },
  });
  if (!arm) {
    return { allowed: false, reason: "ARM_NOT_FOUND" };
  }

  // 3. User must have an active StaffRecord in this branch
  const staff = await prisma.staffRecord.findFirst({
    where: { branchId, userId, archivedAt: null },
    select: { id: true },
  });
  if (!staff) {
    return { allowed: false, reason: "NOT_STAFF" };
  }

  // 4. Designated Form/Class Teacher of the arm
  if (arm.classTeacherId === staff.id) {
    return { allowed: true, grantType: "CLASS_TEACHER", staffRecordId: staff.id };
  }

  // 5. Explicit AttendanceGrant
  const grant = await prisma.attendanceGrant.findUnique({
    where: {
      branchId_staffRecordId_classArmId: {
        branchId,
        staffRecordId: staff.id,
        classArmId,
      },
    },
    select: { id: true },
  });
  if (grant) {
    return { allowed: true, grantType: "EXPLICIT_GRANT", staffRecordId: staff.id, grantId: grant.id };
  }

  return { allowed: false, reason: "FORBIDDEN" };
}

/**
 * Asserts attendance access or throws ForbiddenAttendanceError.
 */
export async function assertArmAttendanceAccess(
  branchId: string,
  userId: string,
  classArmId: string,
): Promise<Extract<ArmAttendanceAccessResult, { allowed: true }>> {
  const result = await checkArmAttendanceAccess(branchId, userId, classArmId);
  if (!result.allowed) {
    throw new ForbiddenAttendanceError();
  }
  return result;
}

export type AuthorizedAttendanceArm = {
  id: string;
  branchId: string;
  name: string;
  capacity: number | null;
  classGroupId: string;
  classGroupName: string;
  grantType: AttendanceArmGrantType;
  classTeacher?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

/**
 * Lists all arms in a branch that the caller is authorized to view/mark attendance for.
 */
export async function listAvailableAttendanceArms(branchId: string, userId: string): Promise<AuthorizedAttendanceArm[]> {
  const isAdmin = await canAdminister(userId, branchId);

  if (isAdmin) {
    const allArms = await prisma.classArm.findMany({
      where: { branchId, archivedAt: null },
      include: {
        classGroup: { select: { id: true, name: true } },
        classTeacher: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ classGroup: { name: "asc" } }, { name: "asc" }],
    });

    return allArms.map((arm) => ({
      id: arm.id,
      branchId: arm.branchId,
      name: arm.name,
      capacity: arm.capacity,
      classGroupId: arm.classGroupId,
      classGroupName: arm.classGroup.name,
      grantType: "ADMIN" as const,
      classTeacher: arm.classTeacher,
    }));
  }

  // Non-admin: must have staff record
  const staff = await prisma.staffRecord.findFirst({
    where: { branchId, userId, archivedAt: null },
    select: { id: true },
  });
  if (!staff) {
    return [];
  }

  // Arms where staff is form teacher
  const classTeacherArms = await prisma.classArm.findMany({
    where: { branchId, classTeacherId: staff.id, archivedAt: null },
    include: {
      classGroup: { select: { id: true, name: true } },
      classTeacher: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ classGroup: { name: "asc" } }, { name: "asc" }],
  });

  // Arms where staff has explicit AttendanceGrant
  const explicitGrants = await prisma.attendanceGrant.findMany({
    where: { branchId, staffRecordId: staff.id, classArm: { archivedAt: null } },
    include: {
      classArm: {
        include: {
          classGroup: { select: { id: true, name: true } },
          classTeacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const armsMap = new Map<string, AuthorizedAttendanceArm>();

  for (const arm of classTeacherArms) {
    armsMap.set(arm.id, {
      id: arm.id,
      branchId: arm.branchId,
      name: arm.name,
      capacity: arm.capacity,
      classGroupId: arm.classGroupId,
      classGroupName: arm.classGroup.name,
      grantType: "CLASS_TEACHER",
      classTeacher: arm.classTeacher,
    });
  }

  for (const grant of explicitGrants) {
    const arm = grant.classArm;
    if (!armsMap.has(arm.id)) {
      armsMap.set(arm.id, {
        id: arm.id,
        branchId: arm.branchId,
        name: arm.name,
        capacity: arm.capacity,
        classGroupId: arm.classGroupId,
        classGroupName: arm.classGroup.name,
        grantType: "EXPLICIT_GRANT",
        classTeacher: arm.classTeacher,
      });
    }
  }

  return Array.from(armsMap.values()).sort((a, b) => a.classGroupName.localeCompare(b.classGroupName) || a.name.localeCompare(b.name));
}

/**
 * Grant management methods for branch administrators and superadmins.
 */

export async function createAttendanceGrant({
  branchId,
  actorUserId,
  staffRecordId,
  classArmId,
}: {
  branchId: string;
  actorUserId: string;
  staffRecordId: string;
  classArmId: string;
}) {
  const isAdmin = await canAdminister(actorUserId, branchId);
  if (!isAdmin) {
    throw new Error("Only branch administrators or superadmins can grant attendance access");
  }

  // Cross-branch checks: staff and arm must strictly belong to branchId
  const [staff, arm] = await Promise.all([
    prisma.staffRecord.findFirst({
      where: { id: staffRecordId, branchId, archivedAt: null },
      select: { id: true },
    }),
    prisma.classArm.findFirst({
      where: { id: classArmId, branchId, archivedAt: null },
      select: { id: true },
    }),
  ]);

  if (!staff) {
    throw new Error("Staff record not found in this branch");
  }
  if (!arm) {
    throw new Error("Class arm not found in this branch");
  }

  return prisma.attendanceGrant.upsert({
    where: {
      branchId_staffRecordId_classArmId: {
        branchId,
        staffRecordId,
        classArmId,
      },
    },
    create: {
      branchId,
      staffRecordId,
      classArmId,
      grantedByUserId: actorUserId,
    },
    update: {
      grantedByUserId: actorUserId,
      grantedAt: new Date(),
    },
    include: {
      staffRecord: { select: { id: true, firstName: true, lastName: true, email: true } },
      classArm: { include: { classGroup: { select: { name: true } } } },
    },
  });
}

export async function revokeAttendanceGrant({
  branchId,
  actorUserId,
  grantId,
}: {
  branchId: string;
  actorUserId: string;
  grantId: string;
}) {
  const isAdmin = await canAdminister(actorUserId, branchId);
  if (!isAdmin) {
    throw new Error("Only branch administrators or superadmins can revoke attendance access");
  }

  const existing = await prisma.attendanceGrant.findFirst({
    where: { id: grantId, branchId },
  });
  if (!existing) {
    throw new Error("Attendance grant not found in this branch");
  }

  return prisma.attendanceGrant.delete({
    where: { id: grantId },
  });
}

export async function listAttendanceGrants(branchId: string, actorUserId: string) {
  const isAdmin = await canAdminister(actorUserId, branchId);
  if (!isAdmin) {
    throw new Error("Only branch administrators or superadmins can inspect attendance grants");
  }

  return prisma.attendanceGrant.findMany({
    where: { branchId },
    include: {
      staffRecord: { select: { id: true, firstName: true, lastName: true, email: true } },
      classArm: { include: { classGroup: { select: { name: true } } } },
      grantedByUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { grantedAt: "desc" },
  });
}

export async function assignClassTeacher({
  branchId,
  actorUserId,
  classArmId,
  staffRecordId,
}: {
  branchId: string;
  actorUserId: string;
  classArmId: string;
  staffRecordId: string | null;
}) {
  const isAdmin = await canAdminister(actorUserId, branchId);
  if (!isAdmin) {
    throw new Error("Only branch administrators or superadmins can assign a class teacher");
  }

  const arm = await prisma.classArm.findFirst({
    where: { id: classArmId, branchId, archivedAt: null },
  });
  if (!arm) {
    throw new Error("Class arm not found in this branch");
  }

  if (staffRecordId) {
    const staff = await prisma.staffRecord.findFirst({
      where: { id: staffRecordId, branchId, archivedAt: null },
    });
    if (!staff) {
      throw new Error("Staff record not found in this branch");
    }
  }

  return prisma.classArm.update({
    where: { id: classArmId },
    data: { classTeacherId: staffRecordId },
    include: {
      classGroup: { select: { name: true } },
      classTeacher: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

/**
 * Idempotent backfill from active StaffSubjectAssignment into AttendanceGrant.
 */
export async function backfillAttendanceGrants(branchId?: string): Promise<number> {
  const where = branchId ? { branchId } : {};
  const assignments = await prisma.staffSubjectAssignment.findMany({
    where,
    select: {
      branchId: true,
      staffRecordId: true,
      classArmId: true,
    },
    distinct: ["branchId", "staffRecordId", "classArmId"],
  });

  let createdCount = 0;
  for (const a of assignments) {
    const existing = await prisma.attendanceGrant.findUnique({
      where: {
        branchId_staffRecordId_classArmId: {
          branchId: a.branchId,
          staffRecordId: a.staffRecordId,
          classArmId: a.classArmId,
        },
      },
    });
    if (!existing) {
      await prisma.attendanceGrant.create({
        data: {
          branchId: a.branchId,
          staffRecordId: a.staffRecordId,
          classArmId: a.classArmId,
          grantedByUserId: null,
        },
      });
      createdCount++;
    }
  }
  return createdCount;
}
