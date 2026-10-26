import "../support/env";
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { DEFAULT_PORTAL_ACCESS, PORTAL_ACCESS_KEY, type PortalAccess } from "@/lib/portal/access";
import { PORTAL_COOKIE_NAME } from "@/lib/portal/auth";
import { portalSecret } from "@/lib/portal/secret";

// Who is acting in the portal, and what each may do (task 0040). The date of birth signs in a PUPIL; the guardian's phone, e-mail or a link signs in a GUARDIAN. What each may do is
// a setting of the pupil's branch (Settings, Portal access), with the maintainer's table as the default. Every portal route checks it on every request.

let home: { id: string };
let otherBranch: { id: string };
let ids: { s1: string; s2: string; stranger: string; assignment: string; quiz: string; q1: string };
let superAdmin: TestUser;
let superCookie: string;

const DOB = "2013-05-10";
const PHONE = "08011110001"; // +2348011110001 (both children)
const EMAIL = "family@example.com";
const URL = "/api/v1/portal";

const signIn = (secret: string, admissionNo = "2026/0001") => api(`${URL}/session`, { body: { admissionNo, secret } });
const cookieOf = async (secret: string, admissionNo?: string) => {
  const res = await signIn(secret, admissionNo);
  expect(res.status, res.text).toBe(200);
  return res.setCookies[0]!.split(";")[0]!;
};
const pupil = () => cookieOf(DOB);
const guardian = () => cookieOf(PHONE);

const setAccess = (access: PortalAccess, branchId = home.id) =>
  api("/api/v1/settings/portal-access", { method: "PATCH", cookie: superCookie, body: { branchId, access } });
const withChange = (change: (value: PortalAccess) => void): PortalAccess => {
  const value: PortalAccess = JSON.parse(JSON.stringify(DEFAULT_PORTAL_ACCESS));
  change(value);
  return value;
};

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  otherBranch = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
  superAdmin = await createUser({ name: "Sue Superadmin", role: Role.ADMIN });
  superCookie = cookieHeader((await loginAs(superAdmin)).token!);

  const session = await db.academicSession.create({
    data: { branchId: home.id, label: "2026/2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-07-20"), status: "ACTIVE" },
  });
  const period = await db.academicPeriod.create({
    data: { branchId: home.id, sessionId: session.id, ordinal: 1, label: "1st Term", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-15"), isCurrent: true },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1" } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "Gold" } });
  const mk = (admissionNo: string, firstName: string, dateOfBirth: string, phone: string, email: string | null) =>
    db.studentRecord.create({
      data: { branchId: home.id, firstName, lastName: "Pupil", gender: Gender.FEMALE, dateOfBirth: new Date(dateOfBirth), admissionNo, guardianPhone: phone, guardianEmail: email },
    });
  const s1 = await mk("2026/0001", "Amina", DOB, "+2348011110001", EMAIL);
  const s2 = await mk("2026/0002", "Binta", "2015-02-03", "+2348011110001", EMAIL); // a sibling: the same guardian contact
  const stranger = await mk("2026/0003", "Cara", "2012-01-01", "+2348099990003", null);
  for (const s of [s1, s2, stranger]) {
    await db.studentEnrollment.create({
      data: { studentId: s.id, branchId: home.id, sessionId: session.id, className: "JSS 1", arm: "Gold", classArmId: arm.id, status: "ACTIVE" },
    });
  }
  await db.invoice.create({
    data: { branchId: home.id, studentId: s1.id, periodId: period.id, invoiceNo: "INV-2026-0001", totalAmount: 45000, amountPaid: 20000, status: "PARTIALLY_PAID" },
  });
  const subject = await db.subject.create({ data: { branchId: home.id, name: "Civic", code: "CIV" } });
  const assignment = await db.assignment.create({
    data: { branchId: home.id, subjectId: subject.id, title: "Essay", status: "PUBLISHED", dueDate: new Date(Date.now() + 864e5) },
  });
  const quiz = await db.quiz.create({ data: { branchId: home.id, subjectId: subject.id, title: "Week 1", status: "PUBLISHED", passingScore: 50 } });
  const q1 = await db.quizQuestion.create({
    data: {
      branchId: home.id,
      quizId: quiz.id,
      prompt: "2+2?",
      questionType: "MULTIPLE_CHOICE",
      options: [
        { id: "A", text: "3" },
        { id: "B", text: "4" },
      ],
      correctAnswer: "B",
      points: 1,
    },
  });
  ids = { s1: s1.id, s2: s2.id, stranger: stranger.id, assignment: assignment.id, quiz: quiz.id, q1: q1.id };
});

