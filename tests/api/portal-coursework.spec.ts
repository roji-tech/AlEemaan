import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A pupil hands in coursework and takes quizzes through the PORTAL (a pupil record is not linked to a staff-style login). The portal session fixes which pupils a
// caller may act for; the class and branch come from the pupil's enrolment. Also the read side for STUDENT/PARENT staff-style memberships: published work only, no
// answer key, no classmates' submissions.

let home: { id: string };
let ids: { s1: string; s2: string; assignment: string; draft: string; quiz: string; q1: string; q2: string };

const portalCookie = async (admissionNo: string, phone: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret: phone } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });
  const mk = (admissionNo: string, firstName: string, phone: string) =>
    db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName,
        lastName: "Pupil",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2013-05-10"),
        admissionNo,
        guardianPhone: phone,
      },
    });
  const s1 = await mk("2026/0001", "Amina", "+2348011110001");
  const s2 = await mk("2026/0002", "Binta", "+2348011110002");
  for (const s of [s1, s2]) {
    await db.studentEnrollment.create({
      data: { studentId: s.id, branchId: home.id, sessionId: session.id, className: "JSS 1", arm: "Gold", classArmId: arm.id, status: "ACTIVE" },
    });
  }
  const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
  const assignment = await db.assignment.create({
    data: { branchId: home.id, subjectId: subject.id, title: "Essay", status: "PUBLISHED", dueDate: new Date(Date.now() + 864e5) },
  });
  const draft = await db.assignment.create({ data: { branchId: home.id, subjectId: subject.id, title: "Not ready", status: "DRAFT" } });
  const quiz = await db.quiz.create({
    data: { branchId: home.id, subjectId: subject.id, title: "Week 1", status: "PUBLISHED", passingScore: 50 },
  });
  const q1 = await db.quizQuestion.create({
    data: {
      branchId: home.id,
      quizId: quiz.id,
      prompt: "2+2?",
      questionType: "MULTIPLE_CHOICE",
      options: [
        { id: "A", text: "3" },
        { id: "B", text: "4" },
      ],
      correctAnswer: "B",
      points: 1,
    },
  });
  const q2 = await db.quizQuestion.create({
    data: { branchId: home.id, quizId: quiz.id, prompt: "Sky is green", questionType: "TRUE_FALSE", correctAnswer: "false", points: 1, sortOrder: 1 },
  });
  ids = { s1: s1.id, s2: s2.id, assignment: assignment.id, draft: draft.id, quiz: quiz.id, q1: q1.id, q2: q2.id };
});

test("a pupil hands in work and takes a quiz through the portal; the answer key never reaches the browser", async () => {
  const cookie = await portalCookie("2026/0001", "08011110001");

  const lms = await api(`/api/v1/portal/students/${ids.s1}/lms`, { cookie });
  expect(lms.status).toBe(200);
  expect(lms.json.data.assignments.map((a: { title: string }) => a.title)).toEqual(["Essay"]);
  expect(lms.json.data.quizzes).toHaveLength(1);
  expect(JSON.stringify(lms.json.data.quizzes)).not.toContain("correctAnswer");

  const hand = await api(`/api/v1/portal/students/${ids.s1}/assignments/${ids.assignment}/submission`, {
    method: "POST",
    cookie,
    body: { content: "My essay", attachments: [] },
  });
  expect(hand.status).toBe(201);
  expect(await db.assignmentSubmission.count({ where: { studentId: ids.s1, assignmentId: ids.assignment } })).toBe(1);

  const attempt = await api(`/api/v1/portal/students/${ids.s1}/quizzes/${ids.quiz}/attempt`, {
    method: "POST",
    cookie,
    body: { answers: [{ questionId: ids.q1, answer: "B" }, { questionId: ids.q2, answer: "true" }] },
  });
  expect(attempt.status).toBe(201);
  expect(attempt.json.data.score).toBe(50);
  expect(attempt.json.data.isPassed).toBe(true);
});

test("a portal session acts only for its own pupils, and only on published, targeted work", async () => {
  const cookie = await portalCookie("2026/0001", "08011110001");
  const url = (student: string, assignment: string) => `/api/v1/portal/students/${student}/assignments/${assignment}/submission`;

  // A classmate (not linked to this guardian) and a draft are refused.
  expect((await api(url(ids.s2, ids.assignment), { method: "POST", cookie, body: { content: "x", attachments: [] } })).status).toBe(403);
  expect((await api(url(ids.s1, ids.draft), { method: "POST", cookie, body: { content: "x", attachments: [] } })).status).toBe(404);
  expect((await api(`/api/v1/portal/students/${ids.s2}/quizzes/${ids.quiz}/attempt`, { method: "POST", cookie, body: { answers: [] } })).status).toBe(403);
  // No session at all.
  expect((await api(url(ids.s1, ids.assignment), { method: "POST", body: { content: "x", attachments: [] } })).status).toBe(401);
  expect(await db.assignmentSubmission.count()).toBe(0);

  // Marked work can no longer be changed from the portal.
  await db.assignmentSubmission.create({ data: { branchId: home.id, assignmentId: ids.assignment, studentId: ids.s1, content: "done", status: "GRADED", score: 80 } });
  expect((await api(url(ids.s1, ids.assignment), { method: "POST", cookie, body: { content: "again", attachments: [] } })).status).toBe(400);
});

test("a STUDENT or PARENT membership reads published coursework only, without the answer key or classmates' work", async () => {
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.STUDENT } });
  const cookie = cookieHeader((await loginAs(user)).token!);
  await db.assignmentSubmission.create({ data: { branchId: home.id, assignmentId: ids.assignment, studentId: ids.s2, content: "classmate", status: "SUBMITTED" } });

  const list = await api(`/api/v1/lms/assignments?branchId=${home.id}`, { cookie });
  expect(list.json.data.map((a: { title: string }) => a.title)).toEqual(["Essay"]);
  const one = await api(`/api/v1/lms/assignments/${ids.assignment}?branchId=${home.id}`, { cookie });
  expect(one.json.data.submissions).toEqual([]);
  expect((await api(`/api/v1/lms/assignments/${ids.draft}?branchId=${home.id}`, { cookie })).status).toBe(404);

  const quiz = await api(`/api/v1/lms/quizzes/${ids.quiz}?branchId=${home.id}`, { cookie });
  expect(JSON.stringify(quiz.json.data)).not.toContain("correctAnswer");
  const quizzes = await api(`/api/v1/lms/quizzes?branchId=${home.id}`, { cookie });
  expect(JSON.stringify(quizzes.json.data)).not.toContain("correctAnswer");
});
