import "../support/env";
import { test, expect } from "@playwright/test";
import { BankQuestionType, FormKind, FormMarkingMethod, FormStatus, Gender, Role } from "@prisma/client";
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
let otherTeacher: TestUser;
let otherTeacherCookie: string;
let student1: { id: string; admissionNo: string };
let student2: { id: string; admissionNo: string };
let group1: { id: string };

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

  // Student 1 in JSS 1 (Gold)
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
  student1 = { id: s1.id, admissionNo: s1.admissionNo };

  // Student 2 in JSS 1 (Gold)
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
  student2 = { id: s2.id, admissionNo: s2.admissionNo };

  teacher1 = await createUser({
    name: "Teacher One",
    role: Role.TEACHING_STAFF,
    superAdmin: false,
  });
  const t1Login = await loginAs(teacher1);
  expect(t1Login.status).toBe(200);
  teacher1Cookie = cookieHeader(t1Login.token!);

  otherTeacher = await createUser({
    name: "Other Teacher",
    superAdmin: false,
  });
  await db.membership.create({
    data: { userId: otherTeacher.id, branchId: otherBranch.id, role: Role.TEACHING_STAFF },
  });
  const otLogin = await loginAs(otherTeacher);
  expect(otLogin.status).toBe(200);
  otherTeacherCookie = cookieHeader(otLogin.token!);
});

