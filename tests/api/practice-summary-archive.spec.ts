import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api } from "../support/http";

// Archiving is the pupil's way to tidy their own history: the attempt leaves the default list and is found again with ?archived=true. It is not a way to take an
// answer out of what the school reports to the guardian. The first design said so ("toggles archivedAt while preserving analytics"); the summary counted only attempts
// that were not archived, so a pupil could hide every wrong answer from the guardian's summary by archiving it.

const PUPIL_DOB = "2013-05-10";
const GUARDIAN_PHONE = "+2348011110001";

const portalCookie = async (admissionNo: string, secret: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let student: { id: string; admissionNo: string };
let sessionId: string;
let attemptIds: string[];

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  const author = await createUser({ superAdmin: true });
  const s = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date(PUPIL_DOB),
      admissionNo: "2026/0001",
      guardianPhone: GUARDIAN_PHONE,
    },
  });
  student = { id: s.id, admissionNo: s.admissionNo };

  const items: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const item = await db.questionBankItem.create({
      data: {
        branchId: home.id,
        bank: "ASSESSMENT",
        type: "SINGLE",
        prompt: `What is cell part ${i}?`,
        points: 1,
        topic: "Cell Structure",
        subjectLabel: "Biology",
        subjectKey: "biology",
        options: [
          { id: "A", text: "Nucleus" },
          { id: "B", text: "Mitochondria" },
        ],
        correctAnswer: "B",
        visibility: "PRACTICE",
        status: "APPROVED",
        submittedById: author.id,
        approvedById: author.id,
        approvedAt: new Date(),
      },
    });
    items.push(item.id);
  }
  const session = await db.practiceSession.create({
    data: {
      branchId: home.id,
      studentId: student.id,
      subjectLabel: "Biology",
      topic: "Cell Structure",
      size: 4,
      itemIds: items,
      feedbackMode: "END",
      finishedAt: new Date(),
    },
  });
  sessionId = session.id;
  // one right answer, three wrong
  attemptIds = [];
  for (const [i, itemId] of items.entries()) {
    const attempt = await db.practiceAttempt.create({
      data: {
        sessionId,
        branchId: home.id,
        studentId: student.id,
        bankItemId: itemId,
        version: 1,
        answer: i === 0 ? "B" : "A",
        correct: i === 0,
      },
    });
    attemptIds.push(attempt.id);
  }
});

const historyUrl = (query = "") => `/api/v1/portal/students/${student.id}/practice/history${query}`;
const archive = (cookie: string, attemptId: string, archived = true) =>
  api(`${historyUrl()}/${attemptId}`, { method: "PATCH", cookie, body: { archived } });

test("the guardian's summary counts an attempt the pupil has archived", async () => {
  const pupil = await portalCookie(student.admissionNo, PUPIL_DOB);
  const guardian = await portalCookie(student.admissionNo, GUARDIAN_PHONE);

  const before = await api(historyUrl(), { cookie: guardian });
  expect(before.json.data.mode).toBe("SUMMARY");
  expect(before.json.data.summary).toMatchObject({ totalSessions: 1, totalAttempted: 4, totalCorrect: 1, overallAccuracy: 25 });

  // the pupil archives every wrong answer
  for (const id of attemptIds.slice(1)) expect((await archive(pupil, id)).status).toBe(200);

  const after = await api(historyUrl(), { cookie: guardian });
  expect(after.status).toBe(200);
  expect(after.json.data.summary).toMatchObject({ totalSessions: 1, totalAttempted: 4, totalCorrect: 1, overallAccuracy: 25 });
  expect(after.json.data.summary.topics).toEqual([
    { subjectLabel: "Biology", topic: "Cell Structure", attempted: 4, correct: 1, accuracy: 25 },
  ]);
});

test("archiving still tidies the pupil's own history: gone from the default list, found again with archived=true, and restoring brings it back", async () => {
  const pupil = await portalCookie(student.admissionNo, PUPIL_DOB);
  const own = async (query = "") =>
    (await api(historyUrl(query), { cookie: pupil })).json.data.sessions[0].attempts as Array<{ id: string }>;

  expect(await own()).toHaveLength(4);
  expect((await archive(pupil, attemptIds[1]!)).status).toBe(200);
  expect((await archive(pupil, attemptIds[2]!)).status).toBe(200);
  expect((await own()).map((a) => a.id).sort()).toEqual([attemptIds[0]!, attemptIds[3]!].sort());
  expect((await own("?archived=true")).map((a) => a.id).sort()).toEqual([attemptIds[1]!, attemptIds[2]!].sort());

  expect((await archive(pupil, attemptIds[1]!, false)).status).toBe(200);
  expect(await own()).toHaveLength(3);
});

test("the guardian's summary does not change when an attempt is restored either", async () => {
  const pupil = await portalCookie(student.admissionNo, PUPIL_DOB);
  const guardian = await portalCookie(student.admissionNo, GUARDIAN_PHONE);
  await archive(pupil, attemptIds[1]!);
  await archive(pupil, attemptIds[1]!, false);
  const summary = (await api(historyUrl(), { cookie: guardian })).json.data.summary;
  expect(summary).toMatchObject({ totalAttempted: 4, totalCorrect: 1 });
});
