import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// An anonymous questionnaire must not let anyone with the database match a person to their answers: the record that says "this person has answered" holds a keyed code
// that is the same for the same person on the same questionnaire and nothing else, and neither it nor the answers carry the time of day. A summary of a few answers is
// not shown, so a single respondent cannot be picked out.

const DOB = "2013-05-10";

let home: { id: string };
let teacher: TestUser;
let teacherCookie: string;
let pupils: Array<{ id: string; admissionNo: string }>;

const portalCookie = async (admissionNo: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret: DOB } });
  expect(res.status).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};

const createForm = async (isAnonymous: boolean, title = "Class survey") => {
  const res = await api("/api/v1/forms", {
    method: "POST",
    cookie: teacherCookie,
    body: {
      kind: "QUESTIONNAIRE",
      branchId: home.id,
      title,
      isAnonymous,
      audienceKind: "MEMBERS",
      roles: ["STUDENT"],
      questions: [
        { prompt: "Favourite subject?", questionType: "SINGLE", options: [{ id: "MATH", text: "Maths" }, { id: "ENG", text: "English" }] },
        { prompt: "Anything else?", questionType: "SHORT" },
      ],
    },
  });
  expect(res.status).toBe(201);
  const formId = res.json.data.formId as string;
  expect((await api(`/api/v1/forms/${formId}`, { method: "PATCH", cookie: teacherCookie, body: { branchId: home.id, status: "PUBLISHED" } })).status).toBe(200);
  const questions = await db.formQuestion.findMany({ where: { formId }, orderBy: { sortOrder: "asc" } });
  return { formId, questions };
};

const submit = async (pupil: { id: string; admissionNo: string }, formId: string, questions: Array<{ id: string }>, cookie?: string) =>
  api(`/api/v1/portal/students/${pupil.id}/forms/questionnaires/${formId}/submit`, {
    method: "POST",
    cookie: cookie ?? (await portalCookie(pupil.admissionNo)),
    body: { answers: [{ formQuestionId: questions[0]!.id, value: "MATH" }, { formQuestionId: questions[1]!.id, value: "I like the library." }] },
  });

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  pupils = [];
  for (let i = 1; i <= 6; i++) {
    const s = await db.studentRecord.create({
      data: { branchId: home.id, firstName: `Pupil${i}`, lastName: "Test", gender: Gender.FEMALE, dateOfBirth: new Date(DOB), admissionNo: `2026/00${i}` },
    });
    pupils.push({ id: s.id, admissionNo: s.admissionNo });
  }
  teacher = await createUser({ name: "Aisha Staff", role: Role.TEACHING_STAFF });
  const login = await loginAs(teacher);
  expect(login.status).toBe(200);
  teacherCookie = cookieHeader(login.token!);
});

