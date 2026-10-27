import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api } from "../support/http";

const PUPIL_DOB = "2013-05-10";
const GUARDIAN_PHONE = "+2348011110001";

const portalCookie = async (admissionNo: string, secret: string = PUPIL_DOB) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let student: { id: string; admissionNo: string };
let authorUser: { id: string };
let practiceItems: Array<{ id: string; prompt: string }>;

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();

  const session = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-20"),
      status: "ACTIVE",
    },
  });

  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });

  const s = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      admissionNo: "2026/0001",
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  student = { id: s.id, admissionNo: s.admissionNo };

  await db.studentEnrollment.create({
    data: {
      studentId: s.id,
      branchId: home.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm.id,
      status: "ACTIVE",
    },
  });

  authorUser = await createUser({ superAdmin: true });

  // Configure minPoolSize to 5 school-wide so 6 practice items satisfy the minimum pool requirement
  await db.settingValue.create({
    data: {
      scope: "GLOBAL",
      key: "bank.practice.minPoolSize",
      value: 5,
      status: "APPROVED",
    },
  });

  // Seed question bank items: 6 approved items for "Biology" (meeting minPoolSize 5)
  practiceItems = [];
  for (let i = 1; i <= 6; i++) {
    const item = await db.questionBankItem.create({
      data: {
        branchId: home.id,
        bank: "ASSESSMENT",
        type: "SINGLE",
        prompt: `What is cell part ${i}?`,
        explanation: `Explanation for question ${i}.`,
        points: 1,
        topic: "Cell Structure",
        subjectLabel: "Biology",
        subjectKey: "biology",
        options: [
          { id: "A", text: "Nucleus" },
          { id: "B", text: "Mitochondria" },
          { id: "C", text: "Ribosome" },
        ],
        correctAnswer: "B",
        visibility: "PRACTICE",
        status: "APPROVED",
        submittedById: authorUser.id,
        approvedById: authorUser.id,
        approvedAt: new Date(),
      },
    });
    practiceItems.push({ id: item.id, prompt: item.prompt });
  }

  // Also create a TEACHERS_ONLY item to ensure it is NEVER exposed
  await db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: "Secret Exam Question",
      explanation: "Secret Explanation",
      correctAnswer: "A",
      subjectLabel: "Biology",
      subjectKey: "biology",
      topic: "Cell Structure",
      visibility: "TEACHERS_ONLY",
      status: "APPROVED",
      submittedById: authorUser.id,
      approvedById: authorUser.id,
      approvedAt: new Date(),
    },
  });
});

test("pupil discovers practice options and starts session with scrubbed questions", async () => {
  const cookie = await portalCookie(student.admissionNo);

  // 1. Discover practice options
  const optRes = await api(`/api/v1/portal/students/${student.id}/practice/options`, { cookie });
  expect(optRes.status).toBe(200);
  expect(optRes.json.data.available).toBe(true);
  expect(optRes.json.data.dailyCap).toBe(100);
  expect(optRes.json.data.dailyCapRemaining).toBe(100);
  expect(optRes.json.data.subjects).toHaveLength(1);
  expect(optRes.json.data.subjects[0].subject).toBe("Biology");
  expect(optRes.json.data.subjects[0].count).toBe(6);

  // 2. Start practice session (EACH mode)
  const startRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions`, {
    method: "POST",
    cookie,
    body: { subjectLabel: "Biology", size: 3, feedbackMode: "EACH" },
  });
  expect(startRes.status).toBe(201);
  expect(startRes.json.data.session.size).toBe(3);
  expect(startRes.json.data.session.feedbackMode).toBe("EACH");
  expect(startRes.json.data.questions).toHaveLength(3);

  // Invariant: Scrubbed questions MUST NOT expose answer keys or explanations before answering
  const questionsJson = JSON.stringify(startRes.json.data.questions);
  expect(questionsJson).not.toContain("correctAnswer");
  expect(questionsJson).not.toContain("Explanation for question");
  expect(questionsJson).not.toContain("Secret Exam Question");
});

test("feedback mode EACH returns instant evaluation and explanation on answer submission", async () => {
  const cookie = await portalCookie(student.admissionNo);

  const startRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions`, {
    method: "POST",
    cookie,
    body: { subjectLabel: "Biology", size: 2, feedbackMode: "EACH" },
  });
  expect(startRes.status).toBe(201);
  const session = startRes.json.data.session;
  const q1 = startRes.json.data.questions[0];

  // Submit correct answer
  const ansRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions/${session.id}/answers`, {
    method: "POST",
    cookie,
    body: { bankItemId: q1.id, answer: "B" },
  });
  expect(ansRes.status).toBe(200);
  expect(ansRes.json.data.answered).toBe(true);
  expect(ansRes.json.data.correct).toBe(true);
  expect(ansRes.json.data.correctAnswer).toBe("B");
  expect(ansRes.json.data.explanation).toContain("Explanation for question");

  // Answering duplicate question in same session is refused
  const dupRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions/${session.id}/answers`, {
    method: "POST",
    cookie,
    body: { bankItemId: q1.id, answer: "B" },
  });
  expect(dupRes.status).toBe(400);
  expect(dupRes.json.error.code).toBe("ALREADY_ANSWERED");
});

