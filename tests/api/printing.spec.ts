import "../support/env";
import { test, expect } from "@playwright/test";
import { BankQuestionType, FormKind, FormStatus, Gender, Role, BankVisibility, PrintTargetKind } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

const PUPIL_1_DOB = "2013-05-10";
const PUPIL_2_DOB = "2014-06-15";
const GUARDIAN_PHONE = "+2348011110001";

const portalCookie = async (admissionNo: string, secret: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let otherBranch: { id: string };
let teacher1: TestUser;
let teacher1Cookie: string;
let approverTeacher: TestUser;
let approverCookie: string;
let adminUser: TestUser;
let adminCookie: string;
let otherTeacher: TestUser;
let otherTeacherCookie: string;
let student1: { id: string; admissionNo: string; name: string };
let student2: { id: string; admissionNo: string; name: string };
let group1: { id: string };
let subject1: { id: string };

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

  const session = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "ACTIVE",
    },
  });

  group1 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm1 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group1.id, name: "Gold" } });
  subject1 = await db.subject.create({ data: { branchId: home.id, name: "Agricultural Science", code: "AGR101" } });

  // Student 1
  const s1 = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Bello",
      admissionNo: "AE/2026/0101",
      gender: Gender.FEMALE,
      dateOfBirth: new Date(PUPIL_1_DOB),
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  await db.studentEnrollment.create({
    data: {
      branchId: home.id,
      studentId: s1.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm1.id,
      status: "ACTIVE",
    },
  });
  student1 = { id: s1.id, admissionNo: s1.admissionNo, name: "Amina Bello" };

  // Student 2
  const s2 = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Ibrahim",
      lastName: "Musa",
      admissionNo: "AE/2026/0102",
      gender: Gender.MALE,
      dateOfBirth: new Date(PUPIL_2_DOB),
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  await db.studentEnrollment.create({
    data: {
      branchId: home.id,
      studentId: s2.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm1.id,
      status: "ACTIVE",
    },
  });
  student2 = { id: s2.id, admissionNo: s2.admissionNo, name: "Ibrahim Musa" };

  // Standard Teacher
  teacher1 = await createUser({
    name: "Teacher One",
    role: Role.TEACHING_STAFF,
    superAdmin: false,
  });
  const t1Login = await loginAs(teacher1);
  expect(t1Login.status).toBe(200);
  teacher1Cookie = cookieHeader(t1Login.token!);

  // Exam Approver Teacher
  approverTeacher = await createUser({
    name: "Exam Approver Suleiman",
    role: Role.TEACHING_STAFF,
    superAdmin: false,
  });
  const appLogin = await loginAs(approverTeacher);
  expect(appLogin.status).toBe(200);
  approverCookie = cookieHeader(appLogin.token!);

  // Register as Exam Approver in QuestionBankReviewer
  await db.questionBankReviewer.create({
    data: {
      userId: approverTeacher.id,
      branchId: home.id,
      scope: "GENERAL",
      isExamApprover: true,
      assignedById: teacher1.id,
    },
  });

  // Branch Admin
  adminUser = await createUser({
    name: "Branch Admin Fatima",
    role: Role.ADMIN,
    superAdmin: false,
  });
  const admLogin = await loginAs(adminUser);
  expect(admLogin.status).toBe(200);
  adminCookie = cookieHeader(admLogin.token!);

  // Other Branch Teacher
  otherTeacher = await createUser({
    name: "Other Teacher",
    superAdmin: false,
  });
  await db.membership.create({
    data: {
      userId: otherTeacher.id,
      branchId: otherBranch.id,
      role: Role.TEACHING_STAFF,
    },
  });
  const otLogin = await loginAs(otherTeacher);
  expect(otLogin.status).toBe(200);
  otherTeacherCookie = cookieHeader(otLogin.token!);
});

