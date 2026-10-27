import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, QuestionReportStatus, QuestionReportOutcome } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

const PUPIL_DOB = "2013-05-10";
const GUARDIAN_PHONE = "+2348011110001";

const portalCookie = async (admissionNo: string, secret: string = PUPIL_DOB) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let otherBranch: { id: string };
let teacher: TestUser;
let reviewer: TestUser;
let admin: TestUser;
let otherTeacher: TestUser;
let teacherCookie: string;
let reviewerCookie: string;

let student: { id: string; admissionNo: string };
let student2: { id: string; admissionNo: string };
let pupilCookie: string;
let pupil2Cookie: string;

let approvedItem: { id: string; prompt: string; branchId: string | null };
let mathsItem: { id: string; prompt: string; branchId: string | null };

async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  otherBranch = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });

  // Create staff users
  teacher = await createUser({ name: "Tariq Teacher", role: Role.TEACHING_STAFF, superAdmin: false });
  reviewer = await createUser({ name: "Rashid Reviewer", role: Role.TEACHING_STAFF, superAdmin: false });
  admin = await createUser({ name: "Amina Admin", role: Role.ADMIN, superAdmin: false });
  otherTeacher = await createUser({ name: "Umar Other", superAdmin: false });
  await db.membership.create({ data: { userId: otherTeacher.id, branchId: otherBranch.id, role: Role.TEACHING_STAFF } });

  // Assign reviewer in home branch
  await db.questionBankReviewer.create({
    data: {
      userId: reviewer.id,
      assignedById: admin.id,
      scope: "GENERAL",
      branchId: home.id,
    },
  });

  teacherCookie = await cookieFor(teacher);
  reviewerCookie = await cookieFor(reviewer);

  // Seed academic structure
  const session = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "ACTIVE",
    },
  });

  const section = await db.section.create({
    data: {
      branchId: home.id,
      name: "Junior Secondary",
    },
  });

  const group = await db.classGroup.create({
    data: {
      branchId: home.id,
      name: "JSS 1",
      sectionId: section.id,
    },
  });

  const arm = await db.classArm.create({
    data: {
      branchId: home.id,
      classGroupId: group.id,
      name: "Gold",
    },
  });

  // Seed Student 1
  const s1 = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Sulaiman",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  student = { id: s1.id, admissionNo: s1.admissionNo };

  await db.studentEnrollment.create({
    data: {
      studentId: s1.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm.id,
      status: "ACTIVE",
    },
  });

  // Seed Student 2
  const s2 = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Bilal",
      lastName: "Kareem",
      gender: Gender.MALE,
      dateOfBirth: new Date("2013-06-15"),
      admissionNo: "2026/0002",
      guardianPhone: "+2348011110002",
    },
  });
  student2 = { id: s2.id, admissionNo: s2.admissionNo };

  await db.studentEnrollment.create({
    data: {
      studentId: s2.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm.id,
      status: "ACTIVE",
    },
  });

  pupilCookie = await portalCookie(student.admissionNo, PUPIL_DOB);
  pupil2Cookie = await portalCookie(student2.admissionNo, "2013-06-15");

  // Create Question Bank Items
  const item1 = await db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: "What is the capital of Nigeria?",
      explanation: "Abuja is the federal capital territory.",
      points: 1,
      topic: "Governance",
      subjectLabel: "Civics",
      subjectKey: "civics",
      options: [
        { id: "A", text: "Lagos" },
        { id: "B", text: "Abuja" },
        { id: "C", text: "Kano" },
      ],
      correctAnswer: "B",
      visibility: "PRACTICE",
      status: "APPROVED",
      submittedById: teacher.id,
      approvedById: reviewer.id,
      approvedAt: new Date(),
    },
  });
  approvedItem = { id: item1.id, prompt: item1.prompt, branchId: item1.branchId };

  const item2 = await db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: "What is 7 times 8?",
      explanation: "7 * 8 = 56.",
      points: 1,
      topic: "Multiplication",
      subjectLabel: "Mathematics",
      subjectKey: "mathematics",
      options: [
        { id: "A", text: "54" },
        { id: "B", text: "56" },
        { id: "C", text: "64" },
      ],
      correctAnswer: "B",
      visibility: "PRACTICE",
      status: "APPROVED",
      submittedById: teacher.id,
      approvedById: reviewer.id,
      approvedAt: new Date(),
    },
  });
  mathsItem = { id: item2.id, prompt: item2.prompt, branchId: item2.branchId };
});