test("feedback mode END defers evaluation until session conclusion", async () => {
  const cookie = await portalCookie(student.admissionNo);

  const startRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions`, {
    method: "POST",
    cookie,
    body: { subjectLabel: "Biology", size: 2, feedbackMode: "END" },
  });
  expect(startRes.status).toBe(201);
  const session = startRes.json.data.session;
  const q1 = startRes.json.data.questions[0];

  // Submit answer in END mode: answer acknowledged without leaking correct answer or explanation
  const ansRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions/${session.id}/answers`, {
    method: "POST",
    cookie,
    body: { bankItemId: q1.id, answer: "A" },
  });
  expect(ansRes.status).toBe(200);
  expect(ansRes.json.data.answered).toBe(true);
  expect(ansRes.json.data.correct).toBeUndefined();
  expect(ansRes.json.data.correctAnswer).toBeUndefined();
  expect(ansRes.json.data.explanation).toBeUndefined();

  // Conclude practice session: full review delivered
  const finishRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions/${session.id}/finish`, {
    method: "POST",
    cookie,
  });
  expect(finishRes.status).toBe(200);
  expect(finishRes.json.data.totalAttempted).toBe(1);
  expect(finishRes.json.data.totalCorrect).toBe(0);
  expect(finishRes.json.data.overallAccuracy).toBe(0);
  expect(finishRes.json.data.attempts).toHaveLength(1);
  expect(finishRes.json.data.attempts[0].correctAnswer).toBe("B");
  expect(finishRes.json.data.attempts[0].explanation).toContain("Explanation for question");
});

test("daily practice limit enforcement stops sessions when cap is reached", async () => {
  // Set bank.practice.dailyCap to 2 for this branch
  await db.settingValue.upsert({
    where: { scope_branchId_key: { scope: "BRANCH", branchId: home.id, key: "bank.practice.dailyCap" } },
    update: { value: 2, status: "APPROVED" },
    create: { scope: "BRANCH", branchId: home.id, key: "bank.practice.dailyCap", value: 2, status: "APPROVED" },
  });

  const cookie = await portalCookie(student.admissionNo);

  // Seed 2 attempts today
  const session = await db.practiceSession.create({
    data: {
      branchId: home.id,
      studentId: student.id,
      size: 2,
      itemIds: [practiceItems[0]!.id, practiceItems[1]!.id],
    },
  });
  await db.practiceAttempt.create({
    data: {
      sessionId: session.id,
      branchId: home.id,
      studentId: student.id,
      bankItemId: practiceItems[0]!.id,
      version: 1,
      answer: "B",
      correct: true,
      answeredAt: new Date(),
    },
  });
  await db.practiceAttempt.create({
    data: {
      sessionId: session.id,
      branchId: home.id,
      studentId: student.id,
      bankItemId: practiceItems[1]!.id,
      version: 1,
      answer: "B",
      correct: true,
      answeredAt: new Date(),
    },
  });

  // Check options reflect 0 daily cap remaining
  const optRes = await api(`/api/v1/portal/students/${student.id}/practice/options`, { cookie });
  expect(optRes.status).toBe(200);
  expect(optRes.json.data.dailyCapRemaining).toBe(0);

  // Attempting to start another session returns 429
  const startRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions`, {
    method: "POST",
    cookie,
    body: { subjectLabel: "Biology", size: 2 },
  });
  expect(startRes.status).toBe(429);
  expect(startRes.json.error.code).toBe("DAILY_CAP_REACHED");
});

