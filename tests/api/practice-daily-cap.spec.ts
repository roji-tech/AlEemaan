import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api } from "../support/http";

// The daily cap is about the QUESTIONS a pupil takes on, not about the ones already answered: a session started and not yet answered has used its questions, so starting
// several sessions at once cannot take the pupil past the cap. Answering rechecks that practice is still open, because the school may close it during a session.

const PUPIL_DOB = "2013-05-10";

const portalCookie = async (admissionNo: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret: PUPIL_DOB } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let student: { id: string; admissionNo: string };
let cookie: string;

const setCap = (value: number) =>
  db.settingValue.upsert({
    where: { scope_branchId_key: { scope: "BRANCH", branchId: home.id, key: "bank.practice.dailyCap" } },
    update: { value, status: "APPROVED" },
    create: { scope: "BRANCH", branchId: home.id, key: "bank.practice.dailyCap", value, status: "APPROVED" },
  });

const start = (size: number) =>
  api(`/api/v1/portal/students/${student.id}/practice/sessions`, { method: "POST", cookie, body: { subjectLabel: "Biology", size, feedbackMode: "EACH" } });

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  const author = await createUser({ superAdmin: true });
  const s = await db.studentRecord.create({
    data: { branchId: home.id, firstName: "Amina", lastName: "Pupil", gender: Gender.FEMALE, dateOfBirth: new Date(PUPIL_DOB), admissionNo: "2026/0001" },
  });
  student = { id: s.id, admissionNo: s.admissionNo };
  await db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.practice.minPoolSize", value: 5, status: "APPROVED" } });
  for (let i = 1; i <= 8; i++) {
    await db.questionBankItem.create({
      data: {
        branchId: home.id,
        bank: "ASSESSMENT",
        type: "SINGLE",
        prompt: `Question ${i}?`,
        explanation: `Because ${i}.`,
        points: 1,
        subjectLabel: "Biology",
        subjectKey: "biology",
        options: [
          { id: "A", text: "One" },
          { id: "B", text: "Two" },
        ],
        correctAnswer: "B",
        visibility: "PRACTICE",
        status: "APPROVED",
        submittedById: author.id,
        approvedById: author.id,
        approvedAt: new Date(),
      },
    });
  }
  cookie = await portalCookie(student.admissionNo);
});

test("questions in a started session count against the cap before they are answered", async () => {
  await setCap(2);
  const first = await start(2);
  expect(first.status).toBe(201);
  const second = await start(2);
  expect(second.status).toBe(429);
  expect(second.json.error.code).toBe("DAILY_CAP_REACHED");
  expect(await db.practiceSession.count({ where: { studentId: student.id } })).toBe(1);
});

test("a second session is cut to what is left of the cap", async () => {
  await setCap(3);
  expect((await start(2)).status).toBe(201);
  const second = await start(2);
  expect(second.status).toBe(201);
  expect(second.json.data.session.size).toBe(1);
  expect((await start(1)).status).toBe(429);
});

test("starting several sessions at the same moment cannot pass the cap", async () => {
  await setCap(3);
  const results = await Promise.all([start(3), start(3), start(3), start(3)]);
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  expect(results.filter((r) => r.status === 429)).toHaveLength(3);
  const sessions = await db.practiceSession.findMany({ where: { studentId: student.id } });
  expect(sessions.reduce((sum, s) => sum + s.size, 0)).toBeLessThanOrEqual(3);
});

test("the options screen counts reserved questions", async () => {
  await setCap(5);
  expect((await start(2)).status).toBe(201);
  const opts = await api(`/api/v1/portal/students/${student.id}/practice/options`, { cookie });
  expect(opts.json.data.dailyCapRemaining).toBe(3);
});

test("finishing a session gives back the questions that were never answered", async () => {
  await setCap(3);
  const first = await start(3);
  expect(first.status).toBe(201);
  const answer = await api(`/api/v1/portal/students/${student.id}/practice/sessions/${first.json.data.session.id}/answers`, {
    method: "POST",
    cookie,
    body: { bankItemId: first.json.data.questions[0].id, answer: "B" },
  });
  expect(answer.status).toBe(200);
  expect((await api(`/api/v1/portal/students/${student.id}/practice/sessions/${first.json.data.session.id}/finish`, { method: "POST", cookie, body: {} })).status).toBe(200);
  const next = await start(3);
  expect(next.status).toBe(201);
  expect(next.json.data.session.size).toBe(2);
});

test("answering stops when the school closes practice during a session", async () => {
  const first = await start(2);
  expect(first.status).toBe(201);
  await db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.access.pupils", value: false, status: "APPROVED" } });
  const answer = await api(`/api/v1/portal/students/${student.id}/practice/sessions/${first.json.data.session.id}/answers`, {
    method: "POST",
    cookie,
    body: { bankItemId: first.json.data.questions[0].id, answer: "B" },
  });
  expect(answer.status).toBe(403);
  expect(answer.json.error.code).toBe("PRACTICE_CLOSED");
  expect(await db.practiceAttempt.count({ where: { studentId: student.id } })).toBe(0);
});