test.describe("Manual Marking API (Task 0032 Slice 9)", () => {
  test("submitting a practice set with SHORT question marks response PENDING and masks keys in portal", async () => {
    // 1. Teacher creates practice set with mixed AUTO (SINGLE) and MANUAL (SHORT) questions
    const createRes = await api("/api/v1/forms", {
      method: "POST",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        kind: FormKind.PRACTICE_SET,
        title: "Integrated Science Assessment",
        classGroupIds: [group1.id],
        questions: [
          {
            prompt: "What is the primary source of energy for Earth?",
            questionType: BankQuestionType.SINGLE,
            points: 5,
            markingMethod: FormMarkingMethod.AUTO,
            options: ["The Moon", "The Sun", "Wind", "Geothermal"],
            correctAnswer: "The Sun",
            explanation: "The sun powers photosynthesis and climate systems.",
          },
          {
            prompt: "Explain how evaporation contributes to the water cycle in your own words.",
            questionType: BankQuestionType.SHORT,
            points: 10,
            // Defaults to MANUAL per §8.8
            correctAnswer: "Heat turns liquid water into vapor rising into the atmosphere.",
            explanation: "Evaporation turns water into water vapor.",
          },
        ],
      },
    });
    expect(createRes.status).toBe(201);
    const formId = createRes.json.data.formId;

    // Publish the form
    await db.form.update({
      where: { id: formId },
      data: { status: FormStatus.PUBLISHED },
    });

    // 2. Pupil 1 logs into portal and starts the practice set
    const p1Cookie = await portalCookie(student1.admissionNo, PUPIL_1_DOB);
    const startRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}/start`, {
      method: "POST",
      cookie: p1Cookie,
    });
    expect(startRes.status).toBe(201);
    const responseId = startRes.json.data.responseId;

    // 3. Pupil submits answers
    const questions = await db.formQuestion.findMany({ where: { formId }, orderBy: { sortOrder: "asc" } });
    const submitRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}/submit`, {
      method: "POST",
      cookie: p1Cookie,
      body: {
        responseId,
        answers: [
          { formQuestionId: questions[0].id, value: "The Sun" },
          { formQuestionId: questions[1].id, value: "The sun warms lakes and water turns into air vapor." },
        ],
      },
    });
    expect(submitRes.status).toBe(200);
    expect(submitRes.json.data.markingStatus).toBe("PENDING");
    expect(submitRes.json.data.isPendingReview).toBe(true);
    expect(submitRes.json.data.totalScore).toBe(5); // Only Q1 auto-awarded

    // 4. Pupil views their response result via portal: manual question must have score/explanation scrubbed
    const viewRes = await api(
      `/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}/responses/${responseId}`,
      { cookie: p1Cookie },
    );
    expect(viewRes.status).toBe(200);
    const pupilView = viewRes.json.data.response;
    expect(pupilView.isPendingReview).toBe(true);
    expect(pupilView.markingStatus).toBe("PENDING");

    // Auto question has score visible
    const q1Ans = pupilView.answers.find((a: { formQuestionId: string }) => a.formQuestionId === questions[0].id);
    expect(q1Ans.score).toBe(5);
    expect(q1Ans.isPending).toBe(false);

    // Manual question is pending: score, correctAnswer, and explanation are null
    const q2Ans = pupilView.answers.find((a: { formQuestionId: string }) => a.formQuestionId === questions[1].id);
    expect(q2Ans.score).toBeNull();
    expect(q2Ans.isPending).toBe(true);
    expect(q2Ans.correctAnswer).toBeNull();
    expect(q2Ans.explanation).toBeNull();
  });

  test("teacher inspects marking queue and marks student answer with audit logging", async () => {
    // 1. Create and publish form with 1 SHORT question
    const form = await db.form.create({
      data: {
        branchId: home.id,
        createdById: teacher1.id,
        title: "Essay Practice",
        kind: FormKind.PRACTICE_SET,
        status: FormStatus.PUBLISHED,
      },
    });

    const question = await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "Describe cellular respiration.",
        questionType: BankQuestionType.SHORT,
        points: 10,
        markingMethod: FormMarkingMethod.MANUAL,
      },
    });

    // Student 1 submits
    const response = await db.formResponse.create({
      data: {
        branchId: home.id,
        formId: form.id,
        studentId: student1.id,
        status: "COMPLETED",
        score: 0,
        maxScore: 10,
        markingStatus: "PENDING",
        submittedAt: new Date(),
      },
    });

    const answer = await db.formAnswer.create({
      data: {
        branchId: home.id,
        responseId: response.id,
        formQuestionId: question.id,
        value: "Glucose is broken down to release ATP energy.",
        score: 0,
        markingStatus: "PENDING",
      },
    });

    // 2. Teacher checks marking queue for this form
    const queueRes = await api(`/api/v1/forms/${form.id}/marking-queue?branchId=${home.id}`, {
      cookie: teacher1Cookie,
    });
    expect(queueRes.status).toBe(200);
    expect(queueRes.json.data.responses.length).toBe(1);
    expect(queueRes.json.data.responses[0].responseId).toBe(response.id);
    expect(queueRes.json.data.responses[0].student.admissionNo).toBe(student1.admissionNo);
    expect(queueRes.json.data.responses[0].pendingQuestions).toBe(1);

    // 3. Teacher fetches response details for grading
    const detailRes = await api(`/api/v1/forms/${form.id}/responses/${response.id}/marking?branchId=${home.id}`, {
      cookie: teacher1Cookie,
    });
    expect(detailRes.status).toBe(200);
    expect(detailRes.json.data.student.name).toBe("Amina Bello");
    expect(detailRes.json.data.answers[0].submittedValue).toBe("Glucose is broken down to release ATP energy.");

    // 4. Teacher grades the answer (awards 9 out of 10 points)
    const markRes = await api(`/api/v1/forms/${form.id}/responses/${response.id}/marking`, {
      method: "PATCH",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        answerId: answer.id,
        score: 9,
        feedback: "Clear explanation of glucose breakdown and ATP production.",
      },
    });
    expect(markRes.status).toBe(200);
    expect(markRes.json.data.score).toBe(9);
    expect(markRes.json.data.overallResponseScore).toBe(9);
    expect(markRes.json.data.overallResponseMarkingStatus).toBe("MARKED");

    // 5. Verify immutable audit log in database
    const audit = await db.formMarkingAudit.findFirst({
      where: { responseId: response.id, action: "ANSWER_MARKED" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.scoreAwarded).toBe(9);
    expect(audit?.actorUserId).toBe(teacher1.id);
    expect(audit?.feedback).toContain("Clear explanation");

    // 6. Pupil fetches response in portal: now MARKED, shows score and feedback
    const p1Cookie = await portalCookie(student1.admissionNo, PUPIL_1_DOB);
    const pupilRes = await api(
      `/api/v1/portal/students/${student1.id}/forms/practice-sets/${form.id}/responses/${response.id}`,
      { cookie: p1Cookie },
    );
    expect(pupilRes.status).toBe(200);
    expect(pupilRes.json.data.response.markingStatus).toBe("MARKED");
    expect(pupilRes.json.data.response.isPendingReview).toBe(false);
    expect(pupilRes.json.data.response.answers[0].score).toBe(9);
    expect(pupilRes.json.data.response.answers[0].feedback).toContain("Clear explanation");
  });

  test("teacher grades entire attempt in batch with ATTEMPT_MARKED audit", async () => {
    // Form with 2 short questions
    const form = await db.form.create({
      data: {
        branchId: home.id,
        createdById: teacher1.id,
        title: "Batch Marking Quiz",
        kind: FormKind.PRACTICE_SET,
        status: FormStatus.PUBLISHED,
      },
    });

    const q1 = await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "Define velocity.",
        questionType: BankQuestionType.SHORT,
        points: 5,
        markingMethod: FormMarkingMethod.MANUAL,
        sortOrder: 0,
      },
    });

    const q2 = await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "Define acceleration.",
        questionType: BankQuestionType.SHORT,
        points: 5,
        markingMethod: FormMarkingMethod.MANUAL,
        sortOrder: 1,
      },
    });

    const response = await db.formResponse.create({
      data: {
        branchId: home.id,
        formId: form.id,
        studentId: student2.id,
        status: "COMPLETED",
        score: 0,
        maxScore: 10,
        markingStatus: "PENDING",
        submittedAt: new Date(),
      },
    });

    const a1 = await db.formAnswer.create({
      data: {
        branchId: home.id,
        responseId: response.id,
        formQuestionId: q1.id,
        value: "Speed with a direction",
        score: 0,
        markingStatus: "PENDING",
      },
    });

    const a2 = await db.formAnswer.create({
      data: {
        branchId: home.id,
        responseId: response.id,
        formQuestionId: q2.id,
        value: "Rate of change of velocity",
        score: 0,
        markingStatus: "PENDING",
      },
    });

    // Batch mark both answers
    const patchRes = await api(`/api/v1/forms/${form.id}/responses/${response.id}/marking`, {
      method: "PATCH",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        answers: [
          { answerId: a1.id, score: 5, feedback: "Spot on" },
          { answerId: a2.id, score: 4.5, feedback: "Very good definition" },
        ],
        overallFeedback: "Strong physics fundamentals demonstrated.",
      },
    });

    expect(patchRes.status).toBe(200);
    expect(patchRes.json.data.totalScore).toBe(9.5);
    expect(patchRes.json.data.markingStatus).toBe("MARKED");
    expect(patchRes.json.data.accuracyPercentage).toBe(95);

    // Check audits: 2 ANSWER_MARKED rows and 1 ATTEMPT_MARKED row
    const audits = await db.formMarkingAudit.findMany({
      where: { responseId: response.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.length).toBe(3);
    const attemptAudit = audits.find((a) => a.action === "ATTEMPT_MARKED");
    expect(attemptAudit).toBeDefined();
    expect(attemptAudit?.scoreAwarded).toBe(9.5);
    expect(attemptAudit?.feedback).toBe("Strong physics fundamentals demonstrated.");
  });

  test("rejects invalid scores exceeding max points or on in-progress attempts", async () => {
    const form = await db.form.create({
      data: {
        branchId: home.id,
        createdById: teacher1.id,
        title: "Validation Check",
        kind: FormKind.PRACTICE_SET,
      },
    });

    const question = await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "What is 2+2?",
        questionType: BankQuestionType.SHORT,
        points: 5,
        markingMethod: FormMarkingMethod.MANUAL,
      },
    });

    // Attempt still IN_PROGRESS
    const inProgressResp = await db.formResponse.create({
      data: {
        branchId: home.id,
        formId: form.id,
        studentId: student1.id,
        status: "IN_PROGRESS",
        score: 0,
        maxScore: 5,
        markingStatus: "PENDING",
      },
    });

    const inProgressAns = await db.formAnswer.create({
      data: {
        branchId: home.id,
        responseId: inProgressResp.id,
        formQuestionId: question.id,
        value: "4",
        markingStatus: "PENDING",
      },
    });

    // Marking IN_PROGRESS attempt must be refused
    const inProgressMark = await api(`/api/v1/forms/${form.id}/responses/${inProgressResp.id}/marking`, {
      method: "PATCH",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        answerId: inProgressAns.id,
        score: 5,
      },
    });
    expect(inProgressMark.status).toBe(400);
    expect(inProgressMark.json.error.message).toContain("must be COMPLETED");

    // Update status to COMPLETED
    await db.formResponse.update({
      where: { id: inProgressResp.id },
      data: { status: "COMPLETED" },
    });

    // Score exceeds max points (6 > 5)
    const excessMark = await api(`/api/v1/forms/${form.id}/responses/${inProgressResp.id}/marking`, {
      method: "PATCH",
      cookie: teacher1Cookie,
      body: {
        branchId: home.id,
        answerId: inProgressAns.id,
        score: 6,
      },
    });
    expect(excessMark.status).toBe(400);
    expect(excessMark.json.error.message).toContain("cannot exceed maximum points");
  });

  test("enforces ADR 0014 branch isolation and append-only trigger protection", async () => {
    const form = await db.form.create({
      data: {
        branchId: home.id,
        createdById: teacher1.id,
        title: "Isolation Test",
        kind: FormKind.PRACTICE_SET,
        status: FormStatus.PUBLISHED,
      },
    });

    const question = await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "Question 1",
        questionType: BankQuestionType.SHORT,
        points: 10,
        markingMethod: FormMarkingMethod.MANUAL,
      },
    });

    const response = await db.formResponse.create({
      data: {
        branchId: home.id,
        formId: form.id,
        studentId: student1.id,
        status: "COMPLETED",
        score: 0,
        maxScore: 10,
        markingStatus: "PENDING",
      },
    });

    const answer = await db.formAnswer.create({
      data: {
        branchId: home.id,
        responseId: response.id,
        formQuestionId: question.id,
        value: "Answer",
        markingStatus: "PENDING",
      },
    });

    // Cross-branch GET: other teacher from otherBranch attempts to view home branch marking queue
    // Per ADR 0014 query parameter branch existence hiding: returns 404
    const crossGet = await api(`/api/v1/forms/${form.id}/marking-queue?branchId=${home.id}`, {
      cookie: otherTeacherCookie,
    });
    expect(crossGet.status).toBe(404);

    // Cross-branch PATCH: other teacher attempts to mark response in home branch
    // Request body branch mismatch: returns 403
    const crossPatch = await api(`/api/v1/forms/${form.id}/responses/${response.id}/marking`, {
      method: "PATCH",
      cookie: otherTeacherCookie,
      body: {
        branchId: home.id,
        answerId: answer.id,
        score: 10,
      },
    });
    expect(crossPatch.status).toBe(403);

    // Direct database test: question_bank_append_only trigger refuses modification of FormMarkingAudit
    const auditRow = await db.formMarkingAudit.create({
      data: {
        branchId: home.id,
        responseId: response.id,
        answerId: answer.id,
        formId: form.id,
        studentId: student1.id,
        scoreAwarded: 8,
        maxScore: 10,
        action: "ANSWER_MARKED",
        actorUserId: teacher1.id,
      },
    });

    // Attempting to update or delete the audit row directly in Postgres must fail
    await expect(
      db.formMarkingAudit.update({
        where: { id: auditRow.id },
        data: { scoreAwarded: 10 },
      }),
    ).rejects.toThrow();

    await expect(
      db.formMarkingAudit.delete({
        where: { id: auditRow.id },
      }),
    ).rejects.toThrow();
  });
});
