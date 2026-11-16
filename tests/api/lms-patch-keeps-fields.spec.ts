import "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { createUser, db, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A PATCH changes the fields it sends and nothing else (task 0066). The update schemas were the create schemas made partial, and Zod 4 applies the defaults of a
// partial field: `PATCH { title }` was read as `{ title, status: "DRAFT", totalPoints: 100, allowLate: true, attachments: [] }`.

let home: { id: string; name: string };
test.beforeAll(async () => {
  home = await seedInstance();
});

test.beforeEach(async () => {
  await db.quizQuestion.deleteMany();
  await db.quiz.deleteMany();
  await db.assignment.deleteMany();
  await db.learningMaterial.deleteMany();
  await db.subject.deleteMany();
});

const asTeacher = async () => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.TEACHING_STAFF } });
  return cookieHeader((await loginAs(user)).token!);
};

const LINK = [{ title: "Sheet", url: "https://school.example/sheet.pdf" }];

test("an assignment: sending only a new title keeps the status, points, late rule and link", async () => {
  const cookie = await asTeacher();
  const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
  const row = await db.assignment.create({
    data: {
      branchId: home.id,
      subjectId: subject.id,
      title: "Essay",
      status: "PUBLISHED",
      totalPoints: 40,
      allowLate: false,
      attachments: LINK,
    },
  });
  const res = await api(`/api/v1/lms/assignments/${row.id}`, {
    method: "PATCH",
    cookie,
    body: { branchId: home.id, title: "Essay on honesty" },
  });
  expect(res.status).toBe(200);
  const after = await db.assignment.findUniqueOrThrow({ where: { id: row.id } });
  expect(after.title).toBe("Essay on honesty");
  expect(after.status).toBe("PUBLISHED");
  expect(after.totalPoints).toBe(40);
  expect(after.allowLate).toBe(false);
  expect(after.attachments).toEqual(LINK);
});

test("a study material: sending only a new title keeps the link", async () => {
  const cookie = await asTeacher();
  const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
  const row = await db.learningMaterial.create({
    data: { branchId: home.id, subjectId: subject.id, title: "Reading notes", attachments: LINK },
  });
  const res = await api(`/api/v1/lms/materials/${row.id}`, {
    method: "PATCH",
    cookie,
    body: { branchId: home.id, title: "Reading notes, week 2" },
  });
  expect(res.status).toBe(200);
  const after = await db.learningMaterial.findUniqueOrThrow({ where: { id: row.id } });
  expect(after.title).toBe("Reading notes, week 2");
  expect(after.attachments).toEqual(LINK);
});

test("a quiz: sending only a new title keeps it published and keeps the exam-template flag", async () => {
  const cookie = await asTeacher();
  const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
  const row = await db.quiz.create({
    // a template whose window has ended is visible to any teacher of the branch (until then only its creator sees it)
    data: {
      branchId: home.id,
      subjectId: subject.id,
      title: "Week 1",
      status: "PUBLISHED",
      isExamTemplate: true,
      examWindowEnd: new Date(Date.now() - 864e5),
      passingScore: 60,
    },
  });
  const res = await api(`/api/v1/lms/quizzes/${row.id}?branchId=${home.id}`, { method: "PATCH", cookie, body: { title: "Week 1 quiz" } });
  expect(res.status).toBe(200);
  const after = await db.quiz.findUniqueOrThrow({ where: { id: row.id } });
  expect(after.title).toBe("Week 1 quiz");
  expect(after.status).toBe("PUBLISHED");
  expect(after.isExamTemplate).toBe(true);
  expect(after.passingScore).toBe(60);
});
