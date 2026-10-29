import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance, type TestUser } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// What a guardian sees of a child's practice has two controls that are NOT the same decision: the branch's own level (`portal_access.guardian.practice`, task 0040: what this
// branch gives its guardians) and a school-wide CEILING (`bank.parents.view`, the question bank's switch: the most any guardian anywhere may see). The lower of the two applies.
// The ceiling starts at a summary, so the child's practice IN FULL (their questions and answers) takes two deliberate steps; it holds the guardian only, never the pupil.

const PUPIL_DOB = "2013-05-10";
const GUARDIAN_PHONE = "+2348011110001";
const SETTINGS = "/api/v1/question-bank/settings";
const PORTAL_ACCESS = "/api/v1/settings/portal-access";
const PROMPT = "What is the powerhouse of the cell?";

const portalCookie = async (admissionNo: string, secret: string) => {
  const res = await api("/api/v1/portal/session", { body: { admissionNo, secret } });
  expect(res.status).toBe(200);
  return { cookie: res.setCookies[0]!.split(";")[0]!, json: res.json };
};

let home: { id: string };
let student: { id: string; admissionNo: string };
let superAdmin: TestUser;
let superCookie: string;
let branchAdmin: TestUser;
let branchCookie: string;

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  superAdmin = await createUser({ role: Role.ADMIN });
  superCookie = cookieHeader((await loginAs(superAdmin)).token!);
  branchAdmin = await createUser({ role: Role.ADMIN, superAdmin: false });
  branchCookie = cookieHeader((await loginAs(branchAdmin)).token!);

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
      prompt: PROMPT,
      explanation: "Mitochondria make the energy.",
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
      submittedById: superAdmin.id,
      approvedById: superAdmin.id,
      approvedAt: new Date(),
    },
  });
  const session = await db.practiceSession.create({
    data: {
      branchId: home.id,
      studentId: student.id,
      subjectLabel: "Biology",
      topic: "Cell Structure",
      size: 1,
      itemIds: [item.id],
      feedbackMode: "END",
      finishedAt: new Date(),
    },
  });
  await db.practiceAttempt.create({
    data: { sessionId: session.id, branchId: home.id, studentId: student.id, bankItemId: item.id, version: 1, answer: "B", correct: true },
  });
});

/// What THIS BRANCH gives guardians (and, for the control, pupils) for practice, stored the way the settings screen stores it.
const branchGives = (guardian: "NONE" | "SUMMARY" | "FULL", pupil: "NONE" | "SUMMARY" | "FULL" = "FULL") =>
  db.settingValue.upsert({
    where: { scope_branchId_key: { scope: "BRANCH", branchId: home.id, key: "portal_access" } },
    update: { value: { guardian: { practice: guardian }, pupil: { practice: pupil } }, status: "APPROVED" },
    create: {
      scope: "BRANCH",
      branchId: home.id,
      key: "portal_access",
      value: { guardian: { practice: guardian }, pupil: { practice: pupil } },
      status: "APPROVED",
    },
  });
/// The school-wide ceiling, written straight to the table (the route is tested on its own below).
const ceilingIs = (level: string) =>
  db.settingValue.create({ data: { scope: "GLOBAL", key: "bank.parents.view", value: level, status: "APPROVED" } });
const history = (cookie: string) => api(`/api/v1/portal/students/${student.id}/practice/history`, { cookie });

