import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role, ResultStatus, PromotionDecision, EnrollmentStatus } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

let home: { id: string; name: string };

test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  await db.promotionRecord.deleteMany();
  await db.promotionBatch.deleteMany();
  await db.result.deleteMany();
  await db.studentEnrollment.deleteMany();
  await db.subjectOffering.deleteMany();
  await db.subject.deleteMany();
  await db.studentRecord.deleteMany();
  await db.classArm.deleteMany();
  await db.classGroup.deleteMany();
  await db.academicPeriod.deleteMany();
  await db.academicSession.deleteMany();
});

const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test.describe("Slice P7 — Student Promotion & Academic Rollover API", () => {
  test("promotion lifecycle: preview calculations, batch execution, idempotency, and audit query", async () => {
    const admin = await asRole(Role.ADMIN, home.id);

    // 1. Setup Academic Sessions
    const sourceSession = await db.academicSession.create({
      data: {
        branchId: home.id,
        label: "2025/2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-07-20"),
      },
    });

    const targetSession = await db.academicSession.create({
      data: {
        branchId: home.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-20"),
      },
    });

    // 2. Setup 3 Terms for Source Session (Term 3 is current)
    const term1 = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: sourceSession.id,
        ordinal: 1,
        label: "1st Term",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2025-12-15"),
        isCurrent: false,
      },
    });

    const term2 = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: sourceSession.id,
        ordinal: 2,
        label: "2nd Term",
        startDate: new Date("2026-01-05"),
        endDate: new Date("2026-04-10"),
        isCurrent: false,
      },
    });

    const term3 = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: sourceSession.id,
        ordinal: 3,
        label: "3rd Term",
        startDate: new Date("2026-04-27"),
        endDate: new Date("2026-07-20"),
        isCurrent: true,
      },
    });

    // 3. Setup Class Progression: Primary 1 (sortOrder: 10) -> Primary 2 (sortOrder: 20)
    const classP1 = await db.classGroup.create({
      data: { branchId: home.id, name: "Primary 1", sortOrder: 10 },
    });
    const classP2 = await db.classGroup.create({
      data: { branchId: home.id, name: "Primary 2", sortOrder: 20 },
    });

    const armP1Gold = await db.classArm.create({
      data: { branchId: home.id, classGroupId: classP1.id, name: "Gold" },
    });
    const armP2Gold = await db.classArm.create({
      data: { branchId: home.id, classGroupId: classP2.id, name: "Gold" },
    });

    // 4. Setup Academic Subject, Scheme, and Scale
    const subjectMath = await db.subject.create({
      data: { branchId: home.id, name: "Mathematics", code: "MTH" },
    });
    const scheme = await db.assessmentScheme.create({
      data: {
        branchId: home.id,
        name: "Standard Scheme",
        totalMax: 100,
        examMax: 60,
      },
    });
    const scale = await db.gradeScale.create({
      data: {
        branchId: home.id,
        name: "Standard WAEC",
      },
    });

    // 5. Seed Two Students with Source Enrollments
    const studentPass = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Zainab",
        lastName: "Ahmed",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2015-04-12"),
        admissionNo: "ADM-P7-001",
      },
    });

    const studentFail = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Bilal",
        lastName: "Usman",
        gender: Gender.MALE,
        dateOfBirth: new Date("2015-08-25"),
        admissionNo: "ADM-P7-002",
      },
    });

    await db.studentEnrollment.create({
      data: {
        branchId: home.id,
        studentId: studentPass.id,
        sessionId: sourceSession.id,
        className: classP1.name,
        arm: armP1Gold.name,
        classArmId: armP1Gold.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await db.studentEnrollment.create({
      data: {
        branchId: home.id,
        studentId: studentFail.id,
        sessionId: sourceSession.id,
        className: classP1.name,
        arm: armP1Gold.name,
        classArmId: armP1Gold.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    // 6. Seed Results:
    // StudentPass: Term 1 (70%), Term 2 (80%), Term 3 (75%) -> Session Avg = 75.0% (PROMOTED)
    const now = new Date();
    for (const [term, score] of [[term1, 70], [term2, 80], [term3, 75]] as const) {
      await db.result.create({
        data: {
          branchId: home.id,
          studentId: studentPass.id,
          subjectId: subjectMath.id,
          periodId: term.id,
          classArmId: armP1Gold.id,
          schemeId: scheme.id,
          scaleId: scale.id,
          componentScores: [],
          examScore: score * 0.6,
          examMax: 60,
          caTotal: score * 0.4,
          total: score,
          maxScore: 100,
          gradeLetter: "B",
          gradeRemark: "Good",
          status: ResultStatus.PUBLISHED,
          enteredByUserId: admin.user.id,
          submittedAt: now,
          submittedByUserId: admin.user.id,
          approvedAt: now,
          approvedByUserId: admin.user.id,
          publishedAt: now,
          verificationToken: `token_pass_${term.ordinal}_${"x".repeat(27)}`,
          verificationHash: `hash_pass_${term.ordinal}_${"y".repeat(51)}`,
        },
      });
    }

    for (const [term, score] of [[term1, 40], [term2, 35], [term3, 45]] as const) {
      await db.result.create({
        data: {
          branchId: home.id,
          studentId: studentFail.id,
          subjectId: subjectMath.id,
          periodId: term.id,
          classArmId: armP1Gold.id,
          schemeId: scheme.id,
          scaleId: scale.id,
          componentScores: [],
          examScore: score * 0.6,
          examMax: 60,
          caTotal: score * 0.4,
          total: score,
          maxScore: 100,
          gradeLetter: "F",
          gradeRemark: "Fail",
          status: ResultStatus.PUBLISHED,
          enteredByUserId: admin.user.id,
          submittedAt: now,
          submittedByUserId: admin.user.id,
          approvedAt: now,
          approvedByUserId: admin.user.id,
          publishedAt: now,
          verificationToken: `token_fail_${term.ordinal}_${"x".repeat(27)}`,
          verificationHash: `hash_fail_${term.ordinal}_${"y".repeat(51)}`,
        },
      });
    }

    // 7. Test Preview API
    const previewRes = await api(
      `/api/v1/academics/promotion/preview?branchId=${home.id}&sourceSessionId=${sourceSession.id}&targetSessionId=${targetSession.id}&sourceClassGroupId=${classP1.id}`,
      { cookie: admin.cookie }
    );

    expect(previewRes.status).toBe(200);
    const preview = previewRes.json.data;
    expect(preview.sourceClassGroup.name).toBe("Primary 1");
    expect(preview.targetClassGroup.name).toBe("Primary 2");
    expect(preview.isTerminalClass).toBe(false);
    expect(preview.summary.totalEvaluated).toBe(2);
    expect(preview.summary.totalPromoted).toBe(1);
    expect(preview.summary.totalRepeated).toBe(1);

    const pStudent = preview.students.find((s: { studentId: string }) => s.studentId === studentPass.id);
    expect(pStudent.overallAverage).toBe(75);
    expect(pStudent.recommendedDecision).toBe(PromotionDecision.PROMOTED);
    expect(pStudent.targetClassArmName).toBe("Gold"); // Arm matched by name

    const fStudent = preview.students.find((s: { studentId: string }) => s.studentId === studentFail.id);
    expect(fStudent.overallAverage).toBe(40);
    expect(fStudent.recommendedDecision).toBe(PromotionDecision.REPEATED);

    // 8. Test Execute Promotion API
    const execRes = await api("/api/v1/academics/promotion/execute", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        sourceSessionId: sourceSession.id,
        targetSessionId: targetSession.id,
        sourceClassGroupId: classP1.id,
        targetClassGroupId: classP2.id,
        passMark: 50.0,
      },
    });

    expect(execRes.status).toBe(201);
    const batch = execRes.json.data;
    expect(batch.totalEvaluated).toBe(2);
    expect(batch.totalPromoted).toBe(1);
    expect(batch.totalRepeated).toBe(1);

    // Verify source enrollments transitioned
    const sourceEnrolPass = await db.studentEnrollment.findUnique({
      where: { studentId_sessionId: { studentId: studentPass.id, sessionId: sourceSession.id } },
    });
    expect(sourceEnrolPass?.status).toBe(EnrollmentStatus.PROMOTED);

    const sourceEnrolFail = await db.studentEnrollment.findUnique({
      where: { studentId_sessionId: { studentId: studentFail.id, sessionId: sourceSession.id } },
    });
    expect(sourceEnrolFail?.status).toBe(EnrollmentStatus.REPEATED);

    // Verify target enrollments created
    const targetEnrolPass = await db.studentEnrollment.findUnique({
      where: { studentId_sessionId: { studentId: studentPass.id, sessionId: targetSession.id } },
    });
    expect(targetEnrolPass).not.toBeNull();
    expect(targetEnrolPass?.className).toBe("Primary 2");
    expect(targetEnrolPass?.classArmId).toBe(armP2Gold.id);
    expect(targetEnrolPass?.status).toBe(EnrollmentStatus.ACTIVE);

    const targetEnrolFail = await db.studentEnrollment.findUnique({
      where: { studentId_sessionId: { studentId: studentFail.id, sessionId: targetSession.id } },
    });
    expect(targetEnrolFail).not.toBeNull();
    expect(targetEnrolFail?.className).toBe("Primary 1");
    expect(targetEnrolFail?.status).toBe(EnrollmentStatus.ACTIVE);

    // 9. Test Idempotency (re-executing does not crash or create duplicate target enrollments)
    const reExecRes = await api("/api/v1/academics/promotion/execute", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        branchId: home.id,
        sourceSessionId: sourceSession.id,
        targetSessionId: targetSession.id,
        sourceClassGroupId: classP1.id,
        targetClassGroupId: classP2.id,
        passMark: 50.0,
      },
    });
    expect(reExecRes.status).toBe(201);

    const allTargetPassEnrols = await db.studentEnrollment.findMany({
      where: { studentId: studentPass.id, sessionId: targetSession.id },
    });
    expect(allTargetPassEnrols.length).toBe(1); // exactly one enrollment per session!

    // 10. Test Batches List & Detail APIs
    const listBatchesRes = await api(`/api/v1/academics/promotion/batches?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(listBatchesRes.status).toBe(200);
    const batches = listBatchesRes.json.data.batches;
    expect(batches.length).toBeGreaterThan(0);

    const detailRes = await api(`/api/v1/academics/promotion/batches/${batch.id}?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(detailRes.status).toBe(200);
    const batchDetail = detailRes.json.data;
    expect(batchDetail.id).toBe(batch.id);
    expect(batchDetail.records.length).toBe(2);
  });
});
