import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api } from "../support/http";

// What a pupil may do with a practice set, in the routes the pupil uses: start an attempt and submit it.
//
//   - Start: only a pupil the set is for. Two starts at the same moment are one attempt, not two. An attempt left open past the set's time limit is not picked up again.
//   - Submit: only while the set is open (published, inside its opening and closing times) and inside its time limit, only for a practice set, once per attempt.
//
// The two races are tried several times over: they are a matter of timing, and one clean round proves nothing.

const PUPIL_1_DOB = "2013-05-10";
const PUPIL_2_DOB = "2014-06-15";
const GUARDIAN_PHONE = "+2348011110001";
const ROUNDS = 6;
const AT_ONCE = 6;

const portalCookie = async (admissionNo: string, secret: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

let home: { id: string };
let authorId: string;
let group1: { id: string };
let group2: { id: string };
let arm2Id: string;
let pupil1: { id: string; cookie: string };
let pupil2: { id: string; cookie: string };

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  authorId = (await createUser({ superAdmin: true })).id;

  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  group1 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm1 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group1.id, name: "Gold" } });
  group2 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2" } });
  const arm2 = await db.classArm.create({ data: { branchId: home.id, classGroupId: group2.id, name: "Silver" } });
  arm2Id = arm2.id;

  const enrol = async (name: string, admissionNo: string, dob: string, className: string, arm: string, classArmId: string) => {
    const s = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: name,
        lastName: "Pupil",
        gender: Gender.FEMALE,
        dateOfBirth: new Date(dob),
        admissionNo,
        guardianPhone: GUARDIAN_PHONE,
      },
    });
    await db.studentEnrollment.create({
      data: { studentId: s.id, branchId: home.id, sessionId: session.id, className, arm, classArmId, status: "ACTIVE" },
    });
    return s;
  };
  const s1 = await enrol("Zainab", "2026/0001", PUPIL_1_DOB, "JSS 1", "Gold", arm1.id);
  const s2 = await enrol("Bilal", "2026/0002", PUPIL_2_DOB, "JSS 2", "Silver", arm2.id);
  pupil1 = { id: s1.id, cookie: await portalCookie(s1.admissionNo, PUPIL_1_DOB) };
  pupil2 = { id: s2.id, cookie: await portalCookie(s2.admissionNo, PUPIL_2_DOB) };
});

/** A published practice set with two auto-marked questions (1 point and 2 points; the answers are "A" and "B"), for JSS 1 unless `forGroup` says otherwise. */
async function makeSet(
  opts: { forGroup?: string | null; maxDurationMinutes?: number | null; opensAt?: Date | null; closesAt?: Date | null } = {},
) {
  const form = await db.form.create({
    data: {
      branchId: home.id,
      kind: "PRACTICE_SET",
      title: "Practice",
      status: "PUBLISHED",
      createdById: authorId,
      maxDurationMinutes: opts.maxDurationMinutes ?? null,
      opensAt: opts.opensAt ?? null,
      closesAt: opts.closesAt ?? null,
    },
  });
  const forGroup = opts.forGroup === undefined ? group1.id : opts.forGroup;
  if (forGroup) {
    await db.formAudience.create({
      data: { branchId: home.id, formId: form.id, kind: "MEMBERS", roles: ["STUDENT"], classGroupIds: [forGroup] },
    });
  }
  const options = [
    { id: "A", text: "One" },
    { id: "B", text: "Two" },
  ];
  const q1 = await db.formQuestion.create({
    data: {
      branchId: home.id,
      formId: form.id,
      prompt: "First?",
      questionType: "SINGLE",
      options,
      correctAnswer: "A",
      points: 1,
      sortOrder: 0,
    },
  });
  const q2 = await db.formQuestion.create({
    data: {
      branchId: home.id,
      formId: form.id,
      prompt: "Second?",
      questionType: "SINGLE",
      options,
      correctAnswer: "B",
      points: 2,
      sortOrder: 1,
    },
  });
  return { formId: form.id, q1: q1.id, q2: q2.id };
}

const path = (studentId: string, formId: string, action: "start" | "submit") =>
  `/api/v1/portal/students/${studentId}/forms/practice-sets/${formId}/${action}`;
const start = (p: { id: string; cookie: string }, formId: string) => api(path(p.id, formId, "start"), { method: "POST", cookie: p.cookie });
const submit = (p: { id: string; cookie: string }, s: { formId: string; q1: string; q2: string }, responseId: string) =>
  api(path(p.id, s.formId, "submit"), {
    method: "POST",
    cookie: p.cookie,
    body: {
      responseId,
      answers: [
        { formQuestionId: s.q1, value: "A" },
        { formQuestionId: s.q2, value: "B" },
      ],
    },
  });

const attemptsOf = (formId: string) => db.formResponse.findMany({ where: { formId }, orderBy: { createdAt: "asc" } });
const answersOf = (formId: string) => db.formAnswer.count({ where: { response: { formId } } });

