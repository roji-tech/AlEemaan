import "../support/env";
import { test, expect } from "@playwright/test";
import { BankQuestionType, FormKind, FormMarkingMethod, FormStatus, Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs, type ApiResponse } from "../support/http";

// Who may reach a form BY ITS ID inside a branch (task 0032, manual marking and form authority). Every staff route that names a form is run as seven people against a form
// of this branch written by one of its teachers, and the answer must follow one rule:
//   - VIEW (the form and its settings, without the answer key): any member of staff of the branch;
//   - READ (results, answers, turn-ins, marking queues, analytics) and MANAGE (edit, close, mark, record turn-ins, sync the roll, print WITH the answer key): the form's own
//     creator, an administrator of the branch and a superadmin. A colleague of the same branch and non-teaching staff do not.
//   - A person of ANOTHER branch reaches nothing, and is answered as if the form did not exist (404).
// The answer key (the correct answers and the explanations) is for those who MANAGE the form; a blank copy (printed without the key) is open to any teaching member of
// staff who may view the form. The key is a distinctive string, and the tests look for it in the raw bytes of the answer.

const KEY = "Zanzibar-key-authority";
const EXPLAIN = "Explained-by-Zanzibar-authority";
const PROMPT = "Which island grows cloves, in this branch?";

type Who = "superAdmin" | "branchAdmin" | "creator" | "colleague" | "clerk" | "teacherB" | "adminB";
const WHO: Who[] = ["superAdmin", "branchAdmin", "creator", "colleague", "clerk", "teacherB", "adminB"];

let home: { id: string };
let other: { id: string };
const users = {} as Record<Who, TestUser>;
const cookie = {} as Record<Who, string>;
let pupilId: string;
const f = {} as { practice: string; response: string; answer: string; questionnaire: string; paper: string };

const ALLOWED = {
  view: ["superAdmin", "branchAdmin", "creator", "colleague", "clerk"],
  read: ["superAdmin", "branchAdmin", "creator"],
  manage: ["superAdmin", "branchAdmin", "creator"],
} as const satisfies Record<string, readonly Who[]>;

async function signIn(who: Who, user: TestUser) {
  users[who] = user;
  const res = await loginAs(user);
  expect(res.status, who).toBe(200);
  cookie[who] = cookieHeader(res.token!);
}

