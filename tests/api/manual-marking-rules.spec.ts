import "../support/env";
import { test, expect } from "@playwright/test";
import { BankQuestionType, FormKind, FormMarkingMethod, FormStatus, Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// What a teacher's marks mean (task 0032, manual marking). A mark is given to a question the teacher is meant to mark by hand: an answer the system has already marked is not the
// teacher's to change. An answer counts as CORRECT only for full marks (part marks are part marks). The total of an attempt is the sum of its answers as they are when the mark is
// written, so two teachers marking two answers of one attempt at the same moment cannot undo each other. A batch names each answer once.

let home: { id: string };
let teacher: TestUser;
let teacherCookie: string;
let pupilId: string;

type Seed = { form: string; response: string; auto: string; a: string; b: string };

/// An attempt with one question the system marked (5 points, full marks) and two the teacher marks by hand (10 points each, nothing given yet).
async function seed(): Promise<Seed> {
  const form = await db.form.create({
    data: {
      branchId: home.id,
      createdById: teacher.id,
      title: `Marking ${Math.random().toString(36).slice(2, 7)}`,
      kind: FormKind.PRACTICE_SET,
      status: FormStatus.PUBLISHED,
    },
  });
  const mk = (prompt: string, points: number, markingMethod: FormMarkingMethod, sortOrder: number) =>
    db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt,
        questionType: BankQuestionType.SHORT,
        points,
        markingMethod,
        sortOrder,
        correctAnswer: "key",
      },
    });
  const qAuto = await mk("Auto", 5, FormMarkingMethod.AUTO, 1);
  const qA = await mk("Manual A", 10, FormMarkingMethod.MANUAL, 2);
  const qB = await mk("Manual B", 10, FormMarkingMethod.MANUAL, 3);
  const response = await db.formResponse.create({
    data: {
      branchId: home.id,
      formId: form.id,
      studentId: pupilId,
      status: "COMPLETED",
      score: 5,
      maxScore: 25,
      markingStatus: "PENDING",
      submittedAt: new Date(),
    },
  });
  const ans = (formQuestionId: string, score: number, markingStatus: "NOT_REQUIRED" | "PENDING", isCorrect: boolean | null) =>
    db.formAnswer.create({
      data: { branchId: home.id, responseId: response.id, formQuestionId, value: "x", score, markingStatus, isCorrect },
    });
  const auto = await ans(qAuto.id, 5, "NOT_REQUIRED", true);
  const a = await ans(qA.id, 0, "PENDING", null);
  const b = await ans(qB.id, 0, "PENDING", null);
  return { form: form.id, response: response.id, auto: auto.id, a: a.id, b: b.id };
}

const mark = (s: Seed, body: Record<string, unknown>) =>
  api(`/api/v1/forms/${s.form}/responses/${s.response}/marking?branchId=${home.id}`, { method: "PATCH", cookie: teacherCookie, body });
const state = async (s: Seed) => {
  const response = await db.formResponse.findUniqueOrThrow({ where: { id: s.response } });
  const answers = await db.formAnswer.findMany({ where: { responseId: s.response } });
  const byId = Object.fromEntries(answers.map((x) => [x.id, x]));
  return { response, auto: byId[s.auto], a: byId[s.a], b: byId[s.b] };
};
const audits = (s: Seed) => db.formMarkingAudit.count({ where: { responseId: s.response } });

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
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
      admissionNo: "AE/2026/0301",
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2013-05-10"),
      guardianPhone: "+2348011110002",
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
  teacher = await createUser({ name: "Marker", role: Role.TEACHING_STAFF, superAdmin: false });
  const login = await loginAs(teacher);
  expect(login.status).toBe(200);
  teacherCookie = cookieHeader(login.token!);
});
test.afterAll(async () => {
  await resetDatabase();
});