test.describe("who signed in", () => {
  test("the date of birth is a pupil; a phone number, an e-mail address and a link are a guardian", async () => {
    const byDob = await signIn(DOB);
    expect(byDob.json.data.actor).toBe("PUPIL");
    expect((await signIn(PHONE)).json.data.actor).toBe("GUARDIAN");
    expect((await signIn(EMAIL)).json.data.actor).toBe("GUARDIAN");

    const raw = "magic-link-token-1234567890abcdefghij";
    await db.guardianLinkToken.create({
      data: { branchId: home.id, studentId: ids.s1, action: "portal_access", tokenHash: crypto.createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 864e5), channel: "SMS" },
    });
    const byLink = await api(`${URL}/session`, { body: { token: raw } });
    expect(byLink.status, byLink.text).toBe(200);
    expect(byLink.json.data.actor).toBe("GUARDIAN");
  });

  test("the session says who it is and what it may do for each pupil; a pupil sees only themselves, a guardian sees every linked child", async () => {
    const asPupil = await api(`${URL}/session`, { cookie: await pupil() });
    expect(asPupil.json.data.actor).toBe("PUPIL");
    expect(asPupil.json.data.students.map((s: { id: string }) => s.id)).toEqual([ids.s1]);
    expect(asPupil.json.data.access[ids.s1]).toEqual(DEFAULT_PORTAL_ACCESS.pupil);

    const asGuardian = await api(`${URL}/session`, { cookie: await guardian() });
    expect(asGuardian.json.data.actor).toBe("GUARDIAN");
    expect(asGuardian.json.data.students.map((s: { id: string }) => s.id).sort()).toEqual([ids.s1, ids.s2].sort());
    expect(asGuardian.json.data.access[ids.s2]).toEqual(DEFAULT_PORTAL_ACCESS.guardian);
  });

  test("a cookie signed before the actor existed is a guardian's", async () => {
    const now = Math.floor(Date.now() / 1000);
    // signed the way the previous release did: the same secret, a payload with no `actor`
    const legacy = { primaryStudentId: ids.s1, allowedStudentIds: [ids.s1, ids.s2], issuedAt: now, expiresAt: now + 3600 };
    const serialized = Buffer.from(JSON.stringify(legacy)).toString("base64url");
    const token = `${serialized}.${crypto.createHmac("sha256", portalSecret()).update(serialized).digest("base64url")}`;
    const cookie = `${PORTAL_COOKIE_NAME}=${token}`;
    const session = await api(`${URL}/session`, { cookie });
    expect(session.status).toBe(200);
    expect(session.json.data.actor).toBe("GUARDIAN");
    expect((await api(`${URL}/students/${ids.s1}/invoices`, { cookie })).status).toBe(200);
    expect((await api(`${URL}/students/${ids.s1}/assignments/${ids.assignment}/submission`, { method: "POST", cookie, body: { content: "x", attachments: [] } })).status).toBe(403);
  });
});