/// A practice set of this branch written by `creator`, with a manual question that has an answer key, one finished attempt and its pending answer.
async function seedPractice(): Promise<{ id: string; response: string; answer: string }> {
  const form = await db.form.create({
    data: {
      branchId: home.id,
      createdById: users.creator.id,
      title: "Key test",
      kind: FormKind.PRACTICE_SET,
      status: FormStatus.PUBLISHED,
    },
  });
  const question = await db.formQuestion.create({
    data: {
      branchId: home.id,
      formId: form.id,
      prompt: PROMPT,
      questionType: BankQuestionType.SHORT,
      points: 10,
      markingMethod: FormMarkingMethod.MANUAL,
      correctAnswer: KEY,
      explanation: EXPLAIN,
    },
  });
  const response = await db.formResponse.create({
    data: {
      branchId: home.id,
      formId: form.id,
      studentId: pupilId,
      status: "COMPLETED",
      score: 0,
      maxScore: 10,
      markingStatus: "PENDING",
      submittedAt: new Date(),
    },
  });
  const answer = await db.formAnswer.create({
    data: { branchId: home.id, responseId: response.id, formQuestionId: question.id, value: "Unguja", score: 0, markingStatus: "PENDING" },
  });
  return { id: form.id, response: response.id, answer: answer.id };
}

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });

  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });
  const pupil = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Bello",
      admissionNo: "AE/2026/0201",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      guardianPhone: "+2348011110001",
    },
  });
  await db.studentEnrollment.create({
    data: {
      branchId: home.id,
      studentId: pupil.id,
      sessionId: session.id,
      className: "JSS 1",
      arm: "Gold",
      classArmId: arm.id,
      status: "ACTIVE",
    },
  });
  pupilId = pupil.id;

  await signIn("superAdmin", await createUser({ name: "Super Admin", role: Role.ADMIN, superAdmin: true }));
  await signIn("branchAdmin", await createUser({ name: "Branch Admin", role: Role.ADMIN, superAdmin: false }));
  await signIn("creator", await createUser({ name: "Creator", role: Role.TEACHING_STAFF, superAdmin: false }));
  await signIn("colleague", await createUser({ name: "Colleague", role: Role.TEACHING_STAFF, superAdmin: false }));
  await signIn("clerk", await createUser({ name: "Clerk", role: Role.NON_TEACHING_STAFF, superAdmin: false }));
  const teacherB = await createUser({ name: "Teacher B", superAdmin: false });
  await db.membership.create({ data: { userId: teacherB.id, branchId: other.id, role: Role.TEACHING_STAFF } });
  await signIn("teacherB", teacherB);
  const adminB = await createUser({ name: "Admin B", superAdmin: false });
  await db.membership.create({ data: { userId: adminB.id, branchId: other.id, role: Role.ADMIN } });
  await signIn("adminB", adminB);

  const practice = await seedPractice();
  f.practice = practice.id;
  f.response = practice.response;
  f.answer = practice.answer;

  const questionnaire = await db.form.create({
    data: { branchId: home.id, createdById: users.creator.id, title: "Survey", kind: FormKind.QUESTIONNAIRE, status: FormStatus.PUBLISHED },
  });
  const q = await db.formQuestion.create({
    data: { branchId: home.id, formId: questionnaire.id, prompt: "How was the term?", questionType: BankQuestionType.SHORT, points: 1 },
  });
  const r = await db.formResponse.create({
    data: {
      branchId: home.id,
      formId: questionnaire.id,
      studentId: pupilId,
      status: "COMPLETED",
      score: 0,
      maxScore: 0,
      markingStatus: "NOT_REQUIRED",
      submittedAt: new Date(),
    },
  });
  await db.formAnswer.create({
    data: { branchId: home.id, responseId: r.id, formQuestionId: q.id, value: "Good", score: 0, markingStatus: "NOT_REQUIRED" },
  });
  f.questionnaire = questionnaire.id;

  const paper = await db.form.create({
    data: {
      branchId: home.id,
      createdById: users.creator.id,
      title: "Holiday work",
      kind: FormKind.PAPER_WORK,
      status: FormStatus.PUBLISHED,
    },
  });
  await db.formAudience.create({ data: { branchId: home.id, formId: paper.id, kind: "MEMBERS", classGroupIds: [group.id] } });
  await db.formTurnIn.create({ data: { branchId: home.id, formId: paper.id, studentId: pupilId, status: "PENDING" } });
  f.paper = paper.id;
});
test.afterAll(async () => {
  await resetDatabase();
});

const qs = `branchId=`;
type Case = {
  name: string;
  access: "view" | "read" | "manage";
  call: (who: Who) => Promise<ApiResponse>;
  fresh?: boolean;
  branchInBody?: boolean;
};