test("guardian privacy levels: SUMMARY mode hides question text; guardians cannot take sessions", async () => {
  // Create an attempt for the student
  const session = await db.practiceSession.create({
    data: {
      branchId: home.id,
      studentId: student.id,
      subjectLabel: "Biology",
      topic: "Cell Structure",
      size: 1,
      itemIds: [practiceItems[0]!.id],
    },
  });
  await db.practiceAttempt.create({
    data: {
      sessionId: session.id,
      branchId: home.id,
      studentId: student.id,
      bankItemId: practiceItems[0]!.id,
      version: 1,
      answer: "B",
      correct: true,
    },
  });

  // Sign in as GUARDIAN using phone number
  const guardianCookie = await portalCookie(student.admissionNo, GUARDIAN_PHONE);

  // 1. Guardian cannot start a practice session (403)
  const startRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions`, {
    method: "POST",
    cookie: guardianCookie,
    body: { subjectLabel: "Biology" },
  });
  expect(startRes.status).toBe(403);
  expect(startRes.json.error.code).toBe("PORTAL_ACCESS");

  // 2. Guardian cannot submit practice answers (403)
  const ansRes = await api(`/api/v1/portal/students/${student.id}/practice/sessions/${session.id}/answers`, {
    method: "POST",
    cookie: guardianCookie,
    body: { bankItemId: practiceItems[0]!.id, answer: "B" },
  });
  expect(ansRes.status).toBe(403);
  expect(ansRes.json.error.code).toBe("PORTAL_ACCESS");

  // 3. Guardian history displays aggregated SUMMARY without prompts or pupil answers
  const histRes = await api(`/api/v1/portal/students/${student.id}/practice/history`, { cookie: guardianCookie });
  expect(histRes.status).toBe(200);
  expect(histRes.json.data.mode).toBe("SUMMARY");
  expect(histRes.json.data.summary.totalSessions).toBe(1);
  expect(histRes.json.data.summary.totalAttempted).toBe(1);
  expect(histRes.json.data.summary.totalCorrect).toBe(1);
  expect(histRes.json.data.summary.overallAccuracy).toBe(100);

  const guardianJson = JSON.stringify(histRes.json.data);
  expect(guardianJson).not.toContain("What is cell part");
  expect(guardianJson).not.toContain("Explanation for question");

  // 4. When guardian practice is configured as NONE, access is blocked (403)
  await db.settingValue.upsert({
    where: { scope_branchId_key: { scope: "BRANCH", branchId: home.id, key: "portal_access" } },
    update: { value: { guardian: { practice: "NONE" } }, status: "APPROVED" },
    create: { scope: "BRANCH", branchId: home.id, key: "portal_access", value: { guardian: { practice: "NONE" } }, status: "APPROVED" },
  });

  const blockedRes = await api(`/api/v1/portal/students/${student.id}/practice/history`, { cookie: guardianCookie });
  expect(blockedRes.status).toBe(403);
});

test("archiving practice attempt hides it from default history while preserving analytics", async () => {
  const pupilCookie = await portalCookie(student.admissionNo);

  const session = await db.practiceSession.create({
    data: {
      branchId: home.id,
      studentId: student.id,
      subjectLabel: "Biology",
      size: 1,
      itemIds: [practiceItems[0]!.id],
    },
  });
  const attempt = await db.practiceAttempt.create({
    data: {
      sessionId: session.id,
      branchId: home.id,
      studentId: student.id,
      bankItemId: practiceItems[0]!.id,
      version: 1,
      answer: "B",
      correct: true,
    },
  });

  // 1. Initial history shows attempt
  const hist1 = await api(`/api/v1/portal/students/${student.id}/practice/history`, { cookie: pupilCookie });
  expect(hist1.status).toBe(200);
  expect(hist1.json.data.sessions[0].attempts).toHaveLength(1);

  // 2. Archive attempt
  const archRes = await api(`/api/v1/portal/students/${student.id}/practice/history/${attempt.id}`, {
    method: "PATCH",
    cookie: pupilCookie,
    body: { archived: true },
  });
  expect(archRes.status).toBe(200);
  expect(archRes.json.data.archived).toBe(true);

  // 3. Default history now omits the archived attempt
  const hist2 = await api(`/api/v1/portal/students/${student.id}/practice/history`, { cookie: pupilCookie });
  expect(hist2.status).toBe(200);
  expect(hist2.json.data.sessions[0].attempts).toHaveLength(0);

  // 4. Query with ?archived=true reveals it
  const histArch = await api(`/api/v1/portal/students/${student.id}/practice/history?archived=true`, {
    cookie: pupilCookie,
  });
  expect(histArch.status).toBe(200);
  expect(histArch.json.data.sessions[0].attempts).toHaveLength(1);
  expect(histArch.json.data.sessions[0].attempts[0].id).toBe(attempt.id);
});
