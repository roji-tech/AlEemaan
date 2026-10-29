import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, BankQuestionType, BankVisibility, QuestionType } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0032 Slice 3: Assessments integration with Question Bank.
// Covers:
// 1. Copy-on-use: deep copies content and sets sourceItemId, sourceVersion, exposedToPractice.
// 2. Exam secrecy: templates hidden from other teachers during window, visible to creator/superadmin, and visible after window ends.
// 3. Offer-back: assessment question offered back as brand-new PENDING bank item without overwriting.

let home: { id: string; name: string };
let teacherA: { user: TestUser; cookie: string };
let teacherB: { user: TestUser; cookie: string };
let student: { user: TestUser; cookie: string };
let superAdmin: { user: TestUser; cookie: string };
let subject: { id: string };

const asRole = async (role: Role, branchId = home.id, isSuper = false) => {
  const user = await createUser({ superAdmin: isSuper });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  if (role === Role.TEACHING_STAFF || role === Role.ADMIN) {
    await db.staffRecord.create({
      data: {
        branchId,
        userId: user.id,
        category: "TEACHING",
        firstName: "Test",
        lastName: role,
      },
    });
  }
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();

  teacherA = await asRole(Role.TEACHING_STAFF, home.id);
  teacherB = await asRole(Role.TEACHING_STAFF, home.id);
  student = await asRole(Role.STUDENT, home.id);
  superAdmin = await asRole(Role.ADMIN, home.id, true);

  subject = await db.subject.create({
    data: { branchId: home.id, name: "Physics", code: "PHY" },
  });
});

test.beforeEach(async () => {
  await db.quizAttempt.deleteMany();
  await db.quizQuestion.deleteMany();
  await db.quiz.deleteMany();
  await db.questionBankAudit.deleteMany();
  await db.questionBankItemVersion.deleteMany();
  await db.questionBankItem.deleteMany();
});