test.describe("only a question meant for hand marking is marked by hand", () => {
  test("an answer the system already marked is refused, singly and in a batch, and nothing changes", async () => {
    const s = await seed();
    const single = await mark(s, { answerId: s.auto, score: 0 });
    expect(single.status, single.text.slice(0, 160)).toBe(400);
    const batch = await mark(s, {
      answers: [
        { answerId: s.a, score: 7 },
        { answerId: s.auto, score: 0 },
      ],
    });
    expect(batch.status, batch.text.slice(0, 160)).toBe(400);
    const after = await state(s);
    expect(after.auto).toMatchObject({ score: 5, isCorrect: true, markingStatus: "NOT_REQUIRED" });
    expect(after.a).toMatchObject({ score: 0, markingStatus: "PENDING" }); // the batch is all or nothing
    expect(after.response).toMatchObject({ score: 5, markingStatus: "PENDING" });
    expect(await audits(s)).toBe(0);
  });

  test("a question meant for hand marking is marked, and the total follows", async () => {
    const s = await seed();
    const res = await mark(s, { answerId: s.a, score: 7 });
    expect(res.status, res.text.slice(0, 160)).toBe(200);
    expect(res.json.data).toMatchObject({ score: 7, overallResponseScore: 12, overallResponseMarkingStatus: "PARTIALLY_MARKED" });
    const done = await mark(s, { answerId: s.b, score: 4 });
    expect(done.json.data).toMatchObject({ overallResponseScore: 16, overallResponseMarkingStatus: "MARKED" });
  });
});

test.describe("correct means full marks", () => {
  test("part marks and no marks are not correct; full marks are", async () => {
    const s = await seed();
    const part = await mark(s, { answerId: s.a, score: 4 });
    expect(part.status).toBe(200);
    expect(part.json.data.isCorrect, "4 of 10 is not correct").toBe(false);
    expect((await state(s)).a.isCorrect).toBe(false);
    const none = await mark(s, { answerId: s.b, score: 0 });
    expect(none.json.data.isCorrect).toBe(false);
    const full = await mark(s, { answerId: s.a, score: 10 }); // marking again replaces the mark
    expect(full.json.data.isCorrect, "10 of 10 is correct").toBe(true);
    const after = await state(s);
    expect(after.a).toMatchObject({ score: 10, isCorrect: true });
    expect(after.response.score, "re-marking replaces; it does not add").toBe(15);
  });

  test("in a batch, each answer is judged on its own marks", async () => {
    const s = await seed();
    const res = await mark(s, {
      answers: [
        { answerId: s.a, score: 9 },
        { answerId: s.b, score: 10 },
      ],
    });
    expect(res.status, res.text.slice(0, 160)).toBe(200);
    const after = await state(s);
    expect(after.a.isCorrect).toBe(false);
    expect(after.b.isCorrect).toBe(true);
    expect(after.response).toMatchObject({ score: 24, markingStatus: "MARKED" });
  });
});

test.describe("the total of an attempt", () => {
  test("two teachers marking two answers of one attempt at the same moment cannot undo each other", async () => {
    // run it several times: a lost update depends on timing, and the fix must hold every time
    for (let round = 0; round < 8; round++) {
      const s = await seed();
      const [one, two] = await Promise.all([mark(s, { answerId: s.a, score: 7 }), mark(s, { answerId: s.b, score: 4 })]);
      expect(one.status, `round ${round}`).toBe(200);
      expect(two.status, `round ${round}`).toBe(200);
      const after = await state(s);
      expect(after.response, `round ${round}: both marks are in the total`).toMatchObject({ score: 16, markingStatus: "MARKED" });
    }
  });

  test("a batch names each answer once", async () => {
    const s = await seed();
    const res = await mark(s, {
      answers: [
        { answerId: s.a, score: 7 },
        { answerId: s.a, score: 2 },
      ],
    });
    expect(res.status, res.text.slice(0, 160)).toBe(400);
    expect((await state(s)).a).toMatchObject({ score: 0, markingStatus: "PENDING" });
    expect(await audits(s)).toBe(0);
  });
});
