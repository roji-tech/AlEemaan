import "../support/env";
import { test, expect } from "@playwright/test";
import { EnrollmentStatus, Gender, PromotionDecision, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// What a rollover may and may not be asked to do, and what the history says afterwards. The first spec (promotion.spec.ts) walks the happy path with real results; this one
// needs no results (a pupil with none is recommended to repeat), so every pupil is moved by an override and the checks stay small.

let home: { id: string };
let other: { id: string };
let admin: { cookie: string };
const ids = {} as {
  s1: string;
  s2: string;
  jss1: string;
  jss2: string;
  jss1Gold: string;
  jss1Silver: string;
  jss2Gold: string;
  jss2Silver: string;
  amina: string;
  binta: string;
  chidi: string;
};

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.create({ data: { name: `Other ${Date.now()}` } });
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  admin = { cookie: cookieHeader((await loginAs(user)).token!) };

  const session = (branchId: string, label: string, start: string, end: string) =>
    db.academicSession.create({ data: { branchId, label, startDate: new Date(start), endDate: new Date(end) } });
  const s1 = await session(home.id, "2025/2026", "2025-09-01", "2026-07-20");
  const s2 = await session(home.id, "2026/2027", "2026-09-01", "2027-07-20");
  const jss1 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1", sortOrder: 1 } });
  const jss2 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 2", sortOrder: 2 } });
  const arm = (classGroupId: string, name: string) => db.classArm.create({ data: { branchId: home.id, classGroupId, name } });
  const jss1Gold = await arm(jss1.id, "Gold");
  const jss1Silver = await arm(jss1.id, "Silver");
  const jss2Gold = await arm(jss2.id, "Gold");
  const jss2Silver = await arm(jss2.id, "Silver");

  const pupil = (admissionNo: string, firstName: string, lastName: string) =>
    db.studentRecord.create({
      data: { branchId: home.id, firstName, lastName, gender: Gender.FEMALE, dateOfBirth: new Date("2013-05-10"), admissionNo },
    });
  const amina = await pupil("PC-001", "Amina", "Bello");
  const binta = await pupil("PC-002", "Binta", "Sani");
  const chidi = await pupil("PC-003", "Chidi", "Eze");
  const enrol = (studentId: string, className: string, armRow: { id: string; name: string }) =>
    db.studentEnrollment.create({
      data: {
        studentId,
        branchId: home.id,
        sessionId: s1.id,
        className,
        arm: armRow.name,
        classArmId: armRow.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
  await enrol(amina.id, "JSS 1", jss1Gold);
  await enrol(binta.id, "JSS 1", jss1Silver);
  await enrol(chidi.id, "JSS 2", jss2Gold); // JSS 2 has no class above it: the terminal class here

  Object.assign(ids, {
    s1: s1.id,
    s2: s2.id,
    jss1: jss1.id,
    jss2: jss2.id,
    jss1Gold: jss1Gold.id,
    jss1Silver: jss1Silver.id,
    jss2Gold: jss2Gold.id,
    jss2Silver: jss2Silver.id,
    amina: amina.id,
    binta: binta.id,
    chidi: chidi.id,
  });
});

const execute = (body: Record<string, unknown>) =>
  api("/api/v1/academics/promotion/execute", {
    method: "POST",
    cookie: admin.cookie,
    body: { branchId: home.id, sourceSessionId: ids.s1, targetSessionId: ids.s2, sourceClassGroupId: ids.jss1, passMark: 50, ...body },
  });
const nothingHappened = async () => {
  expect(await db.promotionBatch.count()).toBe(0);
  expect(await db.studentEnrollment.count({ where: { sessionId: ids.s2 } })).toBe(0);
  expect(await db.studentEnrollment.count({ where: { sessionId: ids.s1, status: EnrollmentStatus.ACTIVE } })).toBe(3);
};

test("an override carries its arm and its reason through to the record, and the history says what was advised and what was done", async () => {
  const res = await execute({
    overrides: [
      {
        studentId: ids.amina,
        decision: PromotionDecision.PROMOTED,
        targetClassArmId: ids.jss2Silver,
        overrideReason: "Strong exam, moved up",
      },
    ],
  });
  expect(res.status).toBe(201);

  const record = await db.promotionRecord.findFirstOrThrow({ where: { studentId: ids.amina }, include: { targetEnrollment: true } });
  expect(record.decision).toBe(PromotionDecision.PROMOTED);
  expect(record.decisionMode).toBe("OVERRIDDEN");
  expect(record.overrideReason).toBe("Strong exam, moved up");
  expect(record.targetEnrollment?.className).toBe("JSS 2");
  expect(record.targetEnrollment?.classArmId).toBe(ids.jss2Silver);

  const detail = await api(`/api/v1/academics/promotion/batches/${res.json.data.id}?branchId=${home.id}`, { cookie: admin.cookie });
  expect(detail.status).toBe(200);
  const a = detail.json.data.records.find((r: { student: { id: string } }) => r.student.id === ids.amina);
  const b = detail.json.data.records.find((r: { student: { id: string } }) => r.student.id === ids.binta);
  expect(a.decision).toBe("PROMOTED");
  expect(a.recommendedDecision).toBe("REPEATED"); // no results, so the rule advised a repeat; the override is what was done
  expect(a.decisionMode).toBe("OVERRIDDEN");
  expect(a.targetEnrollment).toMatchObject({ className: "JSS 2", arm: "Silver" });
  expect(b.decision).toBe("REPEATED");
  expect(b.decisionMode).toBe("AUTOMATIC");
  expect(detail.json.data.executedBy).toMatchObject({ id: expect.any(String) });
  expect(detail.json.data).not.toHaveProperty("initiatedByUser");
});

test("a rollover into a session of another branch, before the source, or into itself is refused and changes nothing", async () => {
  const foreign = await db.academicSession.create({
    data: { branchId: other.id, label: "Elsewhere", startDate: new Date("2027-09-01"), endDate: new Date("2028-07-20") },
  });
  const earlier = await db.academicSession.create({
    data: { branchId: home.id, label: "2023/2024", startDate: new Date("2023-09-01"), endDate: new Date("2024-07-20") },
  });

  const toForeign = await execute({ targetSessionId: foreign.id });
  expect(toForeign.status).toBe(404);
  const toEarlier = await execute({ targetSessionId: earlier.id });
  expect(toEarlier.status).toBe(400);
  expect(toEarlier.json.error.message).toMatch(/begin after/);
  const toSelf = await execute({ targetSessionId: ids.s1 });
  expect(toSelf.status).toBe(400);
  expect(toSelf.json.error.message).toMatch(/different/);

  const preview = await api(
    `/api/v1/academics/promotion/preview?branchId=${home.id}&sourceSessionId=${ids.s1}&targetSessionId=${earlier.id}&sourceClassGroupId=${ids.jss1}`,
    { cookie: admin.cookie },
  );
  expect(preview.status).toBe(400);
  await nothingHappened();
});

test("an unknown class is a 404, not a server error", async () => {
  const res = await execute({ sourceClassGroupId: "no-such-class" });
  expect(res.status).toBe(404);
  await nothingHappened();
});

test("an override is refused when it names nobody in the class, or an arm of the wrong class, or an archived arm, and nothing is written", async () => {
  const stranger = await execute({ overrides: [{ studentId: ids.chidi, decision: PromotionDecision.REPEATED }] }); // Chidi is in JSS 2, not JSS 1
  expect(stranger.status).toBe(409);

  const wrongClass = await execute({
    overrides: [{ studentId: ids.amina, decision: PromotionDecision.PROMOTED, targetClassArmId: ids.jss1Silver }], // a JSS 1 arm for a move to JSS 2
  });
  expect(wrongClass.status).toBe(400);
  expect(wrongClass.json.error.message).toContain("Amina Bello");

  await db.classArm.update({ where: { branchId_id: { branchId: home.id, id: ids.jss2Silver } }, data: { archivedAt: new Date() } });
  const archived = await execute({
    overrides: [{ studentId: ids.amina, decision: PromotionDecision.PROMOTED, targetClassArmId: ids.jss2Silver }],
  });
  expect(archived.status).toBe(400);

  const noClassToMoveTo = await execute({
    overrides: [{ studentId: ids.amina, decision: PromotionDecision.GRADUATED, targetClassArmId: ids.jss2Gold }],
  });
  expect(noClassToMoveTo.status).toBe(400);
  await nothingHappened();
});

test("a pupil cannot be promoted out of the last class, and a screen made before the next class changed is told to refresh", async () => {
  const lastClass = await execute({
    sourceClassGroupId: ids.jss2,
    overrides: [{ studentId: ids.chidi, decision: PromotionDecision.PROMOTED }],
  });
  expect(lastClass.status).toBe(400);
  expect(lastClass.json.error.message).toMatch(/no next class/);

  const stale = await execute({ targetClassGroupId: ids.jss1 }); // the next class after JSS 1 is JSS 2
  expect(stale.status).toBe(409);
  await nothingHappened();
});

test("two rollovers of the same class at the same moment process each pupil once", async () => {
  const overrides = [{ studentId: ids.amina, decision: PromotionDecision.PROMOTED }];
  const results = await Promise.all([execute({ overrides }), execute({ overrides })]);
  expect(results.map((r) => r.status)).toEqual([201, 201]);

  // Each pupil has one record in total, and one enrolment in the new session.
  expect(await db.promotionRecord.count({ where: { studentId: ids.amina } })).toBe(1);
  expect(await db.promotionRecord.count({ where: { studentId: ids.binta } })).toBe(1);
  expect(await db.studentEnrollment.count({ where: { studentId: ids.amina, sessionId: ids.s2 } })).toBe(1);
  const totals = await db.promotionBatch.findMany({ select: { totalPromoted: true, totalRepeated: true } });
  expect(totals.reduce((n, t) => n + t.totalPromoted, 0)).toBe(1);
  expect(totals.reduce((n, t) => n + t.totalRepeated, 0)).toBe(1);
});

test("promoting a pupil the rule advised to repeat, with no arm chosen, puts them in the matching arm of the NEXT class (not their old arm)", async () => {
  const res = await execute({ overrides: [{ studentId: ids.binta, decision: PromotionDecision.PROMOTED }] });
  expect(res.status).toBe(201);
  const enrolment = await db.studentEnrollment.findUniqueOrThrow({
    where: { studentId_sessionId: { studentId: ids.binta, sessionId: ids.s2 } },
  });
  expect(enrolment.className).toBe("JSS 2");
  expect(enrolment.classArmId).toBe(ids.jss2Silver); // Silver in JSS 1 -> Silver in JSS 2
  // …and the other way: a pupil repeating stays in their own arm of the same class
  const repeater = await db.studentEnrollment.findUniqueOrThrow({
    where: { studentId_sessionId: { studentId: ids.amina, sessionId: ids.s2 } },
  });
  expect(repeater.className).toBe("JSS 1");
  expect(repeater.classArmId).toBe(ids.jss1Gold);
});
