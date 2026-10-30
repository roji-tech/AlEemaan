import "../support/env";
import { test, expect } from "@playwright/test";
import { FormKind, FormStatus, Gender, Role } from "@prisma/client";
import { createUser, db, DEFAULT_PASSWORD, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Non-teaching staff keep the question bank, the list of forms and the reports, but read no results, answers or turn-ins of a form unless an administrator gives them
// CAN_VIEW_FORM_RESULTS. The grant is READ only (never the answer key, never a write), belongs to one staff membership of one branch, is given by an administrator of that branch with a
// fresh proof, and is taken away by a move to another branch or a role that is not staff. The same capability exists in Octalve Edu.

const GRANT = "CAN_VIEW_FORM_RESULTS";
const PUPIL_DOB = "2013-05-10";
const stepUp = { type: "password", value: DEFAULT_PASSWORD } as const;

let home: { id: string };
let other: { id: string };
let superAdmin: TestUser;
let branchAdmin: TestUser;
let creator: TestUser;
let clerk: TestUser; // non-teaching staff of home
let colleague: TestUser; // another teacher of home
let clerkElsewhere: TestUser; // non-teaching staff of the other branch
let ck: Record<string, string>;
let ids: { practice: string; questionnaire: string; paper: string; response: string; membership: string };

const cookieFor = async (user: TestUser) => {
  const res = await loginAs(user);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
};
const grantOf = (userId: string, branchId = home.id) =>
  db.membership.findFirstOrThrow({ where: { userId, branchId }, select: { id: true, permissions: true } });
const member = async (user: TestUser, role: Role, branchId: string) =>
  (await db.membership.findFirst({ where: { userId: user.id, branchId } })) ??
  db.membership.create({ data: { userId: user.id, branchId, role } });

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  superAdmin = await createUser({ role: Role.ADMIN });
  branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false });
  creator = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false });
  colleague = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false });
  clerk = await createUser({ role: Role.NON_TEACHING_STAFF, superAdmin: false });
  clerkElsewhere = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: clerkElsewhere.id, branchId: other.id, role: Role.NON_TEACHING_STAFF } });
  ck = {
    super: await cookieFor(superAdmin),
    admin: await cookieFor(branchAdmin),
    creator: await cookieFor(creator),
    colleague: await cookieFor(colleague),
    clerk: await cookieFor(clerk),
    clerkElsewhere: await cookieFor(clerkElsewhere),
  };

  const student = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Amina",
      lastName: "Pupil",
      gender: Gender.FEMALE,
      dateOfBirth: new Date(PUPIL_DOB),
      admissionNo: "2026/0001",
      guardianPhone: "+2348011110001",
    },
  });
  const practice = await db.form.create({
    data: { branchId: home.id, kind: FormKind.PRACTICE_SET, title: "Soil practice", status: FormStatus.PUBLISHED, createdById: creator.id },
  });
  const question = await db.formQuestion.create({
    data: {
      branchId: home.id,
      formId: practice.id,
      prompt: "Name a cereal crop.",
      questionType: "SHORT",
      correctAnswer: "maize",
      points: 2,
      sortOrder: 1,
    },
  });
  const response = await db.formResponse.create({
    data: {
      branchId: home.id,
      formId: practice.id,
      studentId: student.id,
      status: "COMPLETED",
      submittedAt: new Date(),
      score: 0,
      maxScore: 2,
      markingStatus: "PENDING",
    },
  });
  await db.formAnswer.create({
    data: { branchId: home.id, responseId: response.id, formQuestionId: question.id, value: "rice", isCorrect: false, score: 0 },
  });
  const questionnaire = await db.form.create({
    data: {
      branchId: home.id,
      kind: FormKind.QUESTIONNAIRE,
      title: "Feedback",
      status: FormStatus.PUBLISHED,
      createdById: creator.id,
      isAnonymous: false,
    },
  });
  const paper = await db.form.create({
    data: { branchId: home.id, kind: FormKind.PAPER_WORK, title: "Holiday work", status: FormStatus.PUBLISHED, createdById: creator.id },
  });
  ids = {
    practice: practice.id,
    questionnaire: questionnaire.id,
    paper: paper.id,
    response: response.id,
    membership: (await grantOf(clerk.id)).id,
  };
});
test.afterAll(async () => {
  await resetDatabase();
});

const give = (cookie: string, membership: string, on: boolean, withProof = true) =>
  api(`/api/v1/members/${membership}`, { method: "PATCH", cookie, body: { canViewFormResults: on, ...(withProof ? { stepUp } : {}) } });
