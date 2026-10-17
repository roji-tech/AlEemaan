import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import {
  checkArmAttendanceAccess,
  listAvailableAttendanceArms,
  createAttendanceGrant,
  revokeAttendanceGrant,
  assignClassTeacher,
  backfillAttendanceGrants,
} from "@/lib/attendance/access";

let home: { id: string };
let otherBranch: { id: string };

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  otherBranch = await db.branch.findFirstOrThrow({
    where: { id: { not: home.id } },
    orderBy: { name: "asc" },
  });
});

test.describe("Task 0019: Attendance Permissions Domain & Access Control", () => {
  test("access resolution matrix: admin, class teacher, explicit grant, unassigned teacher, non-staff", async () => {
    // 1. Setup Admin (branch administrator, not superadmin to test branch-scoped admin logic)
    const adminUser = await createUser({ role: Role.ADMIN, superAdmin: false, name: "Admin User" });

    // 2. Setup Class Group & Arm
    const classGroup = await db.classGroup.create({
      data: { branchId: home.id, name: "Basic 1" },
    });
    const arm = await db.classArm.create({
      data: { branchId: home.id, classGroupId: classGroup.id, name: "Gold" },
    });

    // 3. Setup Class Teacher
    const formTeacherUser = await createUser({ role: Role.TEACHING_STAFF, name: "Form Teacher" });
    const formStaff = await db.staffRecord.create({
      data: { branchId: home.id, userId: formTeacherUser.id, category: "TEACHING", firstName: "Form", lastName: "Teacher" },
    });
    await db.classArm.update({
      where: { id: arm.id },
      data: { classTeacherId: formStaff.id },
    });

    // 4. Setup Granted Teacher (not form teacher, but holds explicit grant)
    const grantedUser = await createUser({ role: Role.TEACHING_STAFF, name: "Granted Teacher" });
    const grantedStaff = await db.staffRecord.create({
      data: { branchId: home.id, userId: grantedUser.id, category: "TEACHING", firstName: "Granted", lastName: "Teacher" },
    });
    await db.attendanceGrant.create({
      data: {
        branchId: home.id,
        staffRecordId: grantedStaff.id,
        classArmId: arm.id,
        grantedByUserId: adminUser.id,
      },
    });

    // 5. Setup Unassigned Teacher (in branch, but no arm assignment)
    const unassignedUser = await createUser({ role: Role.TEACHING_STAFF, name: "Unassigned Teacher" });
    await db.staffRecord.create({
      data: { branchId: home.id, userId: unassignedUser.id, category: "TEACHING", firstName: "Unassigned", lastName: "Teacher" },
    });

    // 6. Setup Non-Staff User (Parent)
    const parentUser = await createUser({ role: Role.PARENT, name: "Parent User" });

    // Assertions
    // Admin -> Allowed (grantType: "ADMIN")
    const adminAccess = await checkArmAttendanceAccess(home.id, adminUser.id, arm.id);
    expect(adminAccess.allowed).toBe(true);
    if (adminAccess.allowed) expect(adminAccess.grantType).toBe("ADMIN");

    // Class Teacher -> Allowed (grantType: "CLASS_TEACHER")
    const formAccess = await checkArmAttendanceAccess(home.id, formTeacherUser.id, arm.id);
    expect(formAccess.allowed).toBe(true);
    if (formAccess.allowed) expect(formAccess.grantType).toBe("CLASS_TEACHER");

    // Explicit Grant Holder -> Allowed (grantType: "EXPLICIT_GRANT")
    const grantAccess = await checkArmAttendanceAccess(home.id, grantedUser.id, arm.id);
    expect(grantAccess.allowed).toBe(true);
    if (grantAccess.allowed) expect(grantAccess.grantType).toBe("EXPLICIT_GRANT");

    // Unassigned Teacher -> Forbidden
    const unassignedAccess = await checkArmAttendanceAccess(home.id, unassignedUser.id, arm.id);
    expect(unassignedAccess.allowed).toBe(false);
    if (!unassignedAccess.allowed) expect(unassignedAccess.reason).toBe("FORBIDDEN");

    // Parent (Non-staff) -> Not Staff
    const parentAccess = await checkArmAttendanceAccess(home.id, parentUser.id, arm.id);
    expect(parentAccess.allowed).toBe(false);
    if (!parentAccess.allowed) expect(parentAccess.reason).toBe("NOT_STAFF");
  });

  test("cross-branch grant refusal: grants cannot cross branch boundaries", async () => {
    const adminUser = await createUser({ role: Role.ADMIN, superAdmin: false });

    // Staff in home branch
    const staffUser = await createUser({ role: Role.TEACHING_STAFF });
    const staff = await db.staffRecord.create({
      data: { branchId: home.id, userId: staffUser.id, category: "TEACHING", firstName: "Home", lastName: "Staff" },
    });

    // Arm in otherBranch
    const classGroup = await db.classGroup.create({
      data: { branchId: otherBranch.id, name: "JSS 1" },
    });
    const otherArm = await db.classArm.create({
      data: { branchId: otherBranch.id, classGroupId: classGroup.id, name: "A" },
    });

    // Attempting to grant access in home branch for an arm in otherBranch must fail
    await expect(
      createAttendanceGrant({
        branchId: home.id,
        actorUserId: adminUser.id,
        staffRecordId: staff.id,
        classArmId: otherArm.id,
      }),
    ).rejects.toThrow("Class arm not found in this branch");

    // Attempting to grant in other branch where admin is not an admin must fail
    await expect(
      createAttendanceGrant({
        branchId: otherBranch.id,
        actorUserId: adminUser.id,
        staffRecordId: staff.id,
        classArmId: otherArm.id,
      }),
    ).rejects.toThrow("Only branch administrators or superadmins can grant attendance access");
  });

  test("deploy backfill idempotency: converts active StaffSubjectAssignments to starting AttendanceGrants", async () => {
    // Setup staff and arm
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "Grade 1" } });
    const arm1 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Alpha" } });
    const arm2 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Beta" } });
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Mathematics" } });

    const staffUser = await createUser({ role: Role.TEACHING_STAFF });
    const staff = await db.staffRecord.create({
      data: { branchId: home.id, userId: staffUser.id, category: "TEACHING", firstName: "Math", lastName: "Teacher" },
    });

    // Assign to 2 arms
    await db.staffSubjectAssignment.create({
      data: { branchId: home.id, staffRecordId: staff.id, classArmId: arm1.id, subjectId: subject.id },
    });
    await db.staffSubjectAssignment.create({
      data: { branchId: home.id, staffRecordId: staff.id, classArmId: arm2.id, subjectId: subject.id },
    });

    // First run of backfill: creates 2 grants
    const createdFirst = await backfillAttendanceGrants(home.id);
    expect(createdFirst).toBe(2);

    const grants = await db.attendanceGrant.findMany({ where: { branchId: home.id, staffRecordId: staff.id } });
    expect(grants).toHaveLength(2);

    // Second run: completely idempotent, 0 new grants created
    const createdSecond = await backfillAttendanceGrants(home.id);
    expect(createdSecond).toBe(0);

    const grantsAfter = await db.attendanceGrant.findMany({ where: { branchId: home.id, staffRecordId: staff.id } });
    expect(grantsAfter).toHaveLength(2);
  });

  test("class teacher reassignment and grant revocation update permissions immediately", async () => {
    const adminUser = await createUser({ role: Role.ADMIN, superAdmin: false });

    const group = await db.classGroup.create({ data: { branchId: home.id, name: "Grade 2" } });
    const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Blue" } });

    const teacherAUser = await createUser({ role: Role.TEACHING_STAFF });
    const teacherA = await db.staffRecord.create({
      data: { branchId: home.id, userId: teacherAUser.id, category: "TEACHING", firstName: "Teacher", lastName: "A" },
    });

    const teacherBUser = await createUser({ role: Role.TEACHING_STAFF });
    const teacherB = await db.staffRecord.create({
      data: { branchId: home.id, userId: teacherBUser.id, category: "TEACHING", firstName: "Teacher", lastName: "B" },
    });

    // 1. Assign Teacher A
    await assignClassTeacher({
      branchId: home.id,
      actorUserId: adminUser.id,
      classArmId: arm.id,
      staffRecordId: teacherA.id,
    });

    const accessA1 = await checkArmAttendanceAccess(home.id, teacherAUser.id, arm.id);
    expect(accessA1.allowed).toBe(true);
    if (accessA1.allowed) expect(accessA1.grantType).toBe("CLASS_TEACHER");

    // 2. Reassign to Teacher B
    await assignClassTeacher({
      branchId: home.id,
      actorUserId: adminUser.id,
      classArmId: arm.id,
      staffRecordId: teacherB.id,
    });

    const accessA2 = await checkArmAttendanceAccess(home.id, teacherAUser.id, arm.id);
    expect(accessA2.allowed).toBe(false);

    const accessB2 = await checkArmAttendanceAccess(home.id, teacherBUser.id, arm.id);
    expect(accessB2.allowed).toBe(true);

    // 3. Give Teacher A an explicit grant
    const grant = await createAttendanceGrant({
      branchId: home.id,
      actorUserId: adminUser.id,
      staffRecordId: teacherA.id,
      classArmId: arm.id,
    });

    const accessA3 = await checkArmAttendanceAccess(home.id, teacherAUser.id, arm.id);
    expect(accessA3.allowed).toBe(true);
    if (accessA3.allowed) expect(accessA3.grantType).toBe("EXPLICIT_GRANT");

    // 4. Revoke the explicit grant
    await revokeAttendanceGrant({
      branchId: home.id,
      actorUserId: adminUser.id,
      grantId: grant.id,
    });

    const accessA4 = await checkArmAttendanceAccess(home.id, teacherAUser.id, arm.id);
    expect(accessA4.allowed).toBe(false);
  });

  test("listAvailableAttendanceArms accurately filters by user context", async () => {
    const adminUser = await createUser({ role: Role.ADMIN, superAdmin: false });

    const group = await db.classGroup.create({ data: { branchId: home.id, name: "Grade 3" } });
    const arm1 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "One" } });
    const arm2 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Two" } });
    const arm3 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Three" } });

    const teacherUser = await createUser({ role: Role.TEACHING_STAFF });
    const teacher = await db.staffRecord.create({
      data: { branchId: home.id, userId: teacherUser.id, category: "TEACHING", firstName: "Specialist", lastName: "Teacher" },
    });

    // Make teacher class teacher of arm1, and grant access to arm2
    await db.classArm.update({ where: { id: arm1.id }, data: { classTeacherId: teacher.id } });
    await db.attendanceGrant.create({
      data: { branchId: home.id, staffRecordId: teacher.id, classArmId: arm2.id, grantedByUserId: adminUser.id },
    });

    // Admin sees all 3 arms
    const adminList = await listAvailableAttendanceArms(home.id, adminUser.id);
    expect(adminList.length).toBeGreaterThanOrEqual(3);
    expect(adminList.find((a) => a.id === arm1.id)?.grantType).toBe("ADMIN");
    expect(adminList.find((a) => a.id === arm2.id)?.grantType).toBe("ADMIN");
    expect(adminList.find((a) => a.id === arm3.id)?.grantType).toBe("ADMIN");

    // Teacher sees exactly 2 arms (arm1 as CLASS_TEACHER, arm2 as EXPLICIT_GRANT)
    const teacherList = await listAvailableAttendanceArms(home.id, teacherUser.id);
    expect(teacherList).toHaveLength(2);
    const arm1Result = teacherList.find((a) => a.id === arm1.id);
    const arm2Result = teacherList.find((a) => a.id === arm2.id);
    expect(arm1Result?.grantType).toBe("CLASS_TEACHER");
    expect(arm2Result?.grantType).toBe("EXPLICIT_GRANT");
  });
});
