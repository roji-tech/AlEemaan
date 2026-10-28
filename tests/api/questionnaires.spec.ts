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
let teacher1: TestUser;
let teacher1Cookie: string;
let otherTeacher: TestUser;
let otherTeacherCookie: string;
let student1: { id: string; admissionNo: string };
let student2: { id: string; admissionNo: string };
let group1: { id: string };
let group2: { id: string };

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
      firstName: "Hafsat",
      lastName: "Aliyu",
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
      firstName: "Ibrahim",
      lastName: "Sanusi",
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
  teacher1 = await createUser({
    name: "Aisha Staff",
    role: Role.TEACHING_STAFF,
    superAdmin: false,
  });
  const t1Login = await loginAs(teacher1);
  expect(t1Login.status).toBe(200);
  teacher1Cookie = cookieHeader(t1Login.token!);

  otherTeacher = await createUser({
    name: "Usman Other",
    superAdmin: false,
  });
  await db.membership.create({
    data: { userId: otherTeacher.id, branchId: otherBranch.id, role: Role.TEACHING_STAFF },
  });
  const otLogin = await loginAs(otherTeacher);
  expect(otLogin.status).toBe(200);
  otherTeacherCookie = cookieHeader(otLogin.token!);
});

test("teacher creates anonymous staff questionnaire and submits response with deduplication", async () => {
  // 1. Create questionnaire
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      kind: "QUESTIONNAIRE",
      branchId: home.id,
      title: "Staff Workplace Satisfaction 2026",
      instructions: "Your responses are strictly anonymous.",
      isAnonymous: true,
      audienceKind: "MEMBERS",
      roles: ["TEACHING_STAFF", "NON_TEACHING_STAFF"],
      questions: [
        {
          prompt: "How satisfied are you with staff amenities?",
          questionType: "SINGLE",
          options: [
            { id: "A", text: "Very Satisfied" },
            { id: "B", text: "Neutral" },
            { id: "C", text: "Dissatisfied" },
          ],
        },
        {
          prompt: "Any additional improvements you would like to see?",
          questionType: "SHORT",
        },
      ],
    },
  });

  expect(createRes.status).toBe(201);
  expect(createRes.json.data.ok).toBe(true);
  const formId = createRes.json.data.formId;
  expect(formId).toBeDefined();
  expect(createRes.json.data.isAnonymous).toBe(true);
  expect(createRes.json.data.status).toBe("DRAFT");

  // 2. Publish questionnaire
  const pubRes = await api(`/api/v1/forms/${formId}`, {
    method: "PATCH",
    cookie: teacher1Cookie,
    body: {
      branchId: home.id,
      status: "PUBLISHED",
    },
  });
  expect(pubRes.status).toBe(200);
  expect(pubRes.json.data.status).toBe("PUBLISHED");

  // 3. Staff discovers available questionnaire
  const availRes = await api(`/api/v1/forms/available?branchId=${home.id}`, {
    cookie: teacher1Cookie,
  });
  expect(availRes.status).toBe(200);
  expect(availRes.json.data.questionnaires).toHaveLength(1);
  expect(availRes.json.data.questionnaires[0].id).toBe(formId);
  expect(availRes.json.data.questionnaires[0].hasSubmitted).toBe(false);

  // Read full questionnaire to get question IDs
  const getRes = await api(`/api/v1/forms/${formId}?branchId=${home.id}`, {
    cookie: teacher1Cookie,
  });
  expect(getRes.status).toBe(200);
  const questions = getRes.json.data.form.questions;
  expect(questions).toHaveLength(2);

  // 4. Staff submits response
  const submitRes = await api(`/api/v1/forms/${formId}/submit`, {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      branchId: home.id,
      answers: [
        { formQuestionId: questions[0].id, value: "A" },
        { formQuestionId: questions[1].id, value: "Need better coffee in the lounge." },
      ],
    },
  });

  expect(submitRes.status).toBe(200);
  expect(submitRes.json.data.ok).toBe(true);
  expect(submitRes.json.data.isAnonymous).toBe(true);

  // Verify DB anonymity: FormResponse MUST NOT link respondentId
  const dbResponse = await db.formResponse.findFirst({
    where: { formId },
  });
  expect(dbResponse).toBeDefined();
  expect(dbResponse?.respondentId).toBeNull();
  expect(dbResponse?.studentId).toBeNull();

  // Verify deduplication tracking: one FormParticipation records that someone submitted, under a code and not under teacher1's id (the code is covered in
  // questionnaire-anonymity.spec.ts)
  expect(await db.formParticipation.findFirst({ where: { formId, respondentId: teacher1.id } })).toBeNull();
  expect(await db.formParticipation.count({ where: { formId } })).toBe(1);

  // 5. Duplicate submission is rejected
  const dupRes = await api(`/api/v1/forms/${formId}/submit`, {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      branchId: home.id,
      answers: [{ formQuestionId: questions[0].id, value: "B" }],
    },
  });
  expect(dupRes.status).toBe(400);

  // 6. Staff available list now reports hasSubmitted: true
  const availRes2 = await api(`/api/v1/forms/available?branchId=${home.id}`, {
    cookie: teacher1Cookie,
  });
  expect(availRes2.status).toBe(200);
  expect(availRes2.json.data.questionnaires[0].hasSubmitted).toBe(true);

  // 7. Staff analytics overview
  const analyticsRes = await api(`/api/v1/forms/${formId}/analytics?branchId=${home.id}`, {
    cookie: teacher1Cookie,
  });
  expect(analyticsRes.status).toBe(200);
  const analytics = analyticsRes.json.data.analytics;
  expect(analytics.totalResponses).toBe(1);
  expect(analytics.isAnonymous).toBe(true);
  // One answer to an anonymous questionnaire is below the small-sample threshold (5): the count is shown, the breakdown and the written answer are not. The breakdown
  // with enough answers is covered in questionnaire-anonymity.spec.ts.
  expect(analytics.suppressed).toBe(true);
  expect(analytics.questions[0].optionCounts).toBeUndefined();
  expect(analytics.questions[1].textResponses).toBeUndefined();
  expect(JSON.stringify(analytics)).not.toContain("Need better coffee");
});