test.describe("the defaults, route by route", () => {
  test("a pupil: overview, results and coursework yes; invoices no; siblings no; fee totals absent from what they do get", async () => {
    const cookie = await pupil();
    expect((await api(`${URL}/students/${ids.s1}/overview`, { cookie })).status).toBe(200);
    const overview = await api(`${URL}/students/${ids.s1}/overview`, { cookie });
    expect(overview.json.data.finance, "no fee total for a pupil").toBeUndefined();
    expect(JSON.stringify(overview.json.data)).not.toContain("45000");
    expect((await api(`${URL}/students/${ids.s1}/results`, { cookie })).status).toBe(200);
    expect((await api(`${URL}/students/${ids.s1}/lms`, { cookie })).status).toBe(200);

    const invoices = await api(`${URL}/students/${ids.s1}/invoices`, { cookie });
    expect(invoices.status).toBe(403);
    expect(invoices.json.error.code).toBe("PORTAL_ACCESS");
    expect(JSON.stringify(invoices.json)).not.toContain("INV-2026-0001");
    // a sibling is not theirs, whatever the guardian contact says
    expect((await api(`${URL}/students/${ids.s2}/overview`, { cookie })).status).toBe(403);
  });

  test("a guardian: overview, results, invoices, coursework and every linked child; no hand-in, no quiz, and no quiz questions to read", async () => {
    const cookie = await guardian();
    for (const student of [ids.s1, ids.s2]) {
      for (const area of ["overview", "results", "invoices", "lms"]) {
        expect((await api(`${URL}/students/${student}/${area}`, { cookie })).status, `${area} of ${student}`).toBe(200);
      }
    }
    const overview = await api(`${URL}/students/${ids.s1}/overview`, { cookie });
    expect(overview.json.data.finance.outstandingBalance).toBe(25000);
    expect((await api(`${URL}/students/${ids.stranger}/overview`, { cookie })).status).toBe(403);

    const lms = await api(`${URL}/students/${ids.s1}/lms`, { cookie });
    expect(lms.json.data.assignments.map((a: { title: string }) => a.title)).toEqual(["Essay"]);
    expect(lms.json.data.quizzes).toEqual([]);

    const hand = await api(`${URL}/students/${ids.s1}/assignments/${ids.assignment}/submission`, { method: "POST", cookie, body: { content: "I did it for her", attachments: [] } });
    expect(hand.status).toBe(403);
    expect(hand.json.error.code).toBe("PORTAL_ACCESS");
    const attempt = await api(`${URL}/students/${ids.s1}/quizzes/${ids.quiz}/attempt`, { method: "POST", cookie, body: { answers: [{ questionId: ids.q1, answer: "B" }] } });
    expect(attempt.status).toBe(403);
    expect(await db.assignmentSubmission.count()).toBe(0);
    expect(await db.quizAttempt.count()).toBe(0);
  });

  test("a pupil hands in work and takes the quiz; the one message is the same for every refusal", async () => {
    const cookie = await pupil();
    const hand = await api(`${URL}/students/${ids.s1}/assignments/${ids.assignment}/submission`, { method: "POST", cookie, body: { content: "My essay", attachments: [] } });
    expect(hand.status, hand.text).toBe(201);
    const lms = await api(`${URL}/students/${ids.s1}/lms`, { cookie });
    expect(lms.json.data.quizzes).toHaveLength(1);
    const attempt = await api(`${URL}/students/${ids.s1}/quizzes/${ids.quiz}/attempt`, { method: "POST", cookie, body: { answers: [{ questionId: ids.q1, answer: "B" }] } });
    expect(attempt.status, attempt.text).toBe(201);

    const refused = [
      await api(`${URL}/students/${ids.s1}/invoices`, { cookie }),
      await api(`${URL}/students/${ids.s2}/invoices`, { cookie }), // a sibling
    ];
    expect(refused.map((r) => r.status)).toEqual([403, 403]);
    expect(refused[0].json.error.message).toBe("Your sign-in does not include this.");
  });

  test("no session is still 401, and a pupil the sign-in does not reach is still 403 before anything else is said", async () => {
    expect((await api(`${URL}/students/${ids.s1}/invoices`)).status).toBe(401);
    expect((await api(`${URL}/students/${ids.stranger}/invoices`, { cookie: await guardian() })).status).toBe(403);
  });
});

test.describe("the fee gate on report cards", () => {
  test("with unpaid report cards blocked, a guardian is told the amount; a pupil is told it is not available yet and is told no amount", async () => {
    await db.settingValue.create({ data: { scope: "GLOBAL", key: "block_unpaid_report_cards", value: true, status: "APPROVED" } });
    const asGuardian = await api(`${URL}/students/${ids.s1}/results`, { cookie: await guardian() });
    expect(asGuardian.json.data.blockedByUnpaidFees).toBe(true);
    expect(asGuardian.json.data.outstandingBalance).toBe(25000);

    const asPupil = await api(`${URL}/students/${ids.s1}/results`, { cookie: await pupil() });
    expect(asPupil.json.data.blockedByUnpaidFees).toBe(true);
    expect(asPupil.json.data.outstandingBalance).toBeUndefined();
    expect(JSON.stringify(asPupil.json.data)).not.toMatch(/25,?000|₦/);
    expect(asPupil.json.data.message).toContain("not available yet");
  });
});