test.describe("Printing API (Task 0032 Slice 10)", () => {
  test("blocks standard teacher from printing exam within near-exam window (403)", async () => {
    // 1. Create an Exam Quiz scheduled 3 days in the future (within default 7-day near-exam window)
    const examStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const examEnd = new Date(examStart.getTime() + 3 * 60 * 60 * 1000);

    const quiz = await db.quiz.create({
      data: {
        branchId: home.id,
        subjectId: subject1.id,
        classGroupId: group1.id,
        title: "Agric Science Term Final Exam",
        isExamTemplate: true,
        examWindowStart: examStart,
        examWindowEnd: examEnd,
        status: "PUBLISHED",
        createdById: null,
      },
    });

    await db.quizQuestion.create({
      data: {
        branchId: home.id,
        quizId: quiz.id,
        prompt: "Identify the soil horizon richest in organic humus.",
        questionType: "MULTIPLE_CHOICE",
        points: 5,
        options: ["Horizon A", "Horizon B", "Horizon C", "Bedrock"],
        correctAnswer: "Horizon A",
      },
    });

    // 2. Standard teacher attempts to print the exam
    const printRes = await api("/api/v1/question-bank/print", {
      method: "POST",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        targetKind: PrintTargetKind.QUIZ,
        targetId: quiz.id,
        format: "json",
      },
    });

    expect(printRes.status).toBe(403);
    expect(printRes.json.error.message).toContain("restricted to exam approvers and administrators");

    // 3. Verify no print audit log was written
    const logs = await db.questionBankPrintLog.findMany({ where: { targetId: quiz.id } });
    expect(logs).toHaveLength(0);
  });

  test("allows exam approver to print exam within near-exam window with watermark and audit", async () => {
    const examStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const examEnd = new Date(examStart.getTime() + 3 * 60 * 60 * 1000);

    const quiz = await db.quiz.create({
      data: {
        branchId: home.id,
        subjectId: subject1.id,
        classGroupId: group1.id,
        title: "Agric Science Term Final Exam",
        isExamTemplate: true,
        examWindowStart: examStart,
        examWindowEnd: examEnd,
        status: "PUBLISHED",
        createdById: null,
      },
    });

    await db.quizQuestion.create({
      data: {
        branchId: home.id,
        quizId: quiz.id,
        prompt: "Identify the soil horizon richest in organic humus.",
        questionType: "MULTIPLE_CHOICE",
        points: 5,
        options: ["Horizon A", "Horizon B", "Horizon C", "Bedrock"],
        correctAnswer: "Horizon A",
      },
    });

    // 1. Exam approver prints the exam
    const printRes = await api("/api/v1/question-bank/print", {
      method: "POST",
      cookie: approverCookie,
      body: {
        branchId: home.id,
        targetKind: PrintTargetKind.QUIZ,
        targetId: quiz.id,
        reason: "Official sitting copy printout",
        format: "json",
      },
    });

    expect(printRes.status).toBe(200);
    expect(printRes.json.data.logId).toBeDefined();
    expect(printRes.json.data.pageCount).toBeGreaterThanOrEqual(1);
    expect(printRes.json.data.title).toBe("Agric Science Term Final Exam");

    // Watermark contains approver name, timestamp, and target
    const watermark = printRes.json.data.watermark;
    expect(watermark).toContain("Exam Approver Suleiman");
    expect(watermark).toContain("Agric Science Term Final Exam");
    expect(watermark).toContain("AL-EEMAAN");

    // Base64 PDF verifies valid PDF-1.4 header
    const pdfBytes = Buffer.from(printRes.json.data.pdfBase64, "base64").toString("latin1");
    expect(pdfBytes.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfBytes).toContain("%%EOF\n");

    // 2. Verify append-only log record in database
    const log = await db.questionBankPrintLog.findUniqueOrThrow({
      where: { id: printRes.json.data.logId },
    });
    expect(log.userId).toBe(approverTeacher.id);
    expect(log.branchId).toBe(home.id);
    expect(log.targetKind).toBe(PrintTargetKind.QUIZ);
    expect(log.reason).toBe("Official sitting copy printout");

    // 3. Branch Admin is also permitted to print during the exam window
    const adminPrintRes = await api("/api/v1/question-bank/print", {
      method: "POST",
      cookie: adminCookie,
      body: {
        branchId: home.id,
        targetKind: PrintTargetKind.QUIZ,
        targetId: quiz.id,
        reason: "Administrative oversight copy",
        format: "json",
      },
    });
    expect(adminPrintRes.status).toBe(200);
    expect(adminPrintRes.json.data.watermark).toContain("Branch Admin Fatima");
  });

  test("standard teacher can print non-exam practice sets and paper work via forms print route", async () => {
    // 1. Create a practice set
    const form = await db.form.create({
      data: {
        branchId: home.id,
        kind: FormKind.PRACTICE_SET,
        title: "Soil Fertility Classroom Practice",
        instructions: "Work in pairs to answer all questions.",
        status: FormStatus.PUBLISHED,
        createdById: teacher1.id,
      },
    });

    await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "Name two inorganic fertilizers used in Nigerian cereal farming.",
        questionType: BankQuestionType.SHORT,
        points: 10,
        sortOrder: 1,
      },
    });

    // 2. Standard teacher prints the form
    const printRes = await api(`/api/v1/forms/${form.id}/print`, {
      method: "POST",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        format: "json",
      },
    });

    expect(printRes.status).toBe(200);
    expect(printRes.json.data.title).toBe("Soil Fertility Classroom Practice");
    expect(printRes.json.data.watermark).toContain("Teacher One");

    // Verify PDF binary payload
    const pdfString = Buffer.from(printRes.json.data.pdfBase64, "base64").toString("latin1");
    expect(pdfString.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfString).toContain("Soil Fertility Classroom Practice");
  });

  test("teacher releasing handout to named pupil records recipientStudentId and embeds pupil in watermark", async () => {
    const form = await db.form.create({
      data: {
        branchId: home.id,
        kind: FormKind.PAPER_WORK,
        title: "Botany Plant Physiology Assignment",
        status: FormStatus.PUBLISHED,
        createdById: teacher1.id,
      },
    });

    await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "Diagram the stomata opening cycle under bright sunlight.",
        questionType: BankQuestionType.SHORT,
        points: 10,
        sortOrder: 1,
      },
    });

    // 1. Teacher prints handout explicitly releasing it to Student 1
    const printRes = await api("/api/v1/question-bank/print", {
      method: "POST",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        targetKind: PrintTargetKind.FORM,
        targetId: form.id,
        recipientStudentId: student1.id,
        reason: "Accommodated paper handout for offline study",
        format: "json",
      },
    });

    expect(printRes.status).toBe(200);
    const watermark = printRes.json.data.watermark;
    expect(watermark).toContain("ISSUED BY: Teacher One");
    expect(watermark).toContain(`HANDOUT FOR: ${student1.name} (${student1.admissionNo})`);

    // Verify DB log
    const log = await db.questionBankPrintLog.findUniqueOrThrow({
      where: { id: printRes.json.data.logId },
    });
    expect(log.recipientStudentId).toBe(student1.id);
    expect(log.reason).toBe("Accommodated paper handout for offline study");

    // 2. Attempting to release to a non-existent student ID returns 404
    const badStudentRes = await api("/api/v1/question-bank/print", {
      method: "POST",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        targetKind: PrintTargetKind.FORM,
        targetId: form.id,
        recipientStudentId: "cl_nonexistent_student_id",
        format: "json",
      },
    });
    expect(badStudentRes.status).toBe(404);
  });

  test("pupil portal: refuses printing on in-progress practice session, allows completed session", async () => {
    // 1. Create a bank item
    const bankItem = await db.questionBankItem.create({
      data: {
        branchId: home.id,
        type: BankQuestionType.SINGLE,
        prompt: "Which gas is absorbed by plants during photosynthesis?",
        points: 2,
        visibility: BankVisibility.PRACTICE,
        options: ["Carbon dioxide", "Oxygen", "Nitrogen", "Argon"],
        correctAnswer: "Carbon dioxide",
        status: "APPROVED",
        submittedById: teacher1.id,
        approvedById: approverTeacher.id,
        approvedAt: new Date(),
      },
    });

    // 2. Create in-progress practice session
    const session = await db.practiceSession.create({
      data: {
        branchId: home.id,
        studentId: student1.id,
        topic: "Photosynthesis Basics",
        size: 1,
        finishedAt: null, // In progress
      },
    });

    await db.practiceAttempt.create({
      data: {
        branchId: home.id,
        sessionId: session.id,
        studentId: student1.id,
        bankItemId: bankItem.id,
        version: 1,
        answer: "Carbon dioxide",
        correct: true,
      },
    });

    const p1Cookie = await portalCookie(student1.admissionNo, PUPIL_1_DOB);

    // 3. Attempt to print while in-progress is refused
    const inProgressRes = await api(
      `/api/v1/portal/students/${student1.id}/question-bank/practice/${session.id}/print?format=json`,
      { cookie: p1Cookie },
    );
    expect(inProgressRes.status).toBe(400);
    expect(inProgressRes.json.error.message).toContain("only print completed practice sessions");

    // 4. Mark practice session as finished
    await db.practiceSession.update({
      where: { id: session.id },
      data: { finishedAt: new Date() },
    });

    // 5. Printing completed practice session succeeds
    const completedRes = await api(
      `/api/v1/portal/students/${student1.id}/question-bank/practice/${session.id}/print?format=json`,
      { cookie: p1Cookie },
    );
    expect(completedRes.status).toBe(200);
    expect(completedRes.json.data.title).toContain("Photosynthesis Basics");
    expect(completedRes.json.data.watermark).toContain(student1.name);
    expect(completedRes.json.data.watermark).toContain(student1.admissionNo);

    // Verify log created with pupil studentId
    const log = await db.questionBankPrintLog.findUniqueOrThrow({
      where: { id: completedRes.json.data.logId },
    });
    expect(log.studentId).toBe(student1.id);
    expect(log.targetKind).toBe(PrintTargetKind.PRACTICE_SESSION);

    // 6. Cross-student portal isolation: student 1 cannot print student 2's session
    const crossStudentRes = await api(
      `/api/v1/portal/students/${student2.id}/question-bank/practice/${session.id}/print?format=json`,
      { cookie: p1Cookie },
    );
    expect(crossStudentRes.status).toBe(403);
  });

  test("pupil portal: prints completed form response with masked manual items", async () => {
    // 1. Create a form with mixed questions
    const form = await db.form.create({
      data: {
        branchId: home.id,
        kind: FormKind.PRACTICE_SET,
        title: "General Science Term Review",
        status: FormStatus.PUBLISHED,
        createdById: teacher1.id,
      },
    });

    const q1 = await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "The boiling point of pure water at sea level is 100°C.",
        questionType: BankQuestionType.TRUE_FALSE,
        points: 5,
        markingMethod: "AUTO",
        correctAnswer: "true",
      },
    });

    const q2 = await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "Explain thermal conduction in solids.",
        questionType: BankQuestionType.SHORT,
        points: 10,
        markingMethod: "MANUAL",
        correctAnswer: "Heat transfer via molecular collisions.",
      },
    });

    // 2. Pupil completes response, q2 is pending manual marking
    const response = await db.formResponse.create({
      data: {
        branchId: home.id,
        formId: form.id,
        studentId: student1.id,
        status: "COMPLETED",
        markingStatus: "PENDING",
        score: 5,
        maxScore: 15,
        submittedAt: new Date(),
      },
    });

    await db.formAnswer.create({
      data: {
        branchId: home.id,
        responseId: response.id,
        formQuestionId: q1.id,
        value: "true",
        score: 5,
        isCorrect: true,
        markingStatus: "MARKED",
      },
    });

    await db.formAnswer.create({
      data: {
        branchId: home.id,
        responseId: response.id,
        formQuestionId: q2.id,
        value: "Vibrations pass energy from particle to particle.",
        score: 0,
        isCorrect: false,
        markingStatus: "PENDING",
      },
    });

    const p1Cookie = await portalCookie(student1.admissionNo, PUPIL_1_DOB);

    // 3. Pupil prints completed response
    const printRes = await api(
      `/api/v1/portal/students/${student1.id}/forms/practice-sets/${form.id}/responses/${response.id}/print?format=json`,
      { cookie: p1Cookie },
    );

    expect(printRes.status).toBe(200);
    expect(printRes.json.data.title).toContain("General Science Term Review");

    const pdfString = Buffer.from(printRes.json.data.pdfBase64, "base64").toString("latin1");
    expect(pdfString.startsWith("%PDF-1.4")).toBe(true);

    // Auto question shows score
    expect(pdfString).toContain("The boiling point of pure water");
    expect(pdfString).toContain("Score Awarded: 5 / 5");

    // Pending manual question must NOT show answer key
    expect(pdfString).not.toContain("Heat transfer via molecular collisions");
  });

  test("enforces ADR 0014 branch isolation and database append-only trigger protection", async () => {
    // 1. Create a form in home branch
    const form = await db.form.create({
      data: {
        branchId: home.id,
        kind: FormKind.PRACTICE_SET,
        title: "Confidential Branch A Exam",
        status: FormStatus.PUBLISHED,
        createdById: teacher1.id,
      },
    });

    // 2. Teacher from otherBranch tries to print home form -> Refused (branch mismatch)
    const crossPrintRes = await api("/api/v1/question-bank/print", {
      method: "POST",
      cookie: otherTeacherCookie,
      body: {
        branchId: otherBranch.id, // Trying to claim it belongs to otherBranch
        targetKind: PrintTargetKind.FORM,
        targetId: form.id,
        format: "json",
      },
    });
    expect(crossPrintRes.status).toBe(404);

    // 3. Print a valid log in home branch
    const validPrint = await api(`/api/v1/forms/${form.id}/print`, {
      method: "POST",
      cookie: teacher1Cookie,
      body: { branchId: home.id, format: "json" },
    });
    expect(validPrint.status).toBe(200);
    const logId = validPrint.json.data.logId;

    // 4. Other branch queries print logs: must not see home branch log
    const otherLogsRes = await api(`/api/v1/question-bank/print-logs?branchId=${otherBranch.id}`, {
      cookie: otherTeacherCookie,
    });
    expect(otherLogsRes.status).toBe(200);
    const otherLogs = otherLogsRes.json.data.logs;
    expect(otherLogs.some((l: { id: string }) => l.id === logId)).toBe(false);

    // Home branch queries print logs: sees the log
    const homeLogsRes = await api(`/api/v1/question-bank/print-logs?branchId=${home.id}`, {
      cookie: teacher1Cookie,
    });
    expect(homeLogsRes.status).toBe(200);
    expect(homeLogsRes.json.data.logs.some((l: { id: string }) => l.id === logId)).toBe(true);

    // 5. Database Append-Only Trigger: attempt to UPDATE or DELETE QuestionBankPrintLog throws exception
    await expect(
      db.questionBankPrintLog.update({
        where: { id: logId },
        data: { reason: "Tampered reason" },
      }),
    ).rejects.toThrow();

    await expect(
      db.questionBankPrintLog.delete({
        where: { id: logId },
      }),
    ).rejects.toThrow();
  });
});