test.describe("what a guardian gets is the lower of the branch's level and the school-wide ceiling", () => {
  test("a branch that gives guardians the practice in full still gives a summary until the ceiling is raised", async () => {
    await branchGives("FULL");
    const guardian = await portalCookie(student.admissionNo, GUARDIAN_PHONE);
    const res = await history(guardian.cookie);
    expect(res.status).toBe(200);
    expect(res.json.data.mode).toBe("SUMMARY");
    expect(JSON.stringify(res.json.data)).not.toContain("powerhouse");
    expect(JSON.stringify(res.json.data)).not.toContain("Mitochondria");
  });

  test("with the ceiling raised to everything, the branch's level decides (control)", async () => {
    await ceilingIs("FULL");
    await branchGives("FULL");
    const res = await history((await portalCookie(student.admissionNo, GUARDIAN_PHONE)).cookie);
    expect(res.status).toBe(200);
    expect(res.json.data.mode).toBe("FULL");
    expect(JSON.stringify(res.json.data)).toContain("powerhouse");
  });

  test("the ceiling can only lower: a raised ceiling does not give more than the branch gives (control)", async () => {
    await ceilingIs("FULL");
    await branchGives("SUMMARY");
    const res = await history((await portalCookie(student.admissionNo, GUARDIAN_PHONE)).cookie);
    expect(res.json.data.mode).toBe("SUMMARY");
  });

  test("a ceiling of nothing shuts the guardian out of practice whatever the branch says", async () => {
    await ceilingIs("NONE");
    await branchGives("FULL");
    const guardian = await portalCookie(student.admissionNo, GUARDIAN_PHONE);
    const res = await history(guardian.cookie);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("PORTAL_ACCESS");
    expect((await api(`/api/v1/portal/students/${student.id}/practice/options`, { cookie: guardian.cookie })).status).toBe(403);
  });

  test("a branch's own, lower value is held to as well", async () => {
    await ceilingIs("FULL");
    await db.settingValue.create({
      data: { scope: "BRANCH", branchId: home.id, key: "bank.parents.view", value: "NONE", status: "APPROVED" },
    });
    await branchGives("FULL");
    expect((await history((await portalCookie(student.admissionNo, GUARDIAN_PHONE)).cookie)).status).toBe(403);
  });

  test("a stored value that is not one of the three is ignored, never trusted", async () => {
    await ceilingIs("EVERYTHING");
    await branchGives("FULL");
    const res = await history((await portalCookie(student.admissionNo, GUARDIAN_PHONE)).cookie);
    expect(res.json.data.mode).toBe("SUMMARY"); // the default ceiling applies
  });

  test("the portal's sign-in answer tells the guardian what applies, not what the branch stored", async () => {
    await ceilingIs("NONE");
    await branchGives("FULL");
    const guardian = await portalCookie(student.admissionNo, GUARDIAN_PHONE);
    expect(guardian.json.data.access[student.id].practice).toBe("NONE");
  });

  test("the pupil's own practice is not held by it", async () => {
    await ceilingIs("NONE");
    await branchGives("FULL", "FULL");
    const pupil = await portalCookie(student.admissionNo, PUPIL_DOB);
    const res = await history(pupil.cookie);
    expect(res.status).toBe(200);
    expect(res.json.data.mode).toBe("FULL");
    expect(pupil.json.data.access[student.id].practice).toBe("FULL");
  });
});

test.describe("the ceiling is a question bank switch like the others", () => {
  const put = (cookie: string, body: unknown) => api(SETTINGS, { method: "PUT", cookie, body });
  const effective = async (cookie: string, query = "") =>
    (await api(`${SETTINGS}${query}`, { cookie })).json.data.settings.find((s: { key: string }) => s.key === "bank.parents.view") as {
      kind: string;
      choices: Array<{ value: string }>;
      default: string;
      school: string;
      override: string | null;
      effective: string;
    };

  test("it is listed as a choice of three with the summary as its default", async () => {
    const row = await effective(superCookie, `?branchId=${home.id}`);
    expect(row.kind).toBe("choice");
    expect(row.choices.map((c) => c.value)).toEqual(["NONE", "SUMMARY", "FULL"]);
    expect([row.default, row.school, row.effective]).toEqual(["SUMMARY", "SUMMARY", "SUMMARY"]);
  });

  test("the superadmin sets it for the school, it is audited, and a value that is not a level is refused", async () => {
    const set = await put(superCookie, { scope: "GLOBAL", changes: { "bank.parents.view": "NONE" } });
    expect(set.status).toBe(200);
    expect((await effective(superCookie, `?branchId=${home.id}`)).effective).toBe("NONE");
    const audit = await db.questionBankAudit.findMany({ where: { entity: "SETTING", ref: "bank.parents.view" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "SET", newValue: "NONE" });

    const bad = await put(superCookie, { scope: "GLOBAL", changes: { "bank.parents.view": "EVERYTHING" } });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("VALIDATION");
    expect((await effective(superCookie)).school).toBe("NONE");
  });

  test("a branch can lower it, never raise it, and a branch administrator cannot set the school's", async () => {
    expect((await put(superCookie, { scope: "GLOBAL", changes: { "bank.parents.view": "SUMMARY" } })).status).toBe(200);
    const raise = await put(branchCookie, { scope: "BRANCH", branchId: home.id, changes: { "bank.parents.view": "FULL" } });
    expect(raise.status).toBe(400);
    expect(raise.json.error.message).toMatch(/stricter/i);
    const lower = await put(branchCookie, { scope: "BRANCH", branchId: home.id, changes: { "bank.parents.view": "NONE" } });
    expect(lower.status).toBe(200);
    const row = await effective(branchCookie, `?branchId=${home.id}`);
    expect([row.school, row.override, row.effective]).toEqual(["SUMMARY", "NONE", "NONE"]);
    expect((await put(branchCookie, { scope: "GLOBAL", changes: { "bank.parents.view": "FULL" } })).status).toBe(403);
  });

  test("the portal access screen still reads what the branch STORED, and says which ceiling applies to it", async () => {
    await branchGives("FULL");
    await ceilingIs("SUMMARY");
    const res = await api(`${PORTAL_ACCESS}?branchId=${home.id}`, { cookie: superCookie });
    expect(res.status).toBe(200);
    expect(res.json.data.access.guardian.practice).toBe("FULL");
    expect(res.json.data.guardianPracticeCeiling).toBe("SUMMARY");
  });
});
