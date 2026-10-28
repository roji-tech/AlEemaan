import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, PrintTargetKind, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Four edges found by reading the code of the forms and question bank slices: the near-exam setting must obey "a branch may only narrow"; two answers to one practice
// question sent at the same moment are one answer; a pupil whose practice level is a summary gets a summary; and a pupil the school has not placed in a class sees only
// the questions that name no class.

const PUPIL_DOB = "2013-05-10";

const portalCookie = async (admissionNo: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret: PUPIL_DOB } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};
const staffCookie = async (user: TestUser) => {
  const login = await loginAs(user);
  expect(login.status).toBe(200);
  return cookieHeader(login.token!);
};

let home: { id: string };
let author: TestUser;
let student: { id: string; admissionNo: string };

const setting = (scope: "GLOBAL" | "BRANCH", key: string, value: unknown) =>
  scope === "GLOBAL"
    ? db.settingValue.create({ data: { scope, key, value: value as never, status: "APPROVED" } })
    : db.settingValue.create({ data: { scope, branchId: home.id, key, value: value as never, status: "APPROVED" } });

const bankItem = (i: number, over: Record<string, unknown> = {}) =>
  db.questionBankItem.create({
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
      ...over,
    },
  });

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  author = await createUser({ superAdmin: true });
  const s = await db.studentRecord.create({
    data: { branchId: home.id, firstName: "Amina", lastName: "Pupil", gender: Gender.FEMALE, dateOfBirth: new Date(PUPIL_DOB), admissionNo: "2026/0001" },
  });
  student = { id: s.id, admissionNo: s.admissionNo };
  await setting("GLOBAL", "bank.practice.minPoolSize", 1);
});

test.describe("the near-exam setting obeys 'a branch may only narrow'", () => {
  const examIn = async (days: number) => {
    const subject = await db.subject.create({ data: { branchId: home.id, name: "Agricultural Science", code: "AGR101" } });
    const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
    const start = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const quiz = await db.quiz.create({
      data: {
        branchId: home.id,
        subjectId: subject.id,
        classGroupId: group.id,
        title: "Term exam",
        isExamTemplate: true,
        examWindowStart: start,
        examWindowEnd: new Date(start.getTime() + 3 * 60 * 60 * 1000),
        status: "PUBLISHED",
        createdById: null,
      },
    });
    await db.quizQuestion.create({
      data: { branchId: home.id, quizId: quiz.id, prompt: "Name a cereal.", questionType: "MULTIPLE_CHOICE", points: 1, options: ["Maize", "Yam"], correctAnswer: "Maize" },
    });
    return quiz;
  };
  const teacherPrints = async (quizId: string) => {
    const teacher = await createUser({ name: "A Teacher", role: Role.TEACHING_STAFF });
    return api("/api/v1/question-bank/print", {
      method: "POST",
      cookie: await staffCookie(teacher),
      body: { branchId: home.id, targetKind: PrintTargetKind.QUIZ, targetId: quizId, format: "json" },
    });
  };

  test("a branch value lower than the school's is ignored", async () => {
    await setting("GLOBAL", "bank.print.nearExamDays", 10);
    await setting("BRANCH", "bank.print.nearExamDays", 3); // looser than the school: must not count
    const quiz = await examIn(5); // inside the school's 10 days, outside the branch's 3
    expect((await teacherPrints(quiz.id)).status).toBe(403);
  });

  test("a branch value higher than the school's is honoured", async () => {
    await setting("GLOBAL", "bank.print.nearExamDays", 3);
    await setting("BRANCH", "bank.print.nearExamDays", 10);
    const quiz = await examIn(5);
    expect((await teacherPrints(quiz.id)).status).toBe(403);
  });

  test("a stored value that is not valid is ignored", async () => {
    await setting("GLOBAL", "bank.print.nearExamDays", "not a number");
    const quiz = await examIn(5); // the default of 7 days applies
    expect((await teacherPrints(quiz.id)).status).toBe(403);
  });
});

test("two answers to one practice question sent together are one answer", async () => {
  for (let i = 1; i <= 3; i++) await bankItem(i);
  const cookie = await portalCookie(student.admissionNo);
  const started = await api(`/api/v1/portal/students/${student.id}/practice/sessions`, { method: "POST", cookie, body: { subjectLabel: "Biology", size: 3, feedbackMode: "EACH" } });
  expect(started.status).toBe(201);
  const url = `/api/v1/portal/students/${student.id}/practice/sessions/${started.json.data.session.id}/answers`;
  const body = { bankItemId: started.json.data.questions[0].id, answer: "B" };
  const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => api(url, { method: "POST", cookie, body })));
  expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  expect(results.filter((r) => r.status === 400)).toHaveLength(5);
  expect(await db.practiceAttempt.count({ where: { studentId: student.id } })).toBe(1);
});

test("a pupil whose practice level is a summary gets a summary, not the questions", async () => {
  const item = await bankItem(1);
  const session = await db.practiceSession.create({ data: { branchId: home.id, studentId: student.id, size: 1, itemIds: [item.id], subjectLabel: "Biology" } });
  await db.practiceAttempt.create({ data: { sessionId: session.id, branchId: home.id, studentId: student.id, bankItemId: item.id, version: 1, answer: "B", correct: true } });
  await setting("BRANCH", "portal_access", { pupil: { practice: "SUMMARY" } });
  const res = await api(`/api/v1/portal/students/${student.id}/practice/history`, { cookie: await portalCookie(student.admissionNo) });
  expect(res.status).toBe(200);
  expect(res.json.data.mode).toBe("SUMMARY");
  expect(JSON.stringify(res.json.data)).not.toContain("Question 1?");
  expect(JSON.stringify(res.json.data)).not.toContain("Because 1.");
});

test("a pupil with no class sees only the questions that name no class", async () => {
  await bankItem(1); // names no class
  await bankItem(2, { classTags: { create: [{ label: "SSS 3", labelKey: "sss 3" }] } });
  await bankItem(3, { classTags: { create: [{ label: "SSS 3", labelKey: "sss 3" }] } });
  const cookie = await portalCookie(student.admissionNo);
  const opts = await api(`/api/v1/portal/students/${student.id}/practice/options`, { cookie });
  expect(opts.status).toBe(200);
  expect(opts.json.data.subjects[0].count).toBe(1);
  const started = await api(`/api/v1/portal/students/${student.id}/practice/sessions`, { method: "POST", cookie, body: { subjectLabel: "Biology", size: 3 } });
  expect(started.status).toBe(201);
  expect(started.json.data.questions).toHaveLength(1);
  expect(JSON.stringify(started.json.data.questions)).not.toContain("Question 2?");
  expect(JSON.stringify(started.json.data.questions)).not.toContain("Question 3?");
});
