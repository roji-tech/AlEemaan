import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// The gaps the Forms screens showed, as the API holds them (Task 0041, slice F8). What these cases hold:
//   - a member of staff reads their own question reports, with the reviewer's outcome, and no one else's (not a pupil's, not another teacher's);
//   - a practice set is answered once: a start after a finished attempt is refused;
//   - a session left open can be opened to carry on with, by its owner only, without keys, while practice is open;
//   - a public questionnaire asks each browser to answer once, and the cookie it sets names no one.

const PUPIL_DOB = "2013-05-10";
const portalCookie = async (admissionNo: string, secret: string = PUPIL_DOB) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

let home: { id: string };
let teacher: TestUser;
let teacherCookie: string;
let teacher2: TestUser;
let teacher2Cookie: string;
let author: TestUser;
let pupil: { id: string; admissionNo: string };
let other: { id: string; admissionNo: string };
let pupilCookie: string;
let otherCookie: string;
let items: { id: string }[];

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });
  const make = async (first: string, admissionNo: string) => {
    const record = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: first,
        lastName: "Pupil",
        gender: Gender.FEMALE,
        dateOfBirth: new Date(PUPIL_DOB),
        admissionNo,
        guardianPhone: "+2348011110001",
      },
    });
    await db.studentEnrollment.create({
      data: {
        studentId: record.id,
        branchId: home.id,
        sessionId: session.id,
        className: "JSS 1",
        arm: "Gold",
        classArmId: arm.id,
        status: "ACTIVE",
      },
    });
    return { id: record.id, admissionNo };
  };
  pupil = await make("Amina", "2026/0001");
  other = await make("Zainab", "2026/0002");
  pupilCookie = await portalCookie(pupil.admissionNo);
  otherCookie = await portalCookie(other.admissionNo);

  author = await createUser({ superAdmin: true });
  teacher = await createUser({ role: Role.TEACHING_STAFF, name: "Tariq Teacher", superAdmin: false });
  teacher2 = await createUser({ role: Role.TEACHING_STAFF, name: "Tunde Teacher", superAdmin: false });
  teacherCookie = cookieHeader((await loginAs(teacher)).token!);
  teacher2Cookie = cookieHeader((await loginAs(teacher2)).token!);

  await db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.practice.minPoolSize", value: 5, status: "APPROVED" } });
  items = [];
  for (let i = 1; i <= 6; i++) {
    items.push(
      await db.questionBankItem.create({
        data: {
          branchId: home.id,
          bank: "ASSESSMENT",
          type: "SINGLE",
          prompt: `What is cell part ${i}?`,
          explanation: `Explanation for question ${i}.`,
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
      }),
    );
  }
});

const PORTAL = () => `/api/v1/portal/students/${pupil.id}`;

test.describe("a member of staff reads their own question reports", () => {
  test("only the caller's reports, with the reviewer's outcome and reason; never a pupil's or another teacher's", async () => {
    await db.questionReport.create({
      data: {
        branchId: home.id,
        itemId: items[0]!.id,
        itemVersion: 1,
        reporterRole: "TEACHER",
        reporterSection: "Main Branch",
        reporterUserId: teacher.id,
        reason: "The key is wrong",
        status: "RESOLVED",
        outcome: "FIXED",
        outcomeReason: "Corrected the key",
        resolvedAt: new Date(),
      },
    });
    await db.questionReport.create({
      data: {
        branchId: home.id,
        itemId: items[0]!.id,
        itemVersion: 1,
        reporterRole: "TEACHER",
        reporterSection: "Main Branch",
        reporterUserId: teacher2.id,
        reason: "Someone else's reason",
      },
    });
    await db.questionReport.create({
      data: {
        branchId: home.id,
        itemId: items[0]!.id,
        itemVersion: 1,
        reporterRole: "PUPIL",
        reporterSection: "JSS",
        reporterStudentId: pupil.id,
        reason: "A pupil's reason",
      },
    });

    const mine = await api("/api/v1/question-bank/my-reports", { cookie: teacherCookie });
    expect(mine.status).toBe(200);
    expect(mine.json.data.reports).toHaveLength(1);
    expect(mine.json.data.reports[0]).toMatchObject({
      questionPrompt: "What is cell part 1?",
      reason: "The key is wrong",
      status: "RESOLVED",
      outcome: "FIXED",
      outcomeReason: "Corrected the key",
    });
    expect(mine.text).not.toContain("Someone else's reason");
    expect(mine.text).not.toContain("A pupil's reason");

    const theirs = await api("/api/v1/question-bank/my-reports", { cookie: teacher2Cookie });
    expect(theirs.json.data.reports).toHaveLength(1);
    expect(theirs.json.data.reports[0].reason).toBe("Someone else's reason");
    expect((await api("/api/v1/question-bank/my-reports")).status).toBe(401);
    expect((await api("/api/v1/question-bank/my-reports", { cookie: pupilCookie })).status).toBeGreaterThanOrEqual(401);
  });
});

