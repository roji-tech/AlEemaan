import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
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
let teacher: TestUser;
let teacherCookie: string;
let otherTeacher: TestUser;
let otherTeacherCookie: string;
let student1: { id: string; admissionNo: string };
let student2: { id: string; admissionNo: string };
let group1: { id: string };
let group2: { id: string };
let bankItem: { id: string; prompt: string };

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

  group2 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2" } });
  const arm2 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group2.id, name: "Silver" } });

  // Student 1 in JSS 1 (Gold)
  const s1 = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Zainab",
      lastName: "Ali",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  student1 = { id: s1.id, admissionNo: s1.admissionNo };

  await db.studentEnrollment.create({
    data: {
      studentId: s1.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm1.id,
      status: "ACTIVE",
    },
  });

  // Student 2 in JSS 2 (Silver)
  const s2 = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Bilal",
      lastName: "Usman",
      gender: Gender.MALE,
      dateOfBirth: new Date("2014-06-15"),
      admissionNo: "2026/0002",
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  student2 = { id: s2.id, admissionNo: s2.admissionNo };

  await db.studentEnrollment.create({
    data: {
      studentId: s2.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 2",
      arm: "Silver",
      classArmId: arm2.id,
      status: "ACTIVE",
    },
  });

  // Staff users
  teacher = await createUser({
    name: "Tariq Teacher",
    role: Role.TEACHING_STAFF,
    superAdmin: false,
  });
  const tLogin = await loginAs(teacher);
  expect(tLogin.status).toBe(200);
  teacherCookie = cookieHeader(tLogin.token!);

  otherTeacher = await createUser({
    name: "Omar Other",
    superAdmin: false,
  });
  await db.membership.create({
    data: { userId: otherTeacher.id, branchId: otherBranch.id, role: Role.TEACHING_STAFF },
  });
  const otLogin = await loginAs(otherTeacher);
  expect(otLogin.status).toBe(200);
  otherTeacherCookie = cookieHeader(otLogin.token!);

  // Question bank approved item
  bankItem = await db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: "What organelle produces ATP?",
      explanation: "Mitochondria produce ATP via cellular respiration.",
      points: 1,
      topic: "Cell Biology",
      subjectLabel: "Biology",
      subjectKey: "biology",
      options: [
        { id: "A", text: "Nucleus" },
        { id: "B", text: "Mitochondria" },
        { id: "C", text: "Chloroplast" },
      ],
      correctAnswer: "B",
      visibility: "PRACTICE",
      status: "APPROVED",
      submittedById: teacher.id,
      approvedById: teacher.id,
      approvedAt: new Date(),
    },
  });
});

test("teacher creates practice set copying bank items and ad-hoc questions (draft status)", async () => {
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      branchId: home.id,
      title: "Cell Biology Practice 1",
      instructions: "Attempt all questions. Take your time.",
      maxDurationMinutes: 30,
      classGroupIds: [group1.id],
      questions: [
        {
          sourceItemId: bankItem.id,
        },
        {
          prompt: "Which gas is released during photosynthesis?",
          questionType: "SINGLE",
          options: [
            { id: "A", text: "Oxygen" },
            { id: "B", text: "Carbon Dioxide" },
            { id: "C", text: "Nitrogen" },
          ],
          correctAnswer: "A",
          points: 2,
          explanation: "Oxygen is produced as a byproduct of photolysis.",
        },
      ],
    },
  });

  expect(createRes.status).toBe(201);
  expect(createRes.json.data.ok).toBe(true);
  const formId = createRes.json.data.formId;
  expect(formId).toBeDefined();
  expect(createRes.json.data.questionCount).toBe(2);
  expect(createRes.json.data.status).toBe("DRAFT");

  // Staff can read details including answer keys
  const getRes = await api(`/api/v1/forms/${formId}?branchId=${home.id}`, {
    cookie: teacherCookie,
  });
  expect(getRes.status).toBe(200);
  const form = getRes.json.data.form;
  expect(form.title).toBe("Cell Biology Practice 1");
  expect(form.status).toBe("DRAFT");
  expect(form.questions).toHaveLength(2);
  expect(form.questions[0].correctAnswer).toBe("B");
  expect(form.questions[0].explanation).toBe("Mitochondria produce ATP via cellular respiration.");
  expect(form.questions[1].correctAnswer).toBe("A");
  expect(form.questions[1].points).toBe(2);
});