test.describe("the setting decides, and it applies at once", () => {
  test("turning invoices on for a pupil opens them for a pupil who is already signed in; turning them off closes them again", async () => {
    const cookie = await pupil();
    expect((await api(`${URL}/students/${ids.s1}/invoices`, { cookie })).status).toBe(403);
    const on = await setAccess(withChange((v) => (v.pupil.invoices = true)));
    expect(on.status, on.text).toBe(200);
    expect((await api(`${URL}/students/${ids.s1}/invoices`, { cookie })).status).toBe(200);
    expect((await api(`${URL}/students/${ids.s1}/overview`, { cookie })).json.data.finance.outstandingBalance).toBe(25000);
    await setAccess(DEFAULT_PORTAL_ACCESS);
    expect((await api(`${URL}/students/${ids.s1}/invoices`, { cookie })).status).toBe(403);
  });

  test("letting a guardian take the quiz opens the hand-in and the quiz for them", async () => {
    await setAccess(withChange((v) => ((v.guardian.submitWork = true), (v.guardian.takeQuizzes = true))));
    const cookie = await guardian();
    expect((await api(`${URL}/students/${ids.s1}/assignments/${ids.assignment}/submission`, { method: "POST", cookie, body: { content: "x", attachments: [] } })).status).toBe(201);
    expect((await api(`${URL}/students/${ids.s1}/lms`, { cookie })).json.data.quizzes).toHaveLength(1);
  });

  test("siblings are switched off for a guardian: a sign-in then reaches only the pupil, and a sign-in made earlier is cut back at once", async () => {
    const before = await guardian(); // signed in while siblings were allowed
    expect((await api(`${URL}/students/${ids.s2}/overview`, { cookie: before })).status).toBe(200);
    await setAccess(withChange((v) => (v.guardian.siblings = false)));
    expect((await api(`${URL}/students/${ids.s2}/overview`, { cookie: before })).status).toBe(403);
    expect((await api(`${URL}/students/${ids.s1}/overview`, { cookie: before })).status).toBe(200);
    const session = await api(`${URL}/session`, { cookie: before });
    expect(session.json.data.students.map((s: { id: string }) => s.id)).toEqual([ids.s1]);
    const fresh = await signIn(PHONE);
    expect(fresh.json.data.siblingStudents.map((s: { id: string }) => s.id)).toEqual([ids.s1]);
  });

  test("the setting of the pupil's own branch is the one that applies: another branch's setting changes nothing here", async () => {
    await setAccess(withChange((v) => (v.pupil.invoices = true)), otherBranch.id);
    expect((await api(`${URL}/students/${ids.s1}/invoices`, { cookie: await pupil() })).status).toBe(403);
  });

  test("turning a section off removes it for that person and leaves the others alone", async () => {
    await setAccess(withChange((v) => (v.guardian.results = false)));
    const cookie = await guardian();
    expect((await api(`${URL}/students/${ids.s1}/results`, { cookie })).status).toBe(403);
    expect((await api(`${URL}/students/${ids.s1}/overview`, { cookie })).status).toBe(200);
    expect((await api(`${URL}/students/${ids.s1}/results`, { cookie: await pupil() })).status).toBe(200);
  });
});