test.describe("a practice set is answered once", () => {
  test("a start after a finished attempt is refused and stores nothing; one in progress is resumed", async () => {
    const form = await db.form.create({
      data: { branchId: home.id, kind: "PRACTICE_SET", title: "Fractions", status: "PUBLISHED", createdById: teacher.id },
    });
    const question = await db.formQuestion.create({
      data: {
        branchId: home.id,
        formId: form.id,
        prompt: "Pick the first",
        questionType: "SINGLE",
        options: [
          { id: "a", text: "First" },
          { id: "b", text: "Second" },
        ],
        correctAnswer: "a",
        points: 1,
        sortOrder: 0,
      },
    });
    const base = `${PORTAL()}/forms/practice-sets/${form.id}`;
    const started = await api(`${base}/start`, { method: "POST", cookie: pupilCookie, body: {} });
    expect(started.status).toBe(201);
    const resumed = await api(`${base}/start`, { method: "POST", cookie: pupilCookie, body: {} });
    expect(resumed.status).toBe(201);
    expect(resumed.json.data).toMatchObject({ isResume: true, responseId: started.json.data.responseId });

    const sent = await api(`${base}/submit`, {
      method: "POST",
      cookie: pupilCookie,
      body: { responseId: started.json.data.responseId, answers: [{ formQuestionId: question.id, value: "a" }] },
    });
    expect(sent.status).toBe(200);

    const again = await api(`${base}/start`, { method: "POST", cookie: pupilCookie, body: {} });
    expect(again.status).toBe(400);
    expect(again.json.error.code).toBe("ALREADY_COMPLETED");
    expect(await db.formResponse.count({ where: { formId: form.id, studentId: pupil.id } })).toBe(1);

    const list = await api(`${PORTAL()}/forms/practice-sets`, { cookie: pupilCookie });
    const listed = (list.json.data.practiceSets as { id: string; hasSubmitted: boolean; submission: { id: string } | null }[]).find(
      (s) => s.id === form.id,
    );
    expect(listed?.hasSubmitted).toBe(true);
    expect(listed?.submission?.id).toBe(started.json.data.responseId);
    // another pupil can still start it
    expect(
      (
        await api(`/api/v1/portal/students/${other.id}/forms/practice-sets/${form.id}/start`, {
          method: "POST",
          cookie: otherCookie,
          body: {},
        })
      ).status,
    ).toBe(201);
  });
});

test.describe("carrying on a practice session", () => {
  const open = async () => {
    const res = await api(`${PORTAL()}/practice/sessions`, {
      method: "POST",
      cookie: pupilCookie,
      body: { subjectLabel: "Biology", size: 3, feedbackMode: "EACH" },
    });
    expect(res.status).toBe(201);
    return res.json.data as { session: { id: string }; questions: { id: string }[] };
  };

  test("the owner gets the questions still to answer, without keys, and how many were answered", async () => {
    const started = await open();
    const first = started.questions[0]!.id;
    expect(
      (
        await api(`${PORTAL()}/practice/sessions/${started.session.id}/answers`, {
          method: "POST",
          cookie: pupilCookie,
          body: { bankItemId: first, answer: "B" },
        })
      ).status,
    ).toBe(200);

    const resumed = await api(`${PORTAL()}/practice/sessions/${started.session.id}`, { cookie: pupilCookie });
    expect(resumed.status).toBe(200);
    expect(resumed.json.data.answeredCount).toBe(1);
    expect((resumed.json.data.questions as { id: string }[]).map((q) => q.id)).toEqual(started.questions.slice(1).map((q) => q.id));
    expect(resumed.text).not.toContain("correctAnswer");
    expect(resumed.text).not.toContain("Explanation for question");
  });

  test("another pupil's session is not found; a finished one is refused; a closed practice is refused as an answer is", async () => {
    const started = await open();
    const address = `${PORTAL()}/practice/sessions/${started.session.id}`;
    expect((await api(`/api/v1/portal/students/${other.id}/practice/sessions/${started.session.id}`, { cookie: otherCookie })).status).toBe(
      404,
    );
    expect((await api(address)).status).toBe(401);

    await db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.access.pupils", value: false as never, status: "APPROVED" } });
    const closed = await api(address, { cookie: pupilCookie });
    expect(closed.status).toBe(403);
    expect(closed.json.error.code).toBe("PRACTICE_CLOSED");
    await db.settingValue.deleteMany({ where: { key: "bank.access.pupils" } });

    expect((await api(`${address}/finish`, { method: "POST", cookie: pupilCookie, body: {} })).status).toBe(200);
    const finished = await api(address, { cookie: pupilCookie });
    expect(finished.status).toBe(400);
    expect(finished.json.error.code).toBe("SESSION_FINISHED");
  });

  test("a question the school has withdrawn since is not offered again", async () => {
    const started = await open();
    const withdrawn = started.questions[1]!.id;
    await db.questionBankItem.update({ where: { id: withdrawn }, data: { status: "RETIRED", retiredReason: "Withdrawn for the test" } });
    const resumed = await api(`${PORTAL()}/practice/sessions/${started.session.id}`, { cookie: pupilCookie });
    expect(resumed.status).toBe(200);
    expect((resumed.json.data.questions as { id: string }[]).map((q) => q.id)).not.toContain(withdrawn);
  });
});

