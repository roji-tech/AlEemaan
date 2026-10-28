import "../support/env";
import { test, expect } from "@playwright/test";
import { PrintTargetKind, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Printing must follow the same rules as reading. A question the person may not see in the bank is "not found" to them when they ask to print it, so a print is never a
// way round the bank's visibility. (The print route itself is for administrators and teaching staff; non-teaching staff are refused by the gate before any of this.)

let home: { id: string };
let author: TestUser;
let teacher: TestUser;
let teacherCookie: string;
let admin: TestUser;
let adminCookie: string;

const cookieFor = async (user: TestUser) => {
  const login = await loginAs(user);
  expect(login.status).toBe(200);
  return cookieHeader(login.token!);
};

const item = (over: Record<string, unknown>) =>
  db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: "Which gas do plants take in for photosynthesis?",
      explanation: "Carbon dioxide.",
      points: 1,
      subjectLabel: "Agricultural Science",
      subjectKey: "agricultural science",
      options: [
        { id: "A", text: "Oxygen" },
        { id: "B", text: "Carbon dioxide" },
      ],
      correctAnswer: "B",
      visibility: "TEACHERS_ONLY",
      status: "APPROVED",
      submittedById: author.id,
      approvedById: author.id,
      approvedAt: new Date(),
      ...over,
    },
  });

const print = (cookie: string, targetId: string, over: Record<string, unknown> = {}) =>
  api("/api/v1/question-bank/print", {
    method: "POST",
    cookie,
    body: { branchId: home.id, targetKind: PrintTargetKind.QUESTION_BANK_ITEM, targetId, format: "json", ...over },
  });

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  author = await createUser({ name: "Author Teacher", role: Role.TEACHING_STAFF });
  teacher = await createUser({ name: "Other Teacher", role: Role.TEACHING_STAFF });
  admin = await createUser({ name: "Branch Admin", role: Role.ADMIN });
  teacherCookie = await cookieFor(teacher);
  adminCookie = await cookieFor(admin);
});

test("a draft or pending question is not found when someone else asks to print it", async () => {
  for (const status of ["DRAFT", "PENDING", "REJECTED"] as const) {
    const q = await item({ status, visibility: "PRACTICE" });
    const res = await print(teacherCookie, q.id, { includeAnswerKey: true });
    expect(res.status, status).toBe(404);
    expect(JSON.stringify(res.json), status).not.toContain("Carbon dioxide");
    expect(await db.questionBankPrintLog.count({ where: { targetId: q.id } }), status).toBe(0);
  }
});

test("a secret question of a subject the teacher does not teach is not found", async () => {
  const q = await item({});
  const res = await print(teacherCookie, q.id, { includeAnswerKey: true });
  expect(res.status).toBe(404);
  expect(await db.questionBankPrintLog.count({ where: { targetId: q.id } })).toBe(0);
});

test("the branch administrator can print a secret question", async () => {
  const q = await item({});
  const res = await print(adminCookie, q.id, { includeAnswerKey: true });
  expect(res.status).toBe(200);
});

test("the author can print their own draft", async () => {
  const q = await item({ status: "DRAFT" });
  const res = await print(await cookieFor(author), q.id);
  expect(res.status).toBe(200);
});

test("an approved practice question can be printed by a teacher, with or without its key", async () => {
  const q = await item({ visibility: "PRACTICE" });
  expect((await print(teacherCookie, q.id)).status).toBe(200);
  expect((await print(teacherCookie, q.id, { includeAnswerKey: true })).status).toBe(200);
});

test("a question of another branch is not found", async () => {
  const other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } } });
  const q = await item({ branchId: other.id, visibility: "PRACTICE" });
  expect((await print(teacherCookie, q.id)).status).toBe(404);
});
