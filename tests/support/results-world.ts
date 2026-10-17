import { db } from "./db";

/// One branch's worth of what a result stands on: an active session and term, a class with one arm studying one subject, an enrolled student, a scheme (two
/// parts of 20 + an exam of 60) and a grade scale (A/B/C/F). Shared by the results specs.
/// A second world in the same branch (`extra`) gets a class-scoped scheme and a non-default scale, because a branch has one live default of each.
export async function resultsWorld(branchId: string, label = Math.random().toString(36).slice(2, 7), extra = false) {
  const session = await db.academicSession.create({
    data: { branchId, label: `${label}/2027`, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-31"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: { branchId, sessionId: session.id, ordinal: 1, label: "1st Term", startDate: new Date("2026-09-01"), isCurrent: true },
  });
  const group = await db.classGroup.create({ data: { branchId, name: `JSS ${label}` } });
  const arm = await db.classArm.create({ data: { branchId, classGroupId: group.id, name: "A" } });
  const subject = await db.subject.create({ data: { branchId, name: `Maths ${label}` } });
  await db.subjectOffering.create({ data: { branchId, classGroupId: group.id, subjectId: subject.id } });
  const student = await db.studentRecord.create({
    data: {
      branchId,
      firstName: "Amina",
      lastName: `Yusuf${label}`,
      gender: "FEMALE",
      dateOfBirth: new Date("2012-05-01"),
      admissionNo: `ADM/${label}/1`,
    },
  });
  await db.studentEnrollment.create({
    data: { branchId, studentId: student.id, sessionId: session.id, className: group.name, arm: "A", classArmId: arm.id },
  });
  const scheme = await db.assessmentScheme.create({
    data: { branchId, name: `Scheme ${label}`, totalMax: 100, examMax: 60, ...(extra ? { classGroupId: group.id } : {}) },
  });
  await db.assessmentComponent.createMany({
    data: [
      { branchId, schemeId: scheme.id, name: "Test 1", maxScore: 20, sortOrder: 0 },
      { branchId, schemeId: scheme.id, name: "Test 2", maxScore: 20, sortOrder: 1 },
    ],
  });
  const scale = await db.gradeScale.create({ data: { branchId, name: `Scale ${label}`, isDefault: !extra } });
  await db.gradeBand.createMany({
    data: [
      { branchId, scaleId: scale.id, minScore: 0, maxScore: 50, letter: "F", remark: "Fail", sortOrder: 0 },
      { branchId, scaleId: scale.id, minScore: 50, maxScore: 70, letter: "C", remark: "Credit", sortOrder: 1 },
      { branchId, scaleId: scale.id, minScore: 70, maxScore: 100, letter: "A", remark: "Excellent", sortOrder: 2 },
    ],
  });
  return { session, period, group, arm, subject, student, scheme, scale };
}