test("pupil discovers and completes student-scoped questionnaire", async () => {
  // 1. Create questionnaire targeted to JSS 1 students
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      kind: "QUESTIONNAIRE",
      branchId: home.id,
      title: "JSS 1 Class Activities Survey",
      isAnonymous: false,
      audienceKind: "MEMBERS",
      roles: ["STUDENT"],
      classGroupIds: [group1.id],
      questions: [
        {
          prompt: "What is your favorite subject?",
          questionType: "SINGLE",
          options: [
            { id: "MATH", text: "Mathematics" },
            { id: "ENG", text: "English" },
            { id: "SCI", text: "Science" },
          ],
        },
      ],
    },
  });
  expect(createRes.status).toBe(201);
  const formId = createRes.json.data.formId;

  // Publish
  await api(`/api/v1/forms/${formId}`, {
    method: "PATCH",
    cookie: teacher1Cookie,
    body: { branchId: home.id, status: "PUBLISHED" },
  });

  const pupil1Cookie = await portalCookie(student1.admissionNo, PUPIL_1_DOB);
  const pupil2Cookie = await portalCookie(student2.admissionNo, PUPIL_2_DOB);

  // 2. Pupil 1 (JSS 1) discovers questionnaire
  const p1ListRes = await api(`/api/v1/portal/students/${student1.id}/forms/questionnaires`, {
    cookie: pupil1Cookie,
  });
  expect(p1ListRes.status).toBe(200);
  expect(p1ListRes.json.data.questionnaires).toHaveLength(1);
  expect(p1ListRes.json.data.questionnaires[0].id).toBe(formId);

  // Pupil 2 (JSS 2) does NOT see it
  const p2ListRes = await api(`/api/v1/portal/students/${student2.id}/forms/questionnaires`, {
    cookie: pupil2Cookie,
  });
  expect(p2ListRes.status).toBe(200);
  expect(p2ListRes.json.data.questionnaires).toHaveLength(0);

  // 3. Pupil 1 fetches questionnaire questions
  const p1GetRes = await api(`/api/v1/portal/students/${student1.id}/forms/questionnaires/${formId}`, {
    cookie: pupil1Cookie,
  });
  expect(p1GetRes.status).toBe(200);
  const questions = p1GetRes.json.data.questionnaire.questions;
  expect(questions).toHaveLength(1);

  // 4. Pupil 1 submits questionnaire
  const p1SubmitRes = await api(`/api/v1/portal/students/${student1.id}/forms/questionnaires/${formId}/submit`, {
    method: "POST",
    cookie: pupil1Cookie,
    body: {
      answers: [{ formQuestionId: questions[0].id, value: "SCI" }],
    },
  });
  expect(p1SubmitRes.status).toBe(200);

  // Form is non-anonymous -> verify studentId is recorded
  const dbResponse = await db.formResponse.findFirst({
    where: { formId, studentId: student1.id },
  });
  expect(dbResponse).toBeDefined();

  // Duplicate submit fails
  const dupSubmit = await api(`/api/v1/portal/students/${student1.id}/forms/questionnaires/${formId}/submit`, {
    method: "POST",
    cookie: pupil1Cookie,
    body: {
      answers: [{ formQuestionId: questions[0].id, value: "MATH" }],
    },
  });
  expect(dupSubmit.status).toBe(400);
});