test.describe("starting an attempt", () => {
  test("only a pupil the set is for may start it", async () => {
    const set = await makeSet();

    const outside = await start(pupil2, set.formId);
    expect(outside.status).toBe(403);
    expect(await attemptsOf(set.formId), "nothing was written for the pupil outside the audience").toHaveLength(0);

    const inside = await start(pupil1, set.formId);
    expect(inside.status).toBe(201);
    expect(await attemptsOf(set.formId)).toHaveLength(1);
  });

  test("a set with no audience restriction can be started by any pupil", async () => {
    const set = await makeSet({ forGroup: null });
    expect((await start(pupil1, set.formId)).status).toBe(201);
    expect((await start(pupil2, set.formId)).status).toBe(201);
  });

  test("a set that is not open yet, or past its closing time, cannot be started", async () => {
    const notYet = await makeSet({ opensAt: new Date(Date.now() + 3_600_000) });
    expect((await start(pupil1, notYet.formId)).status).toBe(403);
    const over = await makeSet({ opensAt: minutesAgo(120), closesAt: minutesAgo(60) });
    expect((await start(pupil1, over.formId)).status).toBe(403);
  });

  test("an attempt inside its time limit is resumed", async () => {
    const set = await makeSet({ maxDurationMinutes: 10 });
    const first = await start(pupil1, set.formId);
    await db.formResponse.update({ where: { id: first.json.data.responseId }, data: { startedAt: minutesAgo(5) } });
    const again = await start(pupil1, set.formId);
    expect(again.status).toBe(201);
    expect(again.json.data).toMatchObject({ responseId: first.json.data.responseId, isResume: true });
  });

  test("an attempt left open past its time limit is abandoned and a fresh one is opened", async () => {
    const set = await makeSet({ maxDurationMinutes: 10 });
    const first = await start(pupil1, set.formId);
    await db.formResponse.update({ where: { id: first.json.data.responseId }, data: { startedAt: minutesAgo(12) } });

    const again = await start(pupil1, set.formId);
    expect(again.status).toBe(201);
    expect(again.json.data.isResume).toBe(false);
    expect(again.json.data.responseId).not.toBe(first.json.data.responseId);
    const old = await db.formResponse.findUniqueOrThrow({ where: { id: first.json.data.responseId } });
    expect(old.status).toBe("ABANDONED");
  });

  test("starts made at the same moment are one attempt, not several", async () => {
    const set = await makeSet();
    for (let round = 0; round < ROUNDS; round++) {
      await db.formResponse.deleteMany({ where: { formId: set.formId } });
      const results = await Promise.all(Array.from({ length: AT_ONCE }, () => start(pupil1, set.formId)));
      for (const r of results) expect(r.status, `round ${round}`).toBe(201);
      const open = await db.formResponse.findMany({ where: { formId: set.formId, status: "IN_PROGRESS" } });
      expect(open, `round ${round}: one open attempt`).toHaveLength(1);
      expect(new Set(results.map((r) => r.json.data.responseId as string)), `round ${round}: every start got the same attempt`).toEqual(
        new Set([open[0]!.id]),
      );
      expect(
        results.filter((r) => r.json.data.isResume === false),
        `round ${round}: exactly one start made it`,
      ).toHaveLength(1);
    }
  });
});

