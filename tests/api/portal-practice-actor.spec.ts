import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api } from "../support/http";

// Only the pupil may finish or archive their own practice. A guardian signs in to the same portal and may read the summary their branch allows, but the finish route
// returns the questions, the pupil's answers, the correct answers and the explanations, and the archive route changes what the summary shows: neither is a guardian's.

const PUPIL_DOB = "2013-05-10";
const GUARDIAN_PHONE = "+2348011110001";

const portalCookie = async (admissionNo: string, secret: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let student: { id: string; admissionNo: string };
let itemId: string;
let sessionId: string;
let attemptId: string;

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
  const item = await db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: "What is the powerhouse of the cell?",
      explanation: "Mitochondria make the energy.",
      points: 1,
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
  itemId = item.id;
  const session = await db.practiceSession.create({
    data: { branchId: home.id, studentId: student.id, subjectLabel: "Biology", size: 1, itemIds: [itemId], feedbackMode: "END" },
  });
  sessionId = session.id;
  const attempt = await db.practiceAttempt.create({
    data: { sessionId, branchId: home.id, studentId: student.id, bankItemId: itemId, version: 1, answer: "A", correct: false },
  });
  attemptId = attempt.id;
});

const finishUrl = () => `/api/v1/portal/students/${student.id}/practice/sessions/${sessionId}/finish`;
const archiveUrl = () => `/api/v1/portal/students/${student.id}/practice/history/${attemptId}`;

test("a guardian cannot finish the pupil's practice session or read its answer key", async () => {
  const guardian = await portalCookie(student.admissionNo, GUARDIAN_PHONE);
  const res = await api(finishUrl(), { method: "POST", cookie: guardian, body: {} });
  expect(res.status).toBe(403);
  expect(res.json.error.code).toBe("PORTAL_ACCESS");
  const body = JSON.stringify(res.json);
  expect(body).not.toContain("powerhouse");
  expect(body).not.toContain("Mitochondria");
  expect((await db.practiceSession.findUniqueOrThrow({ where: { id: sessionId } })).finishedAt).toBeNull();
});

test("a guardian cannot archive the pupil's attempts", async () => {
  const guardian = await portalCookie(student.admissionNo, GUARDIAN_PHONE);
  const res = await api(archiveUrl(), { method: "PATCH", cookie: guardian, body: { archived: true } });
  expect(res.status).toBe(403);
  expect(res.json.error.code).toBe("PORTAL_ACCESS");
  expect((await db.practiceAttempt.findUniqueOrThrow({ where: { id: attemptId } })).archivedAt).toBeNull();
});

test("the pupil can still finish and archive their own practice", async () => {
  const pupil = await portalCookie(student.admissionNo, PUPIL_DOB);
  const finish = await api(finishUrl(), { method: "POST", cookie: pupil, body: {} });
  expect(finish.status).toBe(200);
  expect(finish.json.data.attempts[0].correctAnswer).toBe("B");
  const archive = await api(archiveUrl(), { method: "PATCH", cookie: pupil, body: { archived: true } });
  expect(archive.status).toBe(200);
  expect(archive.json.data.archived).toBe(true);
});

test("a signed-out request is refused", async () => {
  expect((await api(finishUrl(), { method: "POST", body: {} })).status).toBe(401);
  expect((await api(archiveUrl(), { method: "PATCH", body: { archived: true } })).status).toBe(401);
});