const CASES: Case[] = [
  { name: "GET forms/[id]", access: "view", call: (w) => api(`/api/v1/forms/${f.practice}?${qs}${home.id}`, { cookie: cookie[w] }) },
  {
    name: "PATCH forms/[id]",
    access: "manage",
    call: (w) =>
      api(`/api/v1/forms/${f.practice}?${qs}${home.id}`, { method: "PATCH", cookie: cookie[w], body: { title: "Renamed by a test" } }),
  },
  {
    name: "POST forms/[id]/close",
    access: "manage",
    fresh: true,
    call: async (w) => {
      const fresh = await seedPractice();
      return api(`/api/v1/forms/${fresh.id}/close?${qs}${home.id}`, { method: "POST", cookie: cookie[w], body: {} });
    },
  },
  {
    name: "POST forms/[id]/print (with the answer key)",
    access: "manage",
    branchInBody: true,
    call: (w) =>
      api(`/api/v1/forms/${f.practice}/print`, { method: "POST", cookie: cookie[w], body: { branchId: home.id, includeAnswerKey: true } }),
  },
  {
    name: "GET forms/[id]/analytics",
    access: "read",
    call: (w) => api(`/api/v1/forms/${f.questionnaire}/analytics?${qs}${home.id}`, { cookie: cookie[w] }),
  },
  {
    name: "GET forms/[id]/responses",
    access: "read",
    call: (w) => api(`/api/v1/forms/${f.practice}/responses?${qs}${home.id}`, { cookie: cookie[w] }),
  },
  {
    name: "GET forms/[id]/marking-queue",
    access: "read",
    call: (w) => api(`/api/v1/forms/${f.practice}/marking-queue?${qs}${home.id}`, { cookie: cookie[w] }),
  },
  {
    name: "GET forms/[id]/responses/[responseId]/marking",
    access: "read",
    call: (w) => api(`/api/v1/forms/${f.practice}/responses/${f.response}/marking?${qs}${home.id}`, { cookie: cookie[w] }),
  },
  {
    name: "PATCH forms/[id]/responses/[responseId]/marking",
    access: "manage",
    call: (w) =>
      api(`/api/v1/forms/${f.practice}/responses/${f.response}/marking?${qs}${home.id}`, {
        method: "PATCH",
        cookie: cookie[w],
        body: { answerId: f.answer, score: 3 },
      }),
  },
  {
    name: "GET forms/[id]/turn-ins",
    access: "read",
    call: (w) => api(`/api/v1/forms/${f.paper}/turn-ins?${qs}${home.id}`, { cookie: cookie[w] }),
  },
  {
    name: "PATCH forms/[id]/turn-ins (one)",
    access: "manage",
    call: (w) =>
      api(`/api/v1/forms/${f.paper}/turn-ins?${qs}${home.id}`, {
        method: "PATCH",
        cookie: cookie[w],
        body: { studentId: pupilId, status: "HANDED_IN" },
      }),
  },
  {
    name: "PATCH forms/[id]/turn-ins (batch)",
    access: "manage",
    call: (w) =>
      api(`/api/v1/forms/${f.paper}/turn-ins?${qs}${home.id}`, {
        method: "PATCH",
        cookie: cookie[w],
        body: { updates: [{ studentId: pupilId, status: "LATE" }] },
      }),
  },
  {
    name: "POST forms/[id]/turn-ins/sync",
    access: "manage",
    call: (w) => api(`/api/v1/forms/${f.paper}/turn-ins/sync?${qs}${home.id}`, { method: "POST", cookie: cookie[w], body: {} }),
  },
];

test.describe("one form, seven people: the authority rule for every route that names a form", () => {
  for (const c of CASES) {
    test(c.name, async () => {
      for (const who of WHO) {
        const res = await c.call(who);
        if ((ALLOWED[c.access] as readonly Who[]).includes(who)) {
          expect(res.status, `${who} should get through: ${res.text.slice(0, 160)}`).toBeLessThan(300);
        } else {
          // non-teaching staff are refused at the gate of a route that WRITES (403); every other refusal is answered as if the form did not exist
          const otherBranch = who === "teacherB" || who === "adminB";
          const expected = (who === "clerk" && c.access === "manage") || (otherBranch && c.branchInBody) ? 403 : 404;
          expect(res.status, `${who} should be refused with ${expected}: ${res.text.slice(0, 160)}`).toBe(expected);
        }
      }
    });
  }

  test("a response of ANOTHER form is not reached through the form named in the URL", async () => {
    const wrong = await api(`/api/v1/forms/${f.questionnaire}/responses/${f.response}/marking?${qs}${home.id}`, { cookie: cookie.creator });
    expect(wrong.status).toBe(404);
  });
});