const reads = (cookie: string) => ({
  responses: api(`/api/v1/forms/${ids.practice}/responses?branchId=${home.id}`, { cookie }),
  queue: api(`/api/v1/forms/${ids.practice}/marking-queue?branchId=${home.id}`, { cookie }),
  marking: api(`/api/v1/forms/${ids.practice}/responses/${ids.response}/marking?branchId=${home.id}`, { cookie }),
  analytics: api(`/api/v1/forms/${ids.questionnaire}/analytics?branchId=${home.id}`, { cookie }),
  turnIns: api(`/api/v1/forms/${ids.paper}/turn-ins?branchId=${home.id}`, { cookie }),
});
const statuses = async (cookie: string) => {
  const r = reads(cookie);
  return {
    responses: (await r.responses).status,
    queue: (await r.queue).status,
    marking: (await r.marking).status,
    analytics: (await r.analytics).status,
    turnIns: (await r.turnIns).status,
  };
};

test.describe.serial("the grant", () => {
  test("without it, non-teaching staff read no results, answers or turn-ins (the strict default is unchanged)", async () => {
    expect(await statuses(ck.clerk)).toEqual({ responses: 404, queue: 404, marking: 404, analytics: 404, turnIns: 404 });
    expect(await statuses(ck.colleague)).toEqual({ responses: 404, queue: 404, marking: 404, analytics: 404, turnIns: 404 });
    expect(await statuses(ck.creator)).toEqual({ responses: 200, queue: 200, marking: 200, analytics: 200, turnIns: 200 });
  });

  test("a wrong proof gives nothing: the route checks the proof, not only that one was sent", async () => {
    const wrong = await api(`/api/v1/members/${ids.membership}`, {
      method: "PATCH",
      cookie: ck.admin,
      body: { canViewFormResults: true, stepUp: { type: "password", value: "not-the-password" } },
    });
    expect(wrong.status).toBe(403);
    expect((await grantOf(clerk.id)).permissions).not.toContain(GRANT);
    expect(await statuses(ck.clerk)).toEqual({ responses: 404, queue: 404, marking: 404, analytics: 404, turnIns: 404 });
  });

  test("an administrator of the branch gives it with a fresh proof; it is audited and shown in the member", async () => {
    expect((await give(ck.admin, ids.membership, true, false)).status).toBe(400); // no proof, nothing changes
    expect((await grantOf(clerk.id)).permissions).not.toContain(GRANT);
    const res = await give(ck.admin, ids.membership, true);
    expect(res.status).toBe(200);
    expect(res.json.data.member.canViewFormResults).toBe(true);
    expect((await grantOf(clerk.id)).permissions).toContain(GRANT);
    const audit = await db.auditLog.findMany({ where: { action: "MEMBER_PERMISSIONS_CHANGED", targetId: ids.membership } });
    expect(audit.some((row) => JSON.stringify(row.afterValue).includes('"canViewFormResults":true'))).toBe(true);
    expect((await give(ck.admin, ids.membership, true)).json.data.changed).toBe(false); // the same again writes nothing
  });

  test("with it, the holder reads the results, answers and turn-ins of the branch's forms", async () => {
    expect(await statuses(ck.clerk)).toEqual({ responses: 200, queue: 200, marking: 200, analytics: 200, turnIns: 200 });
  });

  test("but it is read only: the answer key stays hidden, and nothing can be written, closed, marked or printed with the key", async () => {
    const marking = await reads(ck.clerk).marking;
    expect(JSON.stringify(marking.json)).toContain("rice"); // the pupil's answer
    expect(JSON.stringify(marking.json)).not.toContain("maize"); // the key
    const mark = await api(`/api/v1/forms/${ids.practice}/responses/${ids.response}/marking`, {
      method: "PATCH",
      cookie: ck.clerk,
      body: { branchId: home.id, answerId: "x", score: 1 },
    });
    expect([403, 404]).toContain(mark.status);
    expect(
      (await api(`/api/v1/forms/${ids.practice}/close`, { method: "POST", cookie: ck.clerk, body: { branchId: home.id } })).status,
    ).toBeGreaterThanOrEqual(403);
    expect(
      (await api(`/api/v1/forms/${ids.practice}`, { method: "PATCH", cookie: ck.clerk, body: { branchId: home.id, title: "Changed" } }))
        .status,
    ).toBeGreaterThanOrEqual(403);
    expect(
      (
        await api(`/api/v1/forms/${ids.practice}/print`, {
          method: "POST",
          cookie: ck.clerk,
          body: { branchId: home.id, includeAnswerKey: true, format: "json" },
        })
      ).status,
    ).toBeGreaterThanOrEqual(403);
    expect((await db.form.findUniqueOrThrow({ where: { id: ids.practice } })).title).toBe("Soil practice");
    expect((await db.form.findUniqueOrThrow({ where: { id: ids.practice } })).status).toBe(FormStatus.PUBLISHED);
  });

  test("it does not leak across branches: the holder's own forms only, and a holder elsewhere reaches nothing here", async () => {
    await member(clerkElsewhere, Role.NON_TEACHING_STAFF, other.id);
    const elsewhere = await grantOf(clerkElsewhere.id, other.id);
    expect((await give(ck.super, elsewhere.id, true)).status).toBe(200);
    expect(await statuses(ck.clerkElsewhere)).toEqual({ responses: 404, queue: 404, marking: 404, analytics: 404, turnIns: 404 }); // the forms are home's
  });

  test("a branch administrator cannot give it for a branch they do not administer, and a pupil or parent role cannot hold it", async () => {
    const elsewhere = await grantOf(clerkElsewhere.id, other.id);
    expect([403, 404]).toContain((await give(ck.admin, elsewhere.id, false)).status);
    const pupil = await createUser({ role: Role.STUDENT, superAdmin: false });
    const pupilMembership = await grantOf(pupil.id);
    const refused = await give(ck.admin, pupilMembership.id, true);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("NOT_STAFF_ROLE");
    expect((await grantOf(pupil.id)).permissions).not.toContain(GRANT);
  });

  test("a move to another branch takes it away, and so does a role that is not staff", async () => {
    const mover = await createUser({ role: Role.NON_TEACHING_STAFF, superAdmin: false });
    const moverMembership = await grantOf(mover.id);
    expect((await give(ck.super, moverMembership.id, true)).status).toBe(200);
    const moved = await api(`/api/v1/members/${moverMembership.id}`, { method: "PATCH", cookie: ck.super, body: { branchId: other.id } });
    expect(moved.status).toBe(200);
    expect(moved.json.data.member.canViewFormResults).toBe(false);
    expect((await db.membership.findUniqueOrThrow({ where: { id: moverMembership.id } })).permissions).not.toContain(GRANT);

    const demoted = await createUser({ role: Role.NON_TEACHING_STAFF, superAdmin: false });
    const demotedMembership = await grantOf(demoted.id);
    await give(ck.super, demotedMembership.id, true);
    const changed = await api(`/api/v1/members/${demotedMembership.id}`, {
      method: "PATCH",
      cookie: ck.super,
      body: { role: Role.STUDENT },
    });
    expect(changed.status).toBe(200);
    expect((await db.membership.findUniqueOrThrow({ where: { id: demotedMembership.id } })).permissions).not.toContain(GRANT);
  });

  test("taking it away stops the reading at once, and taking it away from someone who never had it changes nothing", async () => {
    // a wrong proof cannot take it away either: the grant stays and the holder still reads
    const wrong = await api(`/api/v1/members/${ids.membership}`, {
      method: "PATCH",
      cookie: ck.admin,
      body: { canViewFormResults: false, stepUp: { type: "password", value: "not-the-password" } },
    });
    expect(wrong.status).toBe(403);
    expect((await grantOf(clerk.id)).permissions).toContain(GRANT);
    expect((await give(ck.admin, ids.membership, false)).status).toBe(200);
    expect(await statuses(ck.clerk)).toEqual({ responses: 404, queue: 404, marking: 404, analytics: 404, turnIns: 404 });
    expect((await give(ck.admin, ids.membership, false)).json.data.changed).toBe(false);
  });

  test("the grant sits next to the results-approval right without touching it", async () => {
    const both = await createUser({ role: Role.TEACHING_STAFF, superAdmin: false });
    const membership = await grantOf(both.id);
    expect(
      (
        await api(`/api/v1/members/${membership.id}`, {
          method: "PATCH",
          cookie: ck.super,
          body: { canApproveResults: true, canViewFormResults: true, stepUp },
        })
      ).status,
    ).toBe(200);
    expect((await grantOf(both.id)).permissions.sort()).toEqual(["CAN_APPROVE_RESULTS", GRANT].sort());
    expect((await give(ck.super, membership.id, false)).status).toBe(200);
    expect((await grantOf(both.id)).permissions).toEqual(["CAN_APPROVE_RESULTS"]);
  });
});
