import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// "Apply the correction to that copy and re-grade the attempts" (design note 8.5): when a reviewer resolves a report as FIXED, they may ask for the corrected question to be put into the
// assessments that copied it, and for the attempts already made to be scored again. It is an exception to "past papers are immutable", so it is explicit and narrow:
//   - only for a report resolved as FIXED, and only when the corrected question is APPROVED;
//   - only the copies in the branch the report came from, and not in archived quizzes (past papers);
//   - the copy takes the corrected prompt, options and key; its points are the quiz's own and stay;
//   - finished attempts are scored again with the rule a quiz is graded by; what changed, for whom, is written to the audit trail;
//   - all or nothing, and refused outright above 5000 attempts rather than done in part.
// Without it, resolving a report changes no assessment.

const FIXED_PROMPT = "What is the capital of Nigeria? (corrected)";
const FIXED_OPTIONS = [
  { id: "A", text: "Abuja" },
  { id: "B", text: "Lagos" },
];

let home: { id: string };
let otherBranch: { id: string };
let teacher: TestUser;
let reviewer: TestUser;
let everyReviewer: TestUser;
let admin: TestUser;
let cookies: Record<"teacher" | "reviewer" | "everyReviewer", string>;
let homePupils: string[];
let otherPupil: string;
let homeSubject: string;
let otherSubject: string;

async function cookieFor(user: TestUser) {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  otherBranch = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  teacher = await createUser({ name: "Tariq Teacher", role: Role.TEACHING_STAFF, superAdmin: false });
  reviewer = await createUser({ name: "Rashid Reviewer", role: Role.TEACHING_STAFF, superAdmin: false });
  everyReviewer = await createUser({ name: "Esther Every", role: Role.TEACHING_STAFF, superAdmin: false });
  admin = await createUser({ name: "Amina Admin", role: Role.ADMIN, superAdmin: false });
  await db.questionBankReviewer.create({ data: { userId: reviewer.id, assignedById: admin.id, scope: "GENERAL", branchId: home.id } });
  await db.questionBankReviewer.create({ data: { userId: everyReviewer.id, assignedById: admin.id, scope: "GENERAL", branchId: null } });
  cookies = { teacher: await cookieFor(teacher), reviewer: await cookieFor(reviewer), everyReviewer: await cookieFor(everyReviewer) };

  const pupil = async (branchId: string, n: number) =>
    (
      await db.studentRecord.create({
        data: {
          branchId,
          firstName: `Pupil${n}`,
          lastName: "Test",
          gender: Gender.FEMALE,
          dateOfBirth: new Date("2013-05-10"),
          admissionNo: `2026/${String(n).padStart(4, "0")}`,
          guardianPhone: `+23480111${10000 + n}`,
        },
      })
    ).id;
  homePupils = [await pupil(home.id, 1), await pupil(home.id, 2)];
  otherPupil = await pupil(otherBranch.id, 3);
  homeSubject = (await db.subject.create({ data: { branchId: home.id, name: "Civics", code: "CIV" } })).id;
  otherSubject = (await db.subject.create({ data: { branchId: otherBranch.id, name: "Civics", code: "CIV" } })).id;
});

/** An approved question (version 1, the key is "B") of the home branch, or a general one (no branch) when `general` is true. */
const makeItem = (general = false) =>
  db.questionBankItem.create({
    data: {
      branchId: general ? null : home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: "What is the capital of Nigeria?",
      points: 2,
      subjectLabel: "Civics",
      subjectKey: "civics",
      options: [
        { id: "A", text: "Lagos" },
        { id: "B", text: "Abuja" },
      ],
      correctAnswer: "B",
      visibility: "PRACTICE",
      status: "APPROVED",
      version: 1,
      submittedById: teacher.id,
      approvedById: reviewer.id,
      approvedAt: new Date(),
    },
  });
type Item = Awaited<ReturnType<typeof makeItem>>;

/** What a reviewer does to the question to fix it: the next version, with the key now "A". */
const fixItem = (item: Item) =>
  db.questionBankItem.update({
    where: { id: item.id },
    data: { prompt: FIXED_PROMPT, options: FIXED_OPTIONS, correctAnswer: "A", version: 2 },
  });

/** A quiz of a branch with two questions of 2 points each: the first copied from `item` at `copiedVersion`, the second the teacher's own (key "x"). Pass mark 60. */
async function makeQuiz(opts: { branchId: string; subjectId: string; item: Item; copiedVersion?: number; archived?: boolean }) {
  const quiz = await db.quiz.create({
    data: {
      branchId: opts.branchId,
      subjectId: opts.subjectId,
      title: "Civics test",
      status: "PUBLISHED",
      passingScore: 60,
      archivedAt: opts.archived ? new Date() : null,
    },
  });
  const copy = await db.quizQuestion.create({
    data: {
      branchId: opts.branchId,
      quizId: quiz.id,
      prompt: opts.item.prompt,
      options: [
        { id: "A", text: "Lagos" },
        { id: "B", text: "Abuja" },
      ],
      correctAnswer: "B",
      points: 2,
      sortOrder: 1,
      sourceItemId: opts.item.id,
      sourceVersion: opts.copiedVersion ?? 1,
    },
  });
  const own = await db.quizQuestion.create({
    data: { branchId: opts.branchId, quizId: quiz.id, prompt: "Name the colour of grass.", correctAnswer: "x", points: 2, sortOrder: 2 },
  });
  return { quiz: quiz.id, copy: copy.id, own: own.id };
}
type Quiz = Awaited<ReturnType<typeof makeQuiz>>;