test.describe("Slice 3: Question Bank & Assessments Integration API", () => {
  test("copy on use: creating a quiz with bank item copies content and preserves provenance", async () => {
    // 1. Create an approved item in the question bank
    const bankItem = await db.questionBankItem.create({
      data: {
        branchId: home.id,
        bank: "ASSESSMENT",
        status: "APPROVED",
        type: BankQuestionType.SINGLE,
        prompt: "What is the speed of light in vacuum?",
        options: [
          { id: "o1", text: "3 x 10^8 m/s" },
          { id: "o2", text: "3 x 10^6 m/s" },
        ],
        correctAnswer: "o1",
        points: 5,
        visibility: BankVisibility.PRACTICE,
        submittedById: teacherA.user.id,
        approvedById: superAdmin.user.id,
        approvedAt: new Date(),
      },
    });

    // 2. Teacher A creates a quiz referencing the bank item
    const createRes = await api("/api/v1/lms/quizzes", {
      method: "POST",
      cookie: teacherA.cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        title: "Optics Midterm",
        status: "DRAFT",
        questions: [
          {
            prompt: bankItem.prompt,
            questionType: QuestionType.MULTIPLE_CHOICE,
            options: bankItem.options as Array<{ id: string; text: string }>,
            correctAnswer: "o1",
            points: 5,
            sourceItemId: bankItem.id,
            sourceVersion: 1,
            exposedToPractice: true,
          },
        ],
      },
    });

    expect(createRes.status).toBe(201);
    const quizId = createRes.json.data.id;

    // 3. Verify the question in DB holds provenance
    const question = await db.quizQuestion.findFirst({
      where: { quizId },
    });
    expect(question).toBeDefined();
    expect(question?.sourceItemId).toBe(bankItem.id);
    expect(question?.sourceVersion).toBe(1);
    expect(question?.exposedToPractice).toBe(true);
  });

  test("exam secrecy: scheduled template is hidden from other staff during window, visible to creator/superadmin", async () => {
    const now = Date.now();
    const windowStart = new Date(now - 1000 * 60 * 60).toISOString(); // 1 hr ago
    const windowEnd = new Date(now + 1000 * 60 * 60).toISOString(); // 1 hr in future

    // Teacher A creates an active exam template
    const createRes = await api("/api/v1/lms/quizzes", {
      method: "POST",
      cookie: teacherA.cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        title: "Secret Term Exam",
        status: "PUBLISHED",
        isExamTemplate: true,
        examWindowStart: windowStart,
        examWindowEnd: windowEnd,
        questions: [
          {
            prompt: "Describe Newton's first law",
            questionType: QuestionType.SHORT_ANSWER,
            correctAnswer: "Inertia",
            points: 10,
          },
        ],
      },
    });

    expect(createRes.status).toBe(201);
    const quizId = createRes.json.data.id;

    // Creator Teacher A CAN list and fetch it
    const listA = await api(`/api/v1/lms/quizzes?branchId=${home.id}`, {
      cookie: teacherA.cookie,
    });
    expect(listA.status).toBe(200);
    const foundA = (listA.json.data as Array<{ id: string }>).some((q) => q.id === quizId);
    expect(foundA).toBe(true);

    const getA = await api(`/api/v1/lms/quizzes/${quizId}?branchId=${home.id}`, {
      cookie: teacherA.cookie,
    });
    expect(getA.status).toBe(200);

    // Other Teacher B CANNOT see it in list, and direct GET returns 404
    const listB = await api(`/api/v1/lms/quizzes?branchId=${home.id}`, {
      cookie: teacherB.cookie,
    });
    expect(listB.status).toBe(200);
    const foundB = (listB.json.data as Array<{ id: string }>).some((q) => q.id === quizId);
    expect(foundB).toBe(false);

    const getB = await api(`/api/v1/lms/quizzes/${quizId}?branchId=${home.id}`, {
      cookie: teacherB.cookie,
    });
    expect(getB.status).toBe(404);

    // SuperAdmin CAN see and fetch it
    const listSuper = await api(`/api/v1/lms/quizzes?branchId=${home.id}`, {
      cookie: superAdmin.cookie,
    });
    expect(listSuper.status).toBe(200);
    const foundSuper = (listSuper.json.data as Array<{ id: string }>).some((q) => q.id === quizId);
    expect(foundSuper).toBe(true);

    const getSuper = await api(`/api/v1/lms/quizzes/${quizId}?branchId=${home.id}`, {
      cookie: superAdmin.cookie,
    });
    expect(getSuper.status).toBe(200);

    // When the exam window ends (updated to past), other teachers CAN see it
    await db.quiz.update({
      where: { id: quizId },
      data: {
        examWindowEnd: new Date(now - 1000).toISOString(),
      },
    });

    const listBAfter = await api(`/api/v1/lms/quizzes?branchId=${home.id}`, {
      cookie: teacherB.cookie,
    });
    expect(listBAfter.status).toBe(200);
    const foundBAfter = (listBAfter.json.data as Array<{ id: string }>).some((q) => q.id === quizId);
    expect(foundBAfter).toBe(true);

    const getBAfter = await api(`/api/v1/lms/quizzes/${quizId}?branchId=${home.id}`, {
      cookie: teacherB.cookie,
    });
    expect(getBAfter.status).toBe(200);
  });

  test("offer back: teacher offers an assessment question back to the bank as a new item", async () => {
    // 1. Create a quiz with a question
    const createRes = await api("/api/v1/lms/quizzes", {
      method: "POST",
      cookie: teacherA.cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        title: "Thermodynamics Quiz",
        status: "DRAFT",
        questions: [
          {
            prompt: "What is absolute zero in Celsius?",
            questionType: QuestionType.SHORT_ANSWER,
            correctAnswer: "-273.15",
            points: 2,
          },
        ],
      },
    });
    expect(createRes.status).toBe(201);
    const quizId = createRes.json.data.id;

    const quizQuestion = await db.quizQuestion.findFirstOrThrow({
      where: { quizId },
    });

    // 2. Student attempt to offer back should be rejected with 403
    const studentRes = await api("/api/v1/question-bank/items/offer-back", {
      method: "POST",
      cookie: student.cookie,
      body: {
        branchId: home.id,
        quizId,
        quizQuestionId: quizQuestion.id,
        subjectLabel: "Physics",
        topic: "Thermodynamics",
        difficulty: 3,
      },
    });
    expect(studentRes.status).toBe(403);

    // 3. Teacher A offers it back to the question bank
    const offerRes = await api("/api/v1/question-bank/items/offer-back", {
      method: "POST",
      cookie: teacherA.cookie,
      body: {
        branchId: home.id,
        quizId,
        quizQuestionId: quizQuestion.id,
        subjectLabel: "Physics",
        topic: "Thermodynamics",
        difficulty: 3,
      },
    });

    expect(offerRes.status).toBe(201);
    const newItem = offerRes.json.data.item;
    expect(newItem).toBeDefined();
    expect(newItem.status).toBe("PENDING");
    expect(newItem.prompt).toBe("What is absolute zero in Celsius?");

    // 4. Verify original quiz question was not modified
    const originalQuestion = await db.quizQuestion.findUnique({
      where: { id: quizQuestion.id },
    });
    expect(originalQuestion?.prompt).toBe("What is absolute zero in Celsius?");
    expect(originalQuestion?.sourceItemId).toBeNull();
  });
});