test.describe("the settings API", () => {
  test("a superadmin reads the default for a branch with none stored, saves a value, and reads it back with the history", async () => {
    const read = await api(`/api/v1/settings/portal-access?branchId=${home.id}`, { cookie: superCookie });
    expect(read.status, read.text).toBe(200);
    expect(read.json.data.access).toEqual(DEFAULT_PORTAL_ACCESS);
    expect(read.json.data.history).toEqual([]);

    const value = withChange((v) => ((v.pupil.invoices = true), (v.guardian.practice = "FULL")));
    const saved = await setAccess(value);
    expect(saved.status, saved.text).toBe(200);
    expect(saved.json.data.changed).toBe(true);
    expect(saved.json.data.widening).toBe(true);
    const again = await api(`/api/v1/settings/portal-access?branchId=${home.id}`, { cookie: superCookie });
    expect(again.json.data.access).toEqual(value);
    expect(again.json.data.history).toHaveLength(1);
    expect(again.json.data.history[0]).toMatchObject({ by: "Sue Superadmin", widening: true });
  });

  test("every change is audited with who and what, in the same step; a change that gives more is marked; saving the same value again writes nothing", async () => {
    const widen = withChange((v) => (v.pupil.invoices = true));
    expect((await setAccess(widen)).status).toBe(200);
    const narrow = withChange((v) => (v.pupil.invoices = false));
    expect((await setAccess(narrow)).status).toBe(200);
    expect((await setAccess(narrow)).json.data.changed).toBe(false);
    const rows = await db.settingAudit.findMany({ where: { settingKey: PORTAL_ACCESS_KEY, branchId: home.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["CHANGED_WIDENING", "CHANGED"]);
    expect(rows.every((r) => r.actorUserId === superAdmin.id)).toBe(true);
    expect((rows[0].oldValue as unknown as PortalAccess).pupil.invoices).toBe(false);
    expect((rows[0].newValue as unknown as PortalAccess).pupil.invoices).toBe(true);
  });

  test("only a superadmin: a branch administrator, a teacher and a signed-out caller are refused, and nothing is stored", async () => {
    const branchAdmin = await createUser({ superAdmin: false, role: Role.ADMIN });
    const teacher = await createUser({ superAdmin: false, role: Role.TEACHING_STAFF });
    const body = { branchId: home.id, access: withChange((v) => (v.pupil.invoices = true)) };
    for (const who of [branchAdmin, teacher]) {
      const cookie = cookieHeader((await loginAs(who)).token!);
      expect((await api("/api/v1/settings/portal-access", { method: "PATCH", cookie, body })).status).toBe(403);
      expect((await api(`/api/v1/settings/portal-access?branchId=${home.id}`, { cookie })).status).toBe(403);
    }
    expect((await api("/api/v1/settings/portal-access", { method: "PATCH", body })).status).toBe(401);
    expect(await db.settingValue.count({ where: { key: PORTAL_ACCESS_KEY } })).toBe(0);
  });

  test("what is refused: a missing key, an unknown key, a wrong type, an actor with nothing, work without coursework, an unknown branch, a bad id", async () => {
    const good = withChange((v) => (v.pupil.invoices = true));
    const patch = (body: unknown) => api("/api/v1/settings/portal-access", { method: "PATCH", cookie: superCookie, body });
    const missing = JSON.parse(JSON.stringify(good));
    delete missing.pupil.siblings;
    expect((await patch({ branchId: home.id, access: missing })).status).toBe(400);
    expect((await patch({ branchId: home.id, access: { ...good, admin: good.pupil } })).status).toBe(400);
    expect((await patch({ branchId: home.id, access: { ...good, pupil: { ...good.pupil, invoices: "yes" } } })).status).toBe(400);
    expect((await patch({ branchId: home.id, access: good, extra: 1 })).status).toBe(400);
    const empty = withChange((v) => Object.assign(v.guardian, { overview: false, results: false, invoices: false, materials: false, submitWork: false, takeQuizzes: false }));
    const nothing = await patch({ branchId: home.id, access: empty });
    expect(nothing.status).toBe(400);
    expect(JSON.stringify(nothing.json)).toContain("at least one section");
    const work = withChange((v) => Object.assign(v.pupil, { materials: false }));
    expect((await patch({ branchId: home.id, access: work })).status).toBe(400);
    expect((await patch({ branchId: "no-such-branch", access: good })).status).toBe(404);
    expect((await patch({ branchId: "bad id!", access: good })).status).toBe(400);
    expect((await api("/api/v1/settings/portal-access?branchId=%00", { cookie: superCookie })).status).toBe(400);
    expect(await db.settingValue.count({ where: { key: PORTAL_ACCESS_KEY } })).toBe(0);
  });

  test("a damaged stored value never breaks the portal: it reads as the default", async () => {
    await db.settingValue.create({ data: { scope: "BRANCH", branchId: home.id, key: PORTAL_ACCESS_KEY, value: { pupil: "yes", guardian: [1, 2] }, status: "APPROVED" } });
    const cookie = await pupil();
    expect((await api(`${URL}/students/${ids.s1}/overview`, { cookie })).status).toBe(200);
    expect((await api(`${URL}/students/${ids.s1}/invoices`, { cookie })).status).toBe(403);
  });
});