/** A finished attempt: answers to the copied question and the own question, scored as they were when taken (key "B"). */
const attempt = (branchId: string, q: Quiz, studentId: string, copiedAnswer: string, score: number, isPassed: boolean) =>
  db.quizAttempt.create({
    data: {
      branchId,
      quizId: q.quiz,
      studentId,
      answers: [
        { questionId: q.copy, answer: copiedAnswer },
        { questionId: q.own, answer: "x" },
      ],
      score,
      isPassed,
      completedAt: new Date(),
    },
  });

const file = async (itemId: string) => {
  const res = await api(`/api/v1/question-bank/items/${itemId}/report`, {
    method: "POST",
    cookie: cookies.teacher,
    body: { branchId: home.id, reason: "The key of this question is wrong." },
  });
  expect(res.status, res.text.slice(0, 160)).toBe(201);
  return res.json.data.reportId as string;
};
const resolve = (cookie: string, reportId: string, body: Record<string, unknown>) =>
  api(`/api/v1/question-bank/reports/${reportId}`, {
    method: "PATCH",
    cookie,
    body: { outcomeReason: "The key was wrong and is corrected.", ...body },
  });
const copyOf = (q: Quiz) => db.quizQuestion.findUniqueOrThrow({ where: { id: q.copy } });
const attemptState = async (id: string) => {
  const a = await db.quizAttempt.findUniqueOrThrow({ where: { id } });
  return { score: a.score, isPassed: a.isPassed };
};

test.describe("applying the correction", () => {
  test("the copy takes the corrected question, the attempts are scored again, and the audit trail says what changed", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item });
    const a1 = await attempt(home.id, q, homePupils[0]!, "B", 100, true); // right by the old key
    const a2 = await attempt(home.id, q, homePupils[1]!, "A", 50, false); // wrong by the old key, right by the new
    await fixItem(item);
    const reportId = await file(item.id);

    const res = await resolve(cookies.reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regradeCount).toBe(1);
    expect(res.json.data.regrade).toMatchObject({
      copiesCorrected: 1,
      attemptsChecked: 2,
      attemptsChanged: 2,
      attemptsUnreadable: 0,
      skippedArchived: 0,
    });

    const copy = await copyOf(q);
    expect(copy).toMatchObject({ prompt: FIXED_PROMPT, correctAnswer: "A", sourceVersion: 2, points: 2, exposedToPractice: false });
    expect(copy.options).toEqual(FIXED_OPTIONS);
    expect(
      (await db.quizQuestion.findUniqueOrThrow({ where: { id: q.own } })).correctAnswer,
      "the teacher's own question is not touched",
    ).toBe("x");

    expect(await attemptState(a1.id), "was 100, now one of two right").toEqual({ score: 50, isPassed: false });
    expect(await attemptState(a2.id), "was 50, now both right").toEqual({ score: 100, isPassed: true });

    const audit = await db.questionBankAudit.findMany({ where: { ref: reportId, action: "REGRADE_APPLIED" } });
    expect(audit, "one audit row for the re-grade").toHaveLength(1);
    expect(audit[0]!.actorUserId).toBe(reviewer.id);
    const value = audit[0]!.newValue as {
      copiesCorrected: number;
      attemptsChanged: number;
      changes: { attemptId: string; fromScore: number; toScore: number }[];
    };
    expect(value).toMatchObject({ copiesCorrected: 1, attemptsChanged: 2 });
    expect(value.changes.find((c) => c.attemptId === a1.id)).toMatchObject({ fromScore: 100, toScore: 50 });
    expect(value.changes.find((c) => c.attemptId === a2.id)).toMatchObject({ fromScore: 50, toScore: 100 });
  });

  test("without the request, resolving a report changes no assessment", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item });
    const a1 = await attempt(home.id, q, homePupils[0]!, "B", 100, true);
    await fixItem(item);
    const reportId = await file(item.id);

    const res = await resolve(cookies.reviewer, reportId, { outcome: "FIXED" });
    expect(res.status).toBe(200);
    expect(res.json.data.regrade ?? null).toBeNull();
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "B", sourceVersion: 1, exposedToPractice: false });
    expect(await attemptState(a1.id)).toEqual({ score: 100, isPassed: true });
    expect(await db.questionBankAudit.count({ where: { ref: reportId, action: "REGRADE_APPLIED" } })).toBe(0);
  });

  test("a copy that is already at the question's version is left alone, and so are its attempts", async () => {
    const item = await makeItem();
    await fixItem(item);
    const q = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item, copiedVersion: 2 });
    const a1 = await attempt(home.id, q, homePupils[0]!, "A", 77, true); // a score no rule would give: proves it is not recomputed
    const reportId = await file(item.id);

    const res = await resolve(cookies.reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ copiesCorrected: 0, attemptsChanged: 0 });
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "B", sourceVersion: 2 }); // the copy is whatever the teacher made it
    expect(await attemptState(a1.id)).toEqual({ score: 77, isPassed: true });
  });

  test("an archived quiz is a past paper: it is left as it was, and the answer says so", async () => {
    const item = await makeItem();
    const live = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item });
    const past = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item, archived: true });
    const aPast = await attempt(home.id, past, homePupils[0]!, "B", 100, true);
    await fixItem(item);
    const reportId = await file(item.id);

    const res = await resolve(cookies.reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ copiesCorrected: 1, skippedArchived: 1 });
    expect(await copyOf(live)).toMatchObject({ correctAnswer: "A", sourceVersion: 2 });
    expect(await copyOf(past)).toMatchObject({ correctAnswer: "B", sourceVersion: 1 });
    expect(await attemptState(aPast.id)).toEqual({ score: 100, isPassed: true });
  });

  test("an attempt whose stored answers cannot be read is left alone and counted", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item });
    const good = await attempt(home.id, q, homePupils[0]!, "B", 100, true);
    const broken = await db.quizAttempt.create({
      data: {
        branchId: home.id,
        quizId: q.quiz,
        studentId: homePupils[1]!,
        answers: "not a list",
        score: 33,
        isPassed: false,
        completedAt: new Date(),
      },
    });
    await fixItem(item);
    const reportId = await file(item.id);

    const res = await resolve(cookies.reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ attemptsChecked: 2, attemptsChanged: 1, attemptsUnreadable: 1 });
    expect(await attemptState(good.id)).toEqual({ score: 50, isPassed: false });
    expect(await attemptState(broken.id)).toEqual({ score: 33, isPassed: false });
  });
});