test.describe("who has answered is kept as a code, and without the time of day", () => {
  test("an anonymous questionnaire stores a code, not the pupil's id, and no time of day", async () => {
    const { formId, questions } = await createForm(true);
    expect((await submit(pupils[0]!, formId, questions)).status).toBe(200);
    const participation = await db.formParticipation.findFirstOrThrow({ where: { formId } });
    expect(participation.respondentId).not.toContain(pupils[0]!.id);
    expect(participation.respondentId).toMatch(/^[0-9a-f]{64}$/);
    const response = await db.formResponse.findFirstOrThrow({ where: { formId } });
    expect(response.respondentId).toBeNull();
    expect(response.studentId).toBeNull();
    for (const when of [participation.createdAt, response.startedAt, response.submittedAt!]) {
      expect([when.getUTCHours(), when.getUTCMinutes(), when.getUTCSeconds(), when.getUTCMilliseconds()]).toEqual([0, 0, 0, 0]);
    }
  });

  test("the same pupil has a different code on a different questionnaire", async () => {
    const a = await createForm(true, "Survey A");
    const b = await createForm(true, "Survey B");
    await submit(pupils[0]!, a.formId, a.questions);
    await submit(pupils[0]!, b.formId, b.questions);
    const codes = (await db.formParticipation.findMany()).map((p) => p.respondentId);
    expect(new Set(codes).size).toBe(2);
  });

  test("answering twice is still refused, also by a code stored before this change", async () => {
    const { formId, questions } = await createForm(true);
    expect((await submit(pupils[0]!, formId, questions)).status).toBe(200);
    const again = await submit(pupils[0]!, formId, questions);
    expect(again.status).toBe(400);
    expect(again.json.error.code).toBe("ALREADY_SUBMITTED");
    // a participation written by the earlier version of the code holds the pupil's id as it was
    await db.formParticipation.create({ data: { branchId: home.id, formId, respondentId: pupils[1]!.id } });
    const legacy = await submit(pupils[1]!, formId, questions);
    expect(legacy.status).toBe(400);
    expect(legacy.json.error.code).toBe("ALREADY_SUBMITTED");
  });

  test("the list says a pupil has answered", async () => {
    const { formId, questions } = await createForm(true);
    const cookie = await portalCookie(pupils[0]!.admissionNo);
    await submit(pupils[0]!, formId, questions, cookie);
    const list = await api(`/api/v1/portal/students/${pupils[0]!.id}/forms/questionnaires`, { cookie });
    expect(list.json.data.questionnaires[0].hasSubmitted).toBe(true);
    const other = await api(`/api/v1/portal/students/${pupils[1]!.id}/forms/questionnaires`, { cookie: await portalCookie(pupils[1]!.admissionNo) });
    expect(other.json.data.questionnaires[0].hasSubmitted).toBe(false);
  });

  test("a questionnaire that is not anonymous keeps the pupil's id and the time", async () => {
    const { formId, questions } = await createForm(false);
    expect((await submit(pupils[0]!, formId, questions)).status).toBe(200);
    const participation = await db.formParticipation.findFirstOrThrow({ where: { formId } });
    expect(participation.respondentId).toBe(pupils[0]!.id);
    expect((await db.formResponse.findFirstOrThrow({ where: { formId } })).studentId).toBe(pupils[0]!.id);
  });

  test("answers sent twice at the same moment give one answer and no server error", async () => {
    const { formId, questions } = await createForm(true);
    const cookie = await portalCookie(pupils[0]!.admissionNo);
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => submit(pupils[0]!, formId, questions, cookie)));
    expect(results.map((r) => r.status).filter((s) => s >= 500)).toEqual([]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await db.formResponse.count({ where: { formId } })).toBe(1);
  });
});

test.describe("a summary of a few answers is not shown", () => {
  const analytics = (formId: string) => api(`/api/v1/forms/${formId}/analytics?branchId=${home.id}`, { cookie: teacherCookie });

  test("one answer to an anonymous questionnaire shows the count and nothing else", async () => {
    const { formId, questions } = await createForm(true);
    await submit(pupils[0]!, formId, questions);
    const res = await analytics(formId);
    expect(res.status).toBe(200);
    const a = res.json.data.analytics;
    expect(a.totalResponses).toBe(1);
    expect(a.suppressed).toBe(true);
    expect(a.minimumResponses).toBe(5);
    expect(JSON.stringify(a)).not.toContain("I like the library");
    for (const q of a.questions) {
      expect(q.optionCounts ?? []).toEqual([]);
      expect(q.textResponses ?? []).toEqual([]);
    }
  });

  test("with enough answers the summary is shown", async () => {
    const { formId, questions } = await createForm(true);
    for (const pupil of pupils.slice(0, 5)) expect((await submit(pupil, formId, questions)).status).toBe(200);
    const a = (await analytics(formId)).json.data.analytics;
    expect(a.totalResponses).toBe(5);
    expect(a.suppressed).toBeFalsy();
    expect(a.questions[0].optionCounts.find((o: { optionId: string }) => o.optionId === "MATH").count).toBe(5);
    expect(a.questions[1].textResponses).toHaveLength(5);
  });

  test("a questionnaire that is not anonymous is not held back", async () => {
    const { formId, questions } = await createForm(false);
    await submit(pupils[0]!, formId, questions);
    const a = (await analytics(formId)).json.data.analytics;
    expect(a.suppressed).toBeFalsy();
    expect(a.questions[1].textResponses).toEqual(["I like the library."]);
  });
});
