import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api } from "../support/http";

// A pupil's practice belongs to that pupil. The pupil in the path of every portal practice route is checked against the sign-in (the portal gate), and the session or attempt in the
// path must belong to that pupil: a pupil who puts someone else's id in the path, or their own id with someone else's session or attempt, gets nothing and changes nothing.
// These are regression tests of rules that hold; they pass on the code as it is, and are here so that they keep holding.

const DOB_A = "2013-05-10";
const DOB_B = "2014-06-15";
const GUARDIAN_PHONE = "+2348011110001";

type Pupil = { id: string; cookie: string };

let home: { id: string };
let pupilA: Pupil;
let pupilB: Pupil;
let itemId: string;
let sessionA: string;
let attemptA: string;
const PROMPT_A = "Which gas do plants take in? (Aisha's question)";

async function makePupil(n: number, name: string, dob: string): Promise<Pupil> {
  const admissionNo = `2026/000${n}`;
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
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret: dob } });
  expect(res.status).toBe(200);
  return { id: s.id, cookie: res.setCookies[0]!.split(";")[0]! };
}

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  const author = await createUser({ superAdmin: true });
  pupilA = await makePupil(1, "Aisha", DOB_A);
  pupilB = await makePupil(2, "Bilal", DOB_B);
  const item = await db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: PROMPT_A,
      explanation: "Carbon dioxide.",
      points: 1,
      subjectLabel: "Biology",
      subjectKey: "biology",
      options: [
        { id: "A", text: "Oxygen" },
        { id: "B", text: "Carbon dioxide" },
      ],
      correctAnswer: "B",
      visibility: "PRACTICE",
      status: "APPROVED",
      submittedById: author.id,
      approvedById: author.id,
      approvedAt: new Date(),
    },
  });
  itemId = item.id;
  const session = await db.practiceSession.create({
    data: { branchId: home.id, studentId: pupilA.id, subjectLabel: "Biology", size: 1, itemIds: [itemId], feedbackMode: "END" },
  });
  sessionA = session.id;
  const attempt = await db.practiceAttempt.create({
    data: { sessionId: sessionA, branchId: home.id, studentId: pupilA.id, bankItemId: itemId, version: 1, answer: "A", correct: false },
  });
  attemptA = attempt.id;
});

const root = (studentId: string) => `/api/v1/portal/students/${studentId}/practice`;

test("another pupil's id in the path is refused", async () => {
  const history = await api(`${root(pupilA.id)}/history`, { cookie: pupilB.cookie });
  expect(history.status).toBe(403);
  expect(history.text).not.toContain("Aisha's question");

  const finish = await api(`${root(pupilA.id)}/sessions/${sessionA}/finish`, { method: "POST", cookie: pupilB.cookie, body: {} });
  expect(finish.status).toBe(403);
  expect(finish.text).not.toContain("Carbon dioxide");

  const archive = await api(`${root(pupilA.id)}/history/${attemptA}`, { method: "PATCH", cookie: pupilB.cookie, body: { archived: true } });
  expect(archive.status).toBe(403);
  expect((await db.practiceAttempt.findUniqueOrThrow({ where: { id: attemptA } })).archivedAt).toBeNull();
});

test("a pupil's own path with another pupil's session or attempt finds nothing and changes nothing", async () => {
  const finish = await api(`${root(pupilB.id)}/sessions/${sessionA}/finish`, { method: "POST", cookie: pupilB.cookie, body: {} });
  expect(finish.status).toBe(404);
  expect(finish.text).not.toContain("Carbon dioxide");
  expect((await db.practiceSession.findUniqueOrThrow({ where: { id: sessionA } })).finishedAt).toBeNull();

  const answer = await api(`${root(pupilB.id)}/sessions/${sessionA}/answers`, {
    method: "POST",
    cookie: pupilB.cookie,
    body: { bankItemId: itemId, answer: "B" },
  });
  expect(answer.status).toBe(404);
  expect(await db.practiceAttempt.count({ where: { sessionId: sessionA } }), "no answer was added to the other pupil's session").toBe(1);

  const archive = await api(`${root(pupilB.id)}/history/${attemptA}`, { method: "PATCH", cookie: pupilB.cookie, body: { archived: true } });
  expect(archive.status).toBe(404);
  expect((await db.practiceAttempt.findUniqueOrThrow({ where: { id: attemptA } })).archivedAt).toBeNull();
});

test("a pupil's history holds that pupil's practice and no one else's", async () => {
  const b = await api(`${root(pupilB.id)}/history`, { cookie: pupilB.cookie });
  expect(b.status).toBe(200);
  expect(b.text).not.toContain("Aisha's question");
  expect(b.text).not.toContain(attemptA);

  const a = await api(`${root(pupilA.id)}/history`, { cookie: pupilA.cookie });
  expect(a.status).toBe(200);
  expect(a.text).toContain("Aisha's question");
});

test("a signed-out request is refused on every practice route", async () => {
  expect((await api(`${root(pupilA.id)}/history`)).status).toBe(401);
  expect((await api(`${root(pupilA.id)}/sessions/${sessionA}/finish`, { method: "POST", body: {} })).status).toBe(401);
  expect((await api(`${root(pupilA.id)}/history/${attemptA}`, { method: "PATCH", body: { archived: true } })).status).toBe(401);
});
