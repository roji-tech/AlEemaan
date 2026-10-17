import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

let home: { id: string; name: string };
test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  await db.quizAttempt.deleteMany();
  await db.quizQuestion.deleteMany();
  await db.quiz.deleteMany();
  await db.learningMaterial.deleteMany();
  await db.assignmentSubmission.deleteMany();
  await db.assignment.deleteMany();
  await db.subject.deleteMany();
  await db.studentRecord.deleteMany();
  await db.branch.deleteMany({ where: { id: { not: home.id } } });
});

const asRole = async (role: Role, branchId = home.id, superAdmin = false) => {
  const user = await createUser({ superAdmin });
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};

test.describe("Slice P5 — LMS & Coursework API Integration", () => {
  test("assignment lifecycle: create, list, student submit, and teacher speed-grade", async () => {
    const branchB = await db.branch.create({ data: { name: "Branch Beta" } });

    const admin = await asRole(Role.ADMIN, home.id);
    const teacher = await asRole(Role.TEACHING_STAFF, home.id);
    const studentUser = await asRole(Role.STUDENT, home.id);

    // Seed academic subject and student
    const subject = await db.subject.create({
      data: { branchId: home.id, name: "Further Mathematics", code: "FMTH" },
    });

    const student = await db.studentRecord.create({
      data: {
        id: studentUser.user.id,
        branchId: home.id,
        firstName: "Fatima",
        lastName: "Aliyu",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2010-06-15"),
        admissionNo: "ALM-2026-LMS1",
      },
    });

    // 1. Teacher creates an assignment
    const createRes = await api("/api/v1/lms/assignments", {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        title: "Differential Calculus Set 1",
        description: "Exercises on product and quotient rules.",
        instructions: "Show step by step derivations.",
        totalPoints: 50,
        status: "PUBLISHED",
        allowLate: true,
        attachments: [{ title: "Worksheet PDF", url: "https://example.com/worksheet.pdf" }],
      },
    });

    expect(createRes.status).toBe(201);
    expect(createRes.json.data.id).toBeTruthy();
    expect(createRes.json.data.title).toBe("Differential Calculus Set 1");
    const assignmentId = createRes.json.data.id;

    // 2. List published assignments
    const listRes = await api(`/api/v1/lms/assignments?branchId=${home.id}`, {
      cookie: admin.cookie,
    });
    expect(listRes.status).toBe(200);
    const found = listRes.json.data.find((a: { id: string }) => a.id === assignmentId);
    expect(found).toBeTruthy();
    expect(found.subject.name).toBe("Further Mathematics");

    // 3. Student submits their work
    const submitRes = await api(`/api/v1/lms/assignments/${assignmentId}/submissions`, {
      method: "POST",
      cookie: studentUser.cookie,
      body: {
        branchId: home.id,
        studentId: student.id,
        content: "Here are my completed steps for problems 1 through 10.",
        attachments: [{ title: "My_Solutions.pdf", url: "https://example.com/solutions.pdf" }],
      },
    });

    expect(submitRes.status).toBe(201);
    expect(submitRes.json.data.studentId).toBe(student.id);
    expect(submitRes.json.data.status).toBe("SUBMITTED");
    const submissionId = submitRes.json.data.id;

    // 4. Teacher views submissions
    const getRes = await api(`/api/v1/lms/assignments/${assignmentId}?branchId=${home.id}`, {
      cookie: teacher.cookie,
    });
    expect(getRes.status).toBe(200);
    expect(getRes.json.data.submissions).toHaveLength(1);
    expect(getRes.json.data.submissions[0].id).toBe(submissionId);

    // 5. Teacher grades submission via Speed Grader
    const gradeRes = await api(`/api/v1/lms/assignments/${assignmentId}/submissions/${submissionId}/grade`, {
      method: "PATCH",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        score: 47.5,
        feedback: "Excellent precision on differentiation!",
        status: "GRADED",
      },
    });

    expect(gradeRes.status).toBe(200);
    expect(gradeRes.json.data.score).toBe(47.5);
    expect(gradeRes.json.data.status).toBe("GRADED");
    expect(gradeRes.json.data.feedback).toContain("Excellent precision");

    // 6. Cross-branch isolation: Branch B cannot access Branch A's assignment
    const crossRes = await api(`/api/v1/lms/assignments/${assignmentId}?branchId=${branchB.id}`, {
      cookie: admin.cookie,
    });
    expect(crossRes.status).toBe(404);
  });

  test("course materials and interactive quizzes with automated grading", async () => {
    const teacher = await asRole(Role.TEACHING_STAFF, home.id);
    const studentUser = await asRole(Role.STUDENT, home.id);

    const subject = await db.subject.create({
      data: { branchId: home.id, name: "Physics", code: "PHY" },
    });

    const student = await db.studentRecord.create({
      data: {
        id: studentUser.user.id,
        branchId: home.id,
        firstName: "Ibrahim",
        lastName: "Musa",
        gender: Gender.MALE,
        dateOfBirth: new Date("2011-03-20"),
        admissionNo: "ALM-2026-LMS2",
      },
    });

    // 1. Teacher uploads course material
    const matRes = await api("/api/v1/lms/materials", {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        title: "Thermodynamics Lecture Notes",
        description: "First and second laws of thermodynamics.",
        content: "# Laws of Heat and Work\n...",
        attachments: [{ title: "Physics Reference Sheet", url: "https://example.com/phys.pdf" }],
      },
    });
    expect(matRes.status).toBe(201);
    expect(matRes.json.data.id).toBeTruthy();

    // 2. Student lists materials
    const matListRes = await api(`/api/v1/lms/materials?branchId=${home.id}`, {
      cookie: studentUser.cookie,
    });
    expect(matListRes.status).toBe(200);
    expect(matListRes.json.data.length).toBeGreaterThan(0);

    // 3. Teacher creates a timed quiz
    const quizRes = await api("/api/v1/lms/quizzes", {
      method: "POST",
      cookie: teacher.cookie,
      body: {
        branchId: home.id,
        subjectId: subject.id,
        title: "Thermodynamics Quiz 1",
        instructions: "15 minutes. Attempt all questions.",
        timeLimitMinutes: 15,
        passingScore: 60,
        status: "PUBLISHED",
        questions: [
          {
            prompt: "What is the SI unit of heat energy?",
            questionType: "MULTIPLE_CHOICE",
            options: [
              { id: "A", text: "Watt" },
              { id: "B", text: "Joule" },
              { id: "C", text: "Newton" },
            ],
            correctAnswer: "B",
            points: 2,
          },
          {
            prompt: "Energy can be created from nothing.",
            questionType: "TRUE_FALSE",
            correctAnswer: "false",
            points: 1,
          },
        ],
      },
    });

    expect(quizRes.status).toBe(201);
    expect(quizRes.json.data.id).toBeTruthy();
    expect(quizRes.json.data.questions).toHaveLength(2);
    const quizId = quizRes.json.data.id;
    const q1Id = quizRes.json.data.questions[0].id;
    const q2Id = quizRes.json.data.questions[1].id;

    // 4. Student attempts quiz with automated grading
    const attemptRes = await api(`/api/v1/lms/quizzes/${quizId}/attempt`, {
      method: "POST",
      cookie: studentUser.cookie,
      body: {
        branchId: home.id,
        studentId: student.id,
        answers: [
          { questionId: q1Id, answer: "B" },
          { questionId: q2Id, answer: "false" },
        ],
      },
    });

    expect(attemptRes.status).toBe(201);
    expect(attemptRes.json.data.score).toBe(100);
    expect(attemptRes.json.data.isPassed).toBe(true);
  });
});