test("practice set lifecycle: publish, audience eligibility, secrecy, start, submit, close", async () => {
  // 1. Create practice set targeted to JSS 1 (group1)
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      branchId: home.id,
      title: "JSS 1 Midterm Practice",
      instructions: "Answer carefully.",
      maxDurationMinutes: 45,
      classGroupIds: [group1.id],
      questions: [
        {
          sourceItemId: bankItem.id,
        },
        {
          prompt: "Water is composed of hydrogen and oxygen.",
          questionType: "TRUE_FALSE",
          options: [
            { id: "true", text: "True" },
            { id: "false", text: "False" },
          ],
          correctAnswer: "true",
          points: 1,
          explanation: "Water is H2O.",
        },
      ],
    },
  });
  expect(createRes.status).toBe(201);
  const formId = createRes.json.data.formId;

  const pupil1Cookie = await portalCookie(student1.admissionNo, PUPIL_1_DOB);
  const pupil2Cookie = await portalCookie(student2.admissionNo, PUPIL_2_DOB);

  // 2. While in DRAFT, pupil 1 cannot see it
  const draftListRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets`, {
    cookie: pupil1Cookie,
  });
  expect(draftListRes.status).toBe(200);
  expect(draftListRes.json.data.practiceSets).toHaveLength(0);

  // 3. Teacher publishes practice set
  const pubRes = await api(`/api/v1/forms/${formId}`, {
    method: "PATCH",
    cookie: teacherCookie,
    body: {
      branchId: home.id,
      status: "PUBLISHED",
    },
  });
  expect(pubRes.status).toBe(200);
  expect(pubRes.json.data.status).toBe("PUBLISHED");

  // 4. Audience filtering: Pupil 1 (JSS 1) sees it; Pupil 2 (JSS 2) does NOT see it
  const p1ListRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets`, {
    cookie: pupil1Cookie,
  });
  expect(p1ListRes.status).toBe(200);
  expect(p1ListRes.json.data.practiceSets).toHaveLength(1);
  expect(p1ListRes.json.data.practiceSets[0].id).toBe(formId);
  expect(p1ListRes.json.data.practiceSets[0].hasSubmitted).toBe(false);

  const p2ListRes = await api(`/api/v1/portal/students/${student2.id}/forms/practice-sets`, {
    cookie: pupil2Cookie,
  });
  expect(p2ListRes.status).toBe(200);
  expect(p2ListRes.json.data.practiceSets).toHaveLength(0);

  // Pupil 2 attempting to get the form directly gets 403 FORBIDDEN
  const p2GetRes = await api(`/api/v1/portal/students/${student2.id}/forms/practice-sets/${formId}`, {
    cookie: pupil2Cookie,
  });
  expect(p2GetRes.status).toBe(403);

  // 5. Exam Secrecy: Pupil 1 fetches practice set -> questions are strictly scrubbed
  const p1GetRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}`, {
    cookie: pupil1Cookie,
  });
  expect(p1GetRes.status).toBe(200);
  const questions = p1GetRes.json.data.practiceSet.questions;
  expect(questions).toHaveLength(2);

  const questionsJson = JSON.stringify(questions);
  expect(questionsJson).not.toContain("correctAnswer");
  expect(questionsJson).not.toContain("cellular respiration");
  expect(questionsJson).not.toContain("Water is H2O");

  // 6. Pupil 1 starts response session
  const startRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}/start`, {
    method: "POST",
    cookie: pupil1Cookie,
  });
  expect(startRes.status).toBe(201);
  const responseId = startRes.json.data.responseId;
  expect(responseId).toBeDefined();
  expect(startRes.json.data.isResume).toBe(false);

  // Resuming returns same responseId
  const resumeRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}/start`, {
    method: "POST",
    cookie: pupil1Cookie,
  });
  expect(resumeRes.status).toBe(201);
  expect(resumeRes.json.data.responseId).toBe(responseId);
  expect(resumeRes.json.data.isResume).toBe(true);

  // 7. Pupil 1 submits answers: Q1 correct ("B"), Q2 incorrect ("false")
  const q1Id = questions[0].id;
  const q2Id = questions[1].id;

  const submitRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}/submit`, {
    method: "POST",
    cookie: pupil1Cookie,
    body: {
      responseId,
      answers: [
        { formQuestionId: q1Id, value: "B" },
        { formQuestionId: q2Id, value: "false" },
      ],
    },
  });

  expect(submitRes.status).toBe(200);
  expect(submitRes.json.data.ok).toBe(true);
  expect(submitRes.json.data.status).toBe("COMPLETED");
  expect(submitRes.json.data.totalScore).toBe(1);
  expect(submitRes.json.data.maxScore).toBe(2);
  expect(submitRes.json.data.accuracyPercentage).toBe(50);

  // Exposing feedback & explanations after completion
  const results = submitRes.json.data.results;
  expect(results).toHaveLength(2);
  expect(results[0].isCorrect).toBe(true);
  expect(results[0].explanation).toBe("Mitochondria produce ATP via cellular respiration.");
  expect(results[1].isCorrect).toBe(false);
  expect(results[1].explanation).toBe("Water is H2O.");

  // Submitting again on completed session is rejected
  const dupSubmitRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}/submit`, {
    method: "POST",
    cookie: pupil1Cookie,
    body: {
      responseId,
      answers: [{ formQuestionId: q1Id, value: "B" }],
    },
  });
  expect(dupSubmitRes.status).toBe(400);

  // 8. Staff views responses overview
  const responsesRes = await api(`/api/v1/forms/${formId}/responses?branchId=${home.id}`, {
    cookie: teacherCookie,
  });
  expect(responsesRes.status).toBe(200);
  expect(responsesRes.json.data.responses).toHaveLength(1);
  const resp = responsesRes.json.data.responses[0];
  expect(resp.studentId).toBe(student1.id);
  expect(resp.studentName).toBe("Zainab Ali");
  expect(resp.score).toBe(1);
  expect(resp.maxScore).toBe(2);
  expect(resp.status).toBe("COMPLETED");

  // 9. Teacher closes practice set
  const closeRes = await api(`/api/v1/forms/${formId}/close?branchId=${home.id}`, {
    method: "POST",
    cookie: teacherCookie,
  });
  expect(closeRes.status).toBe(200);
  expect(closeRes.json.data.status).toBe("CLOSED");

  // Subsequent pupil get and start calls are refused
  const closedGetRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}`, {
    cookie: pupil1Cookie,
  });
  expect(closedGetRes.status).toBe(403);

  const closedStartRes = await api(`/api/v1/portal/students/${student1.id}/forms/practice-sets/${formId}/start`, {
    method: "POST",
    cookie: pupil1Cookie,
  });
  expect(closedStartRes.status).toBe(403);
});

test("cross-branch isolation: other branch staff cannot read or close practice sets", async () => {
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      branchId: home.id,
      title: "Branch 1 Isolated Form",
      questions: [
        {
          prompt: "Sample question?",
          questionType: "SHORT",
          correctAnswer: "Yes",
          points: 1,
        },
      ],
    },
  });
  expect(createRes.status).toBe(201);
  const formId = createRes.json.data.formId;

  // Other branch teacher cannot get the form
  const otherGetRes = await api(`/api/v1/forms/${formId}?branchId=${otherBranch.id}`, {
    cookie: otherTeacherCookie,
  });
  expect(otherGetRes.status).toBe(404);

  // Other branch teacher cannot close the form
  const otherCloseRes = await api(`/api/v1/forms/${formId}/close?branchId=${otherBranch.id}`, {
    method: "POST",
    cookie: otherTeacherCookie,
  });
  expect(otherCloseRes.status).toBe(404);
});