test.describe("the marking queue lists only the answers of forms a person may read", () => {
  test("GET forms/marking-queue", async () => {
    // the cases above mark this answer for good: put it back in the queue
    await db.formResponse.update({ where: { id: f.response }, data: { markingStatus: "PENDING", score: 0 } });
    await db.formAnswer.update({ where: { id: f.answer }, data: { markingStatus: "PENDING", score: 0 } });
    const ids = async (who: Who) =>
      ((await api(`/api/v1/forms/marking-queue?${qs}${home.id}`, { cookie: cookie[who] })).json?.data?.responses ?? []).map(
        (r: { responseId: string }) => r.responseId,
      );
    expect(await ids("creator")).toContain(f.response);
    expect(await ids("branchAdmin")).toContain(f.response);
    expect(await ids("superAdmin")).toContain(f.response);
    expect(await ids("colleague")).not.toContain(f.response);
    expect(await ids("clerk")).not.toContain(f.response);
  });
});

test.describe("the answer key", () => {
  test("GET forms/[id]: the key only for those who manage the form", async () => {
    for (const who of ALLOWED.view) {
      const res = await api(`/api/v1/forms/${f.practice}?${qs}${home.id}`, { cookie: cookie[who] });
      expect(res.status, who).toBe(200);
      const question = res.json.data.form.questions[0];
      expect(question.prompt, `${who} still sees the question`).toBe(PROMPT);
      if ((ALLOWED.manage as readonly Who[]).includes(who)) {
        expect(question.correctAnswer, who).toBe(KEY);
        expect(question.explanation, who).toBe(EXPLAIN);
      } else {
        expect(res.text.includes(KEY) || res.text.includes(EXPLAIN), `${who} must not get the key anywhere in the answer`).toBe(false);
      }
    }
  });
});

test.describe("printing a form", () => {
  const print = (who: Who, includeAnswerKey?: boolean) =>
    api(`/api/v1/forms/${f.practice}/print`, { method: "POST", cookie: cookie[who], body: { branchId: home.id, includeAnswerKey } });
  const isPdf = (res: ApiResponse) =>
    res.status === 200 && res.headers.get("content-type") === "application/pdf" && res.bytes.subarray(0, 4).toString() === "%PDF";
  const text = (res: ApiResponse) => res.bytes.toString("latin1");
  const logs = () => db.questionBankPrintLog.count({ where: { branchId: home.id } });

  test("a blank copy is for any teaching member of staff who may view the form; a copy with the key is the managers'", async () => {
    const before = await logs();
    const blank = await print("colleague", false);
    expect(isPdf(blank), `a colleague's blank copy: ${blank.status} ${blank.text.slice(0, 100)}`).toBe(true);
    expect(text(blank)).toContain(PROMPT);
    expect(text(blank)).not.toContain(KEY);
    expect(await logs()).toBe(before + 1);
    const omitted = await print("colleague", undefined);
    expect(isPdf(omitted)).toBe(true);
    expect(text(omitted)).not.toContain(KEY);
    const keyed = await print("colleague", true);
    expect(keyed.status, "the key is the managers'").toBe(404);
    expect(await logs(), "a refusal logs nothing").toBe(before + 2);
    for (const who of ["creator", "branchAdmin", "superAdmin"] as const) {
      const withKey = await print(who, true);
      expect(isPdf(withKey), who).toBe(true);
      expect(text(withKey), `${who}'s copy with the key`).toContain(KEY);
    }
  });

  test("non-teaching staff and a person of another branch are turned away, even for a blank copy", async () => {
    expect((await print("clerk", false)).status).toBe(403);
    expect((await print("clerk", true)).status).toBe(403);
    // this route names the branch in its BODY, which the gate answers with a 403 (a branch in a body is not secret) where a query would be a 404
    expect((await print("teacherB", false)).status).toBe(403);
    expect((await print("adminB", true)).status).toBe(403);
  });
});
