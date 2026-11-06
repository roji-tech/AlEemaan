import { Gender } from "@prisma/client";
import { BRANCH_NAMES, db } from "./db";

// A program made straight in the database for the browser specs of programs (task 0043): the same world every time, without going through the routes.
const DAY = 864e5;
export const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

/// An active program made straight in the database, running in the first branch (and the second when asked), with the groups "Juz A" > "Group 1" and "Juz B", and three pupils:
/// Amina and Binta in the first branch, Cara in the second. Nobody is in the program yet - `join` puts people in.
export async function seedProgram(adminId: string, options: { both?: boolean } = {}) {
  const [first, second] = await Promise.all(BRANCH_NAMES.slice(0, 2).map((name) => db.branch.findFirstOrThrow({ where: { name } })));
  const program = await db.program.create({
    data: {
      name: "Quran memorisation",
      kind: "ONGOING",
      status: "ACTIVE",
      createdByUserId: adminId,
      branches: { create: options.both ? [{ branchId: first!.id }, { branchId: second!.id }] : [{ branchId: first!.id }] },
      levelLabels: {
        create: [
          { levelIndex: 0, name: "Juz" },
          { levelIndex: 1, name: "Group" },
        ],
      },
    },
  });
  const juzA = await db.programGroup.create({ data: { programId: program.id, levelIndex: 0, name: "Juz A", sortOrder: 0 } });
  const group1 = await db.programGroup.create({
    data: { programId: program.id, parentId: juzA.id, levelIndex: 1, name: "Group 1", sortOrder: 0 },
  });
  const juzB = await db.programGroup.create({ data: { programId: program.id, levelIndex: 0, name: "Juz B", sortOrder: 1 } });

  const sessionOf = (branchId: string) =>
    db.academicSession.create({
      data: { branchId, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
    });
  const [sessionA, sessionB] = await Promise.all([sessionOf(first!.id), sessionOf(second!.id)]);
  const classGroup = await db.classGroup.create({ data: { branchId: first!.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: first!.id, classGroupId: classGroup.id, name: "Gold" } });
  const pupil = async (branchId: string, sessionId: string, admissionNo: string, firstName: string, armId?: string) => {
    const student = await db.studentRecord.create({
      data: {
        branchId,
        firstName,
        lastName: "Musa",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2013-05-10"),
        admissionNo,
        guardianPhone: "+2348011110001",
      },
    });
    if (armId)
      await db.studentEnrollment.create({
        data: { studentId: student.id, branchId, sessionId, className: "JSS 1", arm: "Gold", classArmId: armId, status: "ACTIVE" },
      });
    return student;
  };
  const amina = await pupil(first!.id, sessionA.id, "2026/0001", "Amina", arm.id);
  const binta = await pupil(first!.id, sessionA.id, "2026/0002", "Binta", arm.id);
  const cara = await pupil(second!.id, sessionB.id, "2026/0003", "Cara");

  /// Puts a pupil in a group; they joined a month ago, so earlier days have rolls.
  const join = (student: { id: string }, branchId: string, groupId: string) =>
    db.programParticipant.create({
      data: {
        programId: program.id,
        kind: "STUDENT",
        studentId: student.id,
        branchId,
        groupId,
        joinedOn: new Date(`${day(-30)}T00:00:00Z`),
        createdByUserId: adminId,
      },
    });
  /// A mark made in the past, straight in the database: the session of a group on a day and one person's status in it.
  const markOn = async (offset: number, groupId: string, marks: [{ id: string }, string, string][], label = "") => {
    const session = await db.programSession.create({
      data: { programId: program.id, groupId, date: new Date(`${day(offset)}T00:00:00Z`), label, createdByUserId: adminId },
    });
    for (const [participant, status, branchId] of marks)
      await db.programAttendance.create({
        data: {
          sessionId: session.id,
          programId: program.id,
          participantId: participant.id,
          branchId,
          status: status as "PRESENT",
          markedByUserId: adminId,
        },
      });
    return session;
  };
  /// A member of staff of the first branch named to the program with a role and, for a teacher or a recorder, the groups they take attendance for.
  const name = async (userId: string, role: "SUPERVISOR" | "TEACHER" | "RECORDER", groupIds: string[] = []) => {
    const place = await db.programStaff.create({
      data: { programId: program.id, userId, branchId: first!.id, role, createdByUserId: adminId },
    });
    for (const groupId of groupIds)
      await db.programStaffGroup.create({ data: { programStaffId: place.id, groupId, programId: program.id, createdByUserId: adminId } });
    return place;
  };
  return { program, first: first!, second: second!, juzA, group1, juzB, amina, binta, cara, join, markOn, name };
}