test.describe("submitting an attempt", () => {
  test("a set the teacher has closed takes no more answers, and the attempt is left as it was", async () => {
    const set = await makeSet();
    const { responseId } = (await start(pupil1, set.formId)).json.data;
    await db.form.update({ where: { id: set.formId }, data: { status: "CLOSED", closedAt: new Date(), closedById: authorId } });

    const res = await submit(pupil1, set, responseId);
    expect(res.status).toBe(403);
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: responseId } })).status).toBe("IN_PROGRESS");
    expect(await answersOf(set.formId)).toBe(0);
  });

  test("a set past its closing time takes no more answers", async () => {
    const set = await makeSet({ closesAt: new Date(Date.now() + 3_600_000) });
    const { responseId } = (await start(pupil1, set.formId)).json.data;
    await db.form.update({ where: { id: set.formId }, data: { closesAt: minutesAgo(1) } });

    expect((await submit(pupil1, set, responseId)).status).toBe(403);
    expect(await answersOf(set.formId)).toBe(0);
  });

  test("a pupil who is no longer in the set's audience cannot submit an attempt they began", async () => {
    const set = await makeSet();
    const { responseId } = (await start(pupil1, set.formId)).json.data;
    // the teacher narrows the audience to another class after the pupil has started
    await db.formAudience.updateMany({ where: { formId: set.formId }, data: { classGroupIds: [group2.id] } });

    const res = await submit(pupil1, set, responseId);
    expect(res.status, res.text.slice(0, 160)).toBe(403);
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: responseId } })).status).toBe("IN_PROGRESS");
    expect(await answersOf(set.formId)).toBe(0);
  });

  test("nor can a pupil who has been moved to another class", async () => {
    const set = await makeSet();
    const { responseId } = (await start(pupil1, set.formId)).json.data;
    await db.studentEnrollment.updateMany({ where: { studentId: pupil1.id }, data: { classArmId: arm2Id } });

    const res = await submit(pupil1, set, responseId);
    expect(res.status, res.text.slice(0, 160)).toBe(403);
    expect(await answersOf(set.formId)).toBe(0);
  });

  test("a set put back to draft takes no more answers", async () => {
    const set = await makeSet();
    const { responseId } = (await start(pupil1, set.formId)).json.data;
    await db.form.update({ where: { id: set.formId }, data: { status: "DRAFT" } });
    expect((await submit(pupil1, set, responseId)).status).toBe(403);
  });

  test("an open set takes the answers and marks them", async () => {
    const set = await makeSet({ closesAt: new Date(Date.now() + 3_600_000) });
    const { responseId } = (await start(pupil1, set.formId)).json.data;
    const res = await submit(pupil1, set, responseId);
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ status: "COMPLETED", totalScore: 3, maxScore: 3 });
    expect(await answersOf(set.formId)).toBe(2);
  });

  test("the time limit: a little past it is allowed for the network, well past it is refused and nothing is written", async () => {
    const set = await makeSet({ maxDurationMinutes: 10 });
    const { responseId } = (await start(pupil1, set.formId)).json.data;

    await db.formResponse.update({ where: { id: responseId }, data: { startedAt: new Date(Date.now() - 10 * 60_000 - 20_000) } });
    const late = await submit(pupil1, set, responseId);
    expect(late.status, "20 seconds over, inside the allowance").toBe(200);

    const second = await makeSet({ maxDurationMinutes: 10 });
    const next = (await start(pupil1, second.formId)).json.data.responseId;
    await db.formResponse.update({ where: { id: next }, data: { startedAt: minutesAgo(12) } });
    const over = await submit(pupil1, second, next);
    expect(over.status, "two minutes over").toBe(403);
    expect(over.json.error.code).toBe("TIME_UP");
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: next } })).status).toBe("IN_PROGRESS");
    expect(await answersOf(second.formId)).toBe(0);
  });

  test("a set with no time limit takes an answer however long the pupil took", async () => {
    const set = await makeSet({ maxDurationMinutes: null });
    const { responseId } = (await start(pupil1, set.formId)).json.data;
    await db.formResponse.update({ where: { id: responseId }, data: { startedAt: minutesAgo(60 * 24 * 7) } });
    expect((await submit(pupil1, set, responseId)).status).toBe(200);
  });

  test("a response on another kind of form is not a practice attempt", async () => {
    const survey = await db.form.create({
      data: { branchId: home.id, kind: "QUESTIONNAIRE", title: "Survey", status: "PUBLISHED", createdById: authorId },
    });
    const sq = await db.formQuestion.create({
      data: { branchId: home.id, formId: survey.id, prompt: "How was it?", questionType: "SHORT", points: 1, sortOrder: 0 },
    });
    const response = await db.formResponse.create({
      data: { branchId: home.id, formId: survey.id, studentId: pupil1.id, respondentId: pupil1.id, status: "IN_PROGRESS" },
    });

    const res = await submit(pupil1, { formId: survey.id, q1: sq.id, q2: sq.id }, response.id);
    expect(res.status).toBe(404);
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: response.id } })).status).toBe("IN_PROGRESS");
  });

  test("another pupil's attempt is not theirs to submit", async () => {
    const set = await makeSet({ forGroup: null });
    const { responseId } = (await start(pupil1, set.formId)).json.data;
    expect((await submit(pupil2, set, responseId)).status).toBe(404);
    expect((await db.formResponse.findUniqueOrThrow({ where: { id: responseId } })).status).toBe("IN_PROGRESS");
  });

  test("submits made at the same moment are one submission: one succeeds, the rest are refused, and the answers are written once", async () => {
    const set = await makeSet();
    for (let round = 0; round < ROUNDS; round++) {
      await db.formResponse.deleteMany({ where: { formId: set.formId } });
      const { responseId } = (await start(pupil1, set.formId)).json.data;

      const results = await Promise.all(Array.from({ length: AT_ONCE }, () => submit(pupil1, set, responseId)));
      expect(results.map((r) => r.status).sort(), `round ${round}: one 200, the rest 400`).toEqual([200, ...Array(AT_ONCE - 1).fill(400)]);
      expect(await answersOf(set.formId), `round ${round}: each question answered once`).toBe(2);
      expect(await db.formResponse.findUniqueOrThrow({ where: { id: responseId } }), `round ${round}`).toMatchObject({
        status: "COMPLETED",
        score: 3,
        maxScore: 3,
      });
    }
  });
});