test("public questionnaire access and unauthenticated response submission", async () => {
  // 1. Create public questionnaire
  const createRes = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacher1Cookie,
    body: {
      kind: "QUESTIONNAIRE",
      branchId: home.id,
      title: "Community Outreach Feedback",
      instructions: "Open to prospective parents and local community.",
      isAnonymous: true,
      audienceKind: "PUBLIC",
      questions: [
        {
          prompt: "How did you hear about AlEemaan?",
          questionType: "SINGLE",
          options: [
            { id: "A", text: "Word of mouth" },
            { id: "B", text: "Social media" },
            { id: "C", text: "Signpost" },
          ],
        },
      ],
    },
  });
  expect(createRes.status).toBe(201);
  const formId = createRes.json.data.formId;
  const shareToken = createRes.json.data.shareToken;
  expect(shareToken).toBeDefined();

  // Publish
  await api(`/api/v1/forms/${formId}`, {
    method: "PATCH",
    cookie: teacher1Cookie,
    body: { branchId: home.id, status: "PUBLISHED" },
  });

  // 2. Unauthenticated user fetches public questionnaire via token
  const pubGet = await api(`/api/v1/forms/public/${shareToken}`);
  expect(pubGet.status).toBe(200);
  expect(pubGet.json.data.questionnaire.title).toBe("Community Outreach Feedback");
  const questions = pubGet.json.data.questionnaire.questions;
  expect(questions).toHaveLength(1);

  // 3. Unauthenticated user submits response
  const pubSubmit = await api(`/api/v1/forms/public/${shareToken}/submit`, {
    method: "POST",
    body: {
      answers: [{ formQuestionId: questions[0].id, value: "B" }],
    },
  });
  expect(pubSubmit.status).toBe(200);
  expect(pubSubmit.json.data.ok).toBe(true);

  // 4. Cross-branch isolation: other branch teacher cannot inspect analytics of this form
  const otherAnalytics = await api(`/api/v1/forms/${formId}/analytics?branchId=${otherBranch.id}`, {
    cookie: otherTeacherCookie,
  });
  expect(otherAnalytics.status).toBe(404);
});