test.describe("a public questionnaire asks each browser to answer once", () => {
  async function survey() {
    const shareToken = crypto.randomBytes(16).toString("hex");
    const form = await db.form.create({
      data: {
        branchId: home.id,
        kind: "QUESTIONNAIRE",
        title: "Public one",
        status: "PUBLISHED",
        isAnonymous: true,
        shareToken,
        createdById: teacher.id,
      },
    });
    await db.formAudience.create({ data: { branchId: home.id, formId: form.id, kind: "PUBLIC" } });
    const q = await db.formQuestion.create({
      data: { branchId: home.id, formId: form.id, prompt: "Anything else?", questionType: "SHORT", points: 0, sortOrder: 0 },
    });
    return { formId: form.id, token: shareToken, q: q.id };
  }
  const read = (t: string, cookie?: string) => api(`/api/v1/forms/public/${t}`, { cookie });
  const send = (t: string, q: string, cookie?: string) =>
    api(`/api/v1/forms/public/${t}/submit`, { method: "POST", body: { answers: [{ formQuestionId: q, value: "More chairs" }] }, cookie });
  const marked = (setCookies: string[]) => setCookies.find((c) => c.startsWith("qa="));

  test("the first answer is stored and marks the browser; a second from that browser is refused and stores nothing; another browser is not affected", async () => {
    const s = await survey();
    expect((await read(s.token)).json.data.answeredHere).toBe(false);

    const first = await send(s.token, s.q);
    expect(first.status).toBe(200);
    const cookie = marked(first.setCookies);
    expect(cookie).toBeDefined();
    expect(cookie).toContain("qa=1");
    expect(cookie).toContain(`Path=/api/v1/forms/public/${s.token}`);
    expect(cookie!.toLowerCase()).toContain("httponly");
    expect(cookie!.toLowerCase()).toContain("samesite=lax");
    // the cookie names no one and the body does not hand the token back
    expect(cookie).not.toMatch(/respond|student|user/i);
    expect(first.text).not.toContain(s.token);

    expect((await read(s.token, "qa=1")).json.data.answeredHere).toBe(true);
    const second = await send(s.token, s.q, "qa=1");
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("ALREADY_SUBMITTED");
    expect(second.json.error.message).toBe("You have already answered this questionnaire from this browser.");
    expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(1);

    // a browser without the cookie may answer: the courtesy is not a guarantee, and the page says so
    expect((await send(s.token, s.q)).status).toBe(200);
    expect(await db.formResponse.count({ where: { formId: s.formId } })).toBe(2);
  });

  test("a refused answer does not mark the browser, and a token of another shape never sets a cookie", async () => {
    const s = await survey();
    const bad = await api(`/api/v1/forms/public/${s.token}/submit`, {
      method: "POST",
      body: { answers: "nope" },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(marked(bad.setCookies)).toBeUndefined();

    const odd = await api("/api/v1/forms/public/not-a-token/submit", {
      method: "POST",
      body: { answers: [{ formQuestionId: "x", value: "y" }] },
      cookie: "qa=1",
    });
    expect(odd.status).toBe(404);
    expect(odd.setCookies).toEqual([]);
  });
});
