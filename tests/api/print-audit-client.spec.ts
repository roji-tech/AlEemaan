import "../support/env";
import { test, expect } from "@playwright/test";
import { FormKind, FormStatus, Gender, PrintTargetKind, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// A print is written to an append-only log: who, what, when, from where. "From where" must be something the server worked out, not something the browser said.
// `X-Forwarded-For` is whatever the caller types (the leftmost entry costs nothing to forge), so a log that copied it would let anyone put another address, or a
// kilobyte of text, in the record of who printed an answer key. The server reads the one header the proxy owns (see getClientIp), keeps nothing when there is none,
// and caps the browser's own description of itself.

const PUPIL_DOB = "2013-05-10";
const GUARDIAN_PHONE = "+2348011110001";
const REAL = "198.51.100.7";
const FORGED = "6.6.6.6, 203.0.113.9";
const LONG_AGENT = "Mozilla/5.0 " + "x".repeat(5000);
const LONG_CHAIN = Array.from({ length: 60 }, (_, i) => `10.0.0.${i}`).join(", ");

const portalCookie = async (admissionNo: string, secret: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let teacherCookie: string;
let student: { id: string; admissionNo: string };
let formId: string;
let sessionId: string;
let responseId: string;

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();

  const teacher = await createUser({ name: "Teacher One", role: Role.TEACHING_STAFF, superAdmin: false });
  const login = await loginAs(teacher);
  expect(login.status).toBe(200);
  teacherCookie = cookieHeader(login.token!);

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

  const form = await db.form.create({
    data: { branchId: home.id, kind: FormKind.PRACTICE_SET, title: "Soil practice", status: FormStatus.PUBLISHED, createdById: teacher.id },
  });
  formId = form.id;
  await db.formQuestion.create({
    data: { branchId: home.id, formId, prompt: "Name a cereal crop.", questionType: "SHORT", points: 1, sortOrder: 1 },
  });
  const response = await db.formResponse.create({
    data: { branchId: home.id, formId, studentId: student.id, status: "COMPLETED", submittedAt: new Date() },
  });
  responseId = response.id;

  const author = await createUser({ superAdmin: true });
  const item = await db.questionBankItem.create({
    data: {
      branchId: home.id,
      bank: "ASSESSMENT",
      type: "SINGLE",
      prompt: "What is the powerhouse of the cell?",
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
  const session = await db.practiceSession.create({
    data: {
      branchId: home.id,
      studentId: student.id,
      subjectLabel: "Biology",
      size: 1,
      itemIds: [item.id],
      feedbackMode: "END",
      finishedAt: new Date(),
    },
  });
  sessionId = session.id;
  await db.practiceAttempt.create({
    data: { sessionId, branchId: home.id, studentId: student.id, bankItemId: item.id, version: 1, answer: "A", correct: false },
  });
});

type Sent = { ip: string | null; xff?: string; agent?: string };
const headers = (sent: Sent) => ({
  ...(sent.xff ? { "x-forwarded-for": sent.xff } : {}),
  ...(sent.agent ? { "user-agent": sent.agent } : {}),
});

// Each of the four places that print writes the log; each is reached the way a real caller would.
const routes: Array<{ name: string; kind: PrintTargetKind; call: (sent: Sent) => Promise<{ status: number; targetId: () => string }> }> = [
  {
    name: "a teacher printing a form (forms route)",
    kind: PrintTargetKind.FORM,
    call: async (sent) => {
      const res = await api(`/api/v1/forms/${formId}/print`, {
        method: "POST",
        cookie: teacherCookie,
        ip: sent.ip,
        headers: headers(sent),
        body: { branchId: home.id, format: "json" },
      });
      return { status: res.status, targetId: () => formId };
    },
  },
  {
    name: "a teacher printing through the question bank route",
    kind: PrintTargetKind.FORM,
    call: async (sent) => {
      const res = await api("/api/v1/question-bank/print", {
        method: "POST",
        cookie: teacherCookie,
        ip: sent.ip,
        headers: headers(sent),
        body: { branchId: home.id, targetKind: PrintTargetKind.FORM, targetId: formId, format: "json" },
      });
      return { status: res.status, targetId: () => formId };
    },
  },
  {
    name: "a pupil printing a finished practice session",
    kind: PrintTargetKind.PRACTICE_SESSION,
    call: async (sent) => {
      const pupil = await portalCookie(student.admissionNo, PUPIL_DOB);
      const res = await api(`/api/v1/portal/students/${student.id}/question-bank/practice/${sessionId}/print?format=json`, {
        cookie: pupil,
        ip: sent.ip,
        headers: headers(sent),
      });
      return { status: res.status, targetId: () => sessionId };
    },
  },
  {
    name: "a pupil printing a finished practice-set submission",
    kind: PrintTargetKind.FORM_RESPONSE,
    call: async (sent) => {
      const pupil = await portalCookie(student.admissionNo, PUPIL_DOB);
      const res = await api(
        `/api/v1/portal/students/${student.id}/forms/practice-sets/${formId}/responses/${responseId}/print?format=json`,
        {
          cookie: pupil,
          ip: sent.ip,
          headers: headers(sent),
        },
      );
      return { status: res.status, targetId: () => responseId };
    },
  },
];

const logOf = async (kind: PrintTargetKind, targetId: string) =>
  db.questionBankPrintLog.findFirstOrThrow({ where: { targetKind: kind, targetId }, orderBy: { createdAt: "desc" } });

for (const route of routes) {
  test.describe(route.name, () => {
    test("the log keeps the address the proxy set, never a forged forwarded-for list", async () => {
      const done = await route.call({ ip: REAL, xff: FORGED });
      expect(done.status).toBe(200);
      const log = await logOf(route.kind, done.targetId());
      expect(log.ipAddress).toBe(REAL);
    });

    test("with no address from the proxy nothing is stored in its place, whatever the forwarded-for list says", async () => {
      const done = await route.call({ ip: null, xff: FORGED });
      expect(done.status).toBe(200);
      const log = await logOf(route.kind, done.targetId());
      expect(log.ipAddress).toBeNull();
    });

    test("a very long user agent or forwarded-for chain never stops a print, and the log keeps at most 256 characters of the agent", async () => {
      const done = await route.call({ ip: REAL, xff: LONG_CHAIN, agent: LONG_AGENT });
      expect(done.status).toBe(200); // the log's columns are VARCHAR(100) and VARCHAR(500): an unbounded value made the insert fail and the print a 500
      const log = await logOf(route.kind, done.targetId());
      expect(log.ipAddress).toBe(REAL);
      expect(log.userAgent!.length).toBeLessThanOrEqual(256);
      expect(log.userAgent!.startsWith("Mozilla/5.0")).toBe(true);
    });
  });
}

// Not only a forged list is wrong: with no forwarded-for header at all the server fills one in with the address of the connection it was reached on, which behind a proxy is
// the proxy's own. The log must hold the client address the proxy reported.
test("an ordinary print records the client address the proxy reported, not the address of the connection, and the agent", async () => {
  const res = await api(`/api/v1/forms/${formId}/print`, {
    method: "POST",
    cookie: teacherCookie,
    ip: REAL,
    headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0" },
    body: { branchId: home.id, format: "json" },
  });
  expect(res.status).toBe(200);
  const log = await logOf(PrintTargetKind.FORM, formId);
  expect(log.ipAddress).toBe(REAL);
  expect(log.userAgent).toBe("Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0");
});