test.describe("what a correction may reach", () => {
  test("only the branch the report came from: a general question's copies in another branch are not changed", async () => {
    const item = await makeItem(true);
    const mine = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item });
    const theirs = await makeQuiz({ branchId: otherBranch.id, subjectId: otherSubject, item });
    await attempt(home.id, mine, homePupils[0]!, "B", 100, true);
    const aTheirs = await attempt(otherBranch.id, theirs, otherPupil, "B", 100, true);
    await fixItem(item);
    const reportId = await file(item.id);

    const res = await resolve(cookies.everyReviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.regrade).toMatchObject({ copiesCorrected: 1, attemptsChanged: 1 });
    expect(await copyOf(mine)).toMatchObject({ correctAnswer: "A", sourceVersion: 2 });
    expect(await copyOf(theirs), "the other branch's copy").toMatchObject({ correctAnswer: "B", sourceVersion: 1 });
    expect(await attemptState(aTheirs.id), "and its attempt").toEqual({ score: 100, isPassed: true });
  });

  test("only a report resolved as FIXED can apply a correction; nothing is changed and the report stays open", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item });
    await fixItem(item);
    const reportId = await file(item.id);

    const res = await resolve(cookies.reviewer, reportId, { outcome: "NOT_AN_ERROR", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(400);
    expect((await db.questionReport.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("OPEN");
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "B", sourceVersion: 1 });
  });

  test("the corrected question must be approved: a retired question is not pushed into assessments", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item });
    await fixItem(item);
    const reportId = await file(item.id);
    await db.questionBankItem.update({ where: { id: item.id }, data: { status: "RETIRED", retiredReason: "Withdrawn for review." } });

    const res = await resolve(cookies.reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(400);
    expect(res.json.error.code).toBe("ITEM_NOT_APPROVED");
    expect((await db.questionReport.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("OPEN");
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "B", sourceVersion: 1 });
  });

  test("more than 5000 attempts are refused outright: nothing is changed, the report stays open", async () => {
    const item = await makeItem();
    const q = await makeQuiz({ branchId: home.id, subjectId: homeSubject, item });
    await db.quizAttempt.createMany({
      data: Array.from({ length: 5001 }, (_, i) => ({
        branchId: home.id,
        quizId: q.quiz,
        studentId: homePupils[i % 2]!,
        answers: [{ questionId: q.copy, answer: "B" }],
        score: 100,
        isPassed: true,
        completedAt: new Date(),
      })),
    });
    await fixItem(item);
    const reportId = await file(item.id);

    const res = await resolve(cookies.reviewer, reportId, { outcome: "FIXED", applyRegrade: true });
    expect(res.status, res.text.slice(0, 200)).toBe(400);
    expect(res.json.error.code).toBe("TOO_MANY_ATTEMPTS");
    expect((await db.questionReport.findUniqueOrThrow({ where: { id: reportId } })).status).toBe("OPEN");
    expect(await copyOf(q)).toMatchObject({ correctAnswer: "B", sourceVersion: 1 });
    expect(await db.quizAttempt.count({ where: { quizId: q.quiz, score: 100 } })).toBe(5001);
    expect(await db.questionBankAudit.count({ where: { ref: reportId } })).toBe(1); // only REPORT_FILED
  });
});