test.describe("Slice 5: Question Reports (Task 0032)", () => {
  test("teacher reports an issue on an approved item: sanitization, validation, and audit trail", async () => {
    // 1. Validation: reason too short (< 5 chars)
    const shortRes = await api(`/api/v1/question-bank/items/${approvedItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: { branchId: home.id, reason: "bad" },
    });
    expect(shortRes.status).toBe(400);

    // 2. Validation: reason with control characters
    const ctrlRes = await api(`/api/v1/question-bank/items/${approvedItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: { branchId: home.id, reason: "Illegal null byte: \0 in text" },
    });
    expect(ctrlRes.status).toBe(400);

    // 3. Valid report with markdown links to be stripped
    const reportRes = await api(`/api/v1/question-bank/items/${approvedItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: {
        branchId: home.id,
        reason: "Option B is spelled wrong. Check details at [link](https://phishing.site/exploit) or https://spam.com please.",
      },
    });
    expect(reportRes.status).toBe(201);
    expect(reportRes.json.data.ok).toBe(true);
    const reportId = reportRes.json.data.reportId;
    expect(reportId).toBeDefined();

    // DB inspection: Report row and audit row
    const reportInDb = await db.questionReport.findUnique({
      where: { id: reportId },
    });
    expect(reportInDb).not.toBeNull();
    expect(reportInDb!.reporterRole).toBe("TEACHER");
    expect(reportInDb!.reporterUserId).toBe(teacher.id);
    expect(reportInDb!.reporterStudentId).toBeNull();
    expect(reportInDb!.status).toBe(QuestionReportStatus.OPEN);

    // Hyperlinks must have been stripped
    expect(reportInDb!.reason).not.toContain("https://");
    expect(reportInDb!.reason).not.toContain("[link]");
    expect(reportInDb!.reason).toContain("Option B is spelled wrong.");

    const auditInDb = await db.questionBankAudit.findFirst({
      where: {
        itemId: approvedItem.id,
        action: "REPORT_FILED",
      },
    });
    expect(auditInDb).not.toBeNull();
    expect(auditInDb!.entity).toBe("ITEM");
    expect(auditInDb!.actorUserId).toBe(teacher.id);
  });

  test("pupil reporting enforces practice check: unpractised items are refused", async () => {
    // 1. Pupil attempts to report an item they have never practised
    const unpractisedRes = await api(`/api/v1/portal/students/${student.id}/practice/reports`, {
      method: "POST",
      cookie: pupilCookie,
      body: {
        itemId: approvedItem.id,
        reason: "I think this question is incorrect.",
      },
    });
    expect(unpractisedRes.status).toBe(400);
    expect(unpractisedRes.json.error.code).toBe("NOT_PRACTISED");

    // 2. Student practices the item
    const practiceSession = await db.practiceSession.create({
      data: {
        branchId: home.id,
        studentId: student.id,
        size: 1,
        itemIds: [approvedItem.id],
      },
    });

    await db.practiceAttempt.create({
      data: {
        sessionId: practiceSession.id,
        branchId: home.id,
        studentId: student.id,
        bankItemId: approvedItem.id,
        version: 1,
        answer: "A",
        correct: false,
      },
    });

    // 3. Now pupil reports the practiced item: succeeds
    const practisedRes = await api(`/api/v1/portal/students/${student.id}/practice/reports`, {
      method: "POST",
      cookie: pupilCookie,
      body: {
        itemId: approvedItem.id,
        reason: "The correct answer should be Lagos not Abuja.",
      },
    });
    expect(practisedRes.status).toBe(201);
    expect(practisedRes.json.data.ok).toBe(true);
    const pupilReportId = practisedRes.json.data.reportId;
    expect(pupilReportId).toBeDefined();

    // DB inspection
    const reportInDb = await db.questionReport.findUnique({
      where: { id: pupilReportId },
    });
    expect(reportInDb).not.toBeNull();
    expect(reportInDb!.reporterRole).toBe("PUPIL");
    expect(reportInDb!.reporterStudentId).toBe(student.id);
    expect(reportInDb!.reporterUserId).toBeNull();
    expect(reportInDb!.status).toBe(QuestionReportStatus.OPEN);
  });

  test("reviewer queue enforces NDPA reviewer masking and computes assessment re-grade impact", async () => {
    // Seed practice attempt for student
    const session = await db.practiceSession.create({
      data: {
        branchId: home.id,
        studentId: student.id,
        size: 1,
        itemIds: [approvedItem.id],
      },
    });
    await db.practiceAttempt.create({
      data: {
        sessionId: session.id,
        branchId: home.id,
        studentId: student.id,
        bankItemId: approvedItem.id,
        version: 1,
        answer: "A",
        correct: false,
      },
    });

    // Pupil reports approvedItem
    await api(`/api/v1/portal/students/${student.id}/practice/reports`, {
      method: "POST",
      cookie: pupilCookie,
      body: { itemId: approvedItem.id, reason: "Pupil says option B is wrong." },
    });

    // Teacher reports mathsItem
    await api(`/api/v1/question-bank/items/${mathsItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: { branchId: home.id, reason: "Teacher says 7 * 8 explanation is unclear." },
    });

    // Create a Quiz using approvedItem to verify re-grade impact
    const subject = await db.subject.create({
      data: { branchId: home.id, name: "Civics", code: "CIV" },
    });
    const quiz = await db.quiz.create({
      data: {
        branchId: home.id,
        subjectId: subject.id,
        title: "Civics Mid-Term Exam",
        status: "PUBLISHED",
      },
    });
    await db.quizQuestion.create({
      data: {
        branchId: home.id,
        quizId: quiz.id,
        prompt: approvedItem.prompt,
        correctAnswer: "B",
        sourceItemId: approvedItem.id,
      },
    });
    await db.quizAttempt.create({
      data: {
        branchId: home.id,
        quizId: quiz.id,
        studentId: student.id,
        score: 50,
      },
    });

    // Reviewer lists reports
    const listRes = await api(`/api/v1/question-bank/reports?branchId=${home.id}`, {
      headers: { cookie: reviewerCookie },
    });
    expect(listRes.status).toBe(200);
    const reports = listRes.json.data.reports;
    expect(reports.length).toBe(2);

    // NDPA PRIVACY INVARIANT (§8.5, §11):
    // Zero student personal data (IDs, names, admission numbers) may appear in reviewer response
    const rawJson = JSON.stringify(listRes.json);
    expect(rawJson).not.toContain(student.id);
    expect(rawJson).not.toContain(student.admissionNo);
    expect(rawJson).not.toContain("Amina");
    expect(rawJson).not.toContain("Sulaiman");

    const pupilReport = reports.find((r: { itemId: string }) => r.itemId === approvedItem.id);
    expect(pupilReport).toBeDefined();
    expect(pupilReport.reporter).toBe("Pupil in Junior Secondary");

    // Re-grade impact computation on quiz question
    expect(pupilReport.regradeImpact).not.toBeNull();
    expect(pupilReport.regradeImpact.affectedQuizzesCount).toBe(1);
    expect(pupilReport.regradeImpact.totalAttemptsCount).toBe(1);
    expect(pupilReport.regradeImpact.targets[0].quizTitle).toBe("Civics Mid-Term Exam");

    const teacherReport = reports.find((r: { itemId: string }) => r.itemId === mathsItem.id);
    expect(teacherReport).toBeDefined();
    expect(teacherReport.reporter).toContain("Teacher in");
  });

  test("reviewer resolves report as FIXED with explanation and assessment re-grade", async () => {
    // Teacher files report
    const reportRes = await api(`/api/v1/question-bank/items/${approvedItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: { branchId: home.id, reason: "Question has an error in option text." },
    });
    const reportId = reportRes.json.data.reportId;

    // Reviewer resolves report as FIXED
    const resolveRes = await api(`/api/v1/question-bank/reports/${reportId}`, {
      method: "PATCH",
      headers: { cookie: reviewerCookie },
      body: {
        outcome: "FIXED",
        outcomeReason: "Corrected option text from Lagos to Abuja.",
        applyRegrade: true,
      },
    });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.json.data.ok).toBe(true);
    expect(resolveRes.json.data.status).toBe("RESOLVED");
    expect(resolveRes.json.data.outcome).toBe("FIXED");

    // Verify DB update and audit row
    const reportInDb = await db.questionReport.findUnique({ where: { id: reportId } });
    expect(reportInDb!.status).toBe(QuestionReportStatus.RESOLVED);
    expect(reportInDb!.outcome).toBe(QuestionReportOutcome.FIXED);
    expect(reportInDb!.resolvedById).toBe(reviewer.id);
    expect(reportInDb!.resolvedAt).not.toBeNull();

    const auditInDb = await db.questionBankAudit.findFirst({
      where: {
        itemId: approvedItem.id,
        action: "REPORT_RESOLVED",
      },
    });
    expect(auditInDb).not.toBeNull();
    expect(auditInDb!.entity).toBe("ITEM");
    expect(auditInDb!.actorUserId).toBe(reviewer.id);

    // Attempting to resolve again fails
    const reResolveRes = await api(`/api/v1/question-bank/reports/${reportId}`, {
      method: "PATCH",
      headers: { cookie: reviewerCookie },
      body: {
        outcome: "FIXED",
        outcomeReason: "Trying to resolve again.",
      },
    });
    expect(reResolveRes.status).toBe(400);
    expect(reResolveRes.json.error.code).toBe("ALREADY_RESOLVED");
  });

  test("reviewer resolves report as NOT_AN_ERROR (DISMISSED) or NEEDS_DISCUSSION", async () => {
    // 1. Resolve as NOT_AN_ERROR -> status becomes DISMISSED
    const r1 = await api(`/api/v1/question-bank/items/${approvedItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: { branchId: home.id, reason: "I believe Abuja is not the capital." },
    });
    const r1Id = r1.json.data.reportId;

    const dismissRes = await api(`/api/v1/question-bank/reports/${r1Id}`, {
      method: "PATCH",
      headers: { cookie: reviewerCookie },
      body: {
        outcome: "NOT_AN_ERROR",
        outcomeReason: "Abuja is indeed the official federal capital of Nigeria since 1991.",
      },
    });
    expect(dismissRes.status).toBe(200);
    expect(dismissRes.json.data.status).toBe("DISMISSED");
    expect(dismissRes.json.data.outcome).toBe("NOT_AN_ERROR");

    // 2. Resolve as NEEDS_DISCUSSION -> outcome is recorded
    const r2 = await api(`/api/v1/question-bank/items/${mathsItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: { branchId: home.id, reason: "Can we also accept Roman numerals in options?" },
    });
    const r2Id = r2.json.data.reportId;

    const discussRes = await api(`/api/v1/question-bank/reports/${r2Id}`, {
      method: "PATCH",
      headers: { cookie: reviewerCookie },
      body: {
        outcome: "NEEDS_DISCUSSION",
        outcomeReason: "Will discuss format standards at next department meeting.",
      },
    });
    expect(discussRes.status).toBe(200);
    expect(discussRes.json.data.status).toBe("RESOLVED");
    expect(discussRes.json.data.outcome).toBe("NEEDS_DISCUSSION");

    // Validation: missing or too short outcome explanation
    const r3 = await api(`/api/v1/question-bank/items/${mathsItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: { branchId: home.id, reason: "Another question about formula phrasing." },
    });
    const r3Id = r3.json.data.reportId;

    const invalidRes = await api(`/api/v1/question-bank/reports/${r3Id}`, {
      method: "PATCH",
      headers: { cookie: reviewerCookie },
      body: {
        outcome: "NOT_AN_ERROR",
        outcomeReason: "no", // < 3 chars
      },
    });
    expect(invalidRes.status).toBe(400);
  });

  test("setting switches disable question reports for teachers and pupils", async () => {
    // 1. Disable teacher reports
    await db.settingValue.create({
      data: {
        scope: "GLOBAL",
        key: "bank.reports.teachers",
        value: false,
        status: "APPROVED",
      },
    });

    const teacherRes = await api(`/api/v1/question-bank/items/${approvedItem.id}/report`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: { branchId: home.id, reason: "Teacher reporting while switch is off." },
    });
    expect(teacherRes.status).toBe(403);
    expect(teacherRes.json.error.code).toBe("REPORTS_DISABLED");

    // 2. Disable pupil reports
    await db.settingValue.create({
      data: {
        scope: "GLOBAL",
        key: "bank.reports.pupils",
        value: false,
        status: "APPROVED",
      },
    });

    // Pupil practiced the item
    const sess = await db.practiceSession.create({
      data: {
        branchId: home.id,
        studentId: student.id,
        size: 1,
        itemIds: [approvedItem.id],
      },
    });
    await db.practiceAttempt.create({
      data: {
        sessionId: sess.id,
        branchId: home.id,
        studentId: student.id,
        bankItemId: approvedItem.id,
        version: 1,
        answer: "A",
        correct: false,
      },
    });

    const pupilRes = await api(`/api/v1/portal/students/${student.id}/practice/reports`, {
      method: "POST",
      cookie: pupilCookie,
      body: {
        itemId: approvedItem.id,
        reason: "Pupil reporting while switch is off.",
      },
    });
    expect(pupilRes.status).toBe(403);
    expect(pupilRes.json.error.code).toBe("REPORTS_DISABLED");
  });

  test("pupil retrieves report history with reviewer explanations and isolation across pupils", async () => {
    // Student 1 practices and reports approvedItem
    const sess1 = await db.practiceSession.create({
      data: {
        branchId: home.id,
        studentId: student.id,
        size: 1,
        itemIds: [approvedItem.id],
      },
    });
    await db.practiceAttempt.create({
      data: {
        sessionId: sess1.id,
        branchId: home.id,
        studentId: student.id,
        bankItemId: approvedItem.id,
        version: 1,
        answer: "A",
        correct: false,
      },
    });

    const repRes = await api(`/api/v1/portal/students/${student.id}/practice/reports`, {
      method: "POST",
      cookie: pupilCookie,
      body: {
        itemId: approvedItem.id,
        reason: "Option B seems misleading to me.",
      },
    });
    const reportId = repRes.json.data.reportId;

    // Reviewer resolves student 1's report
    await api(`/api/v1/question-bank/reports/${reportId}`, {
      method: "PATCH",
      headers: { cookie: reviewerCookie },
      body: {
        outcome: "FIXED",
        outcomeReason: "Clarified the question wording.",
      },
    });

    // Student 1 checks report history
    const historyRes = await api(`/api/v1/portal/students/${student.id}/practice/reports`, {
      cookie: pupilCookie,
    });
    expect(historyRes.status).toBe(200);
    const reports = historyRes.json.data.reports;
    expect(reports.length).toBe(1);
    expect(reports[0].id).toBe(reportId);
    expect(reports[0].questionPrompt).toBe(approvedItem.prompt);
    expect(reports[0].status).toBe("RESOLVED");
    expect(reports[0].outcome).toBe("FIXED");
    expect(reports[0].outcomeReason).toBe("Clarified the question wording.");

    // Student 2 checks report history -> sees nothing (isolation)
    const history2Res = await api(`/api/v1/portal/students/${student2.id}/practice/reports`, {
      cookie: pupil2Cookie,
    });
    expect(history2Res.status).toBe(200);
    expect(history2Res.json.data.reports.length).toBe(0);
  });
});
