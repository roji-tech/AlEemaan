import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { resultsWorld } from "../support/results-world";
import { resultFootprint } from "../support/result-footprint";

// Task 0116, report-card sets, over real HTTP: the four seeded templates, trait ratings (1 to 5) and attendance for a pupil's term, who may enter them (an administrator or the class teacher of the
// pupil's arm), the lock at publication, the register's numbers against entered ones, and what the printed card carries.

let home: { id: string };
let other: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
  other = await db.branch.findFirstOrThrow({ where: { id: { not: home.id } }, orderBy: { name: "asc" } });
});

const asRole = async (role: Role, branchId = home.id) => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
type World = Awaited<ReturnType<typeof resultsWorld>>;

const TEMPLATES = "/api/v1/results/templates";
const traitsUrl = (studentId: string, periodId: string) => `/api/v1/students/${studentId}/report-traits?periodId=${periodId}`;
const put = (cookie: string, studentId: string, body: unknown) =>
  api(`/api/v1/students/${studentId}/report-traits`, { method: "PUT", cookie, body });
const putAtt = (cookie: string, studentId: string, body: unknown) =>
  api(`/api/v1/students/${studentId}/report-attendance`, { method: "PUT", cookie, body });
const card = (cookie: string, w: World, periodId = w.period.id) =>
  api(`/api/v1/students/${w.student.id}/report-card?periodId=${periodId}&preview=true`, { cookie });

/// A world whose class uses the SENIOR template, a class teacher for its arm, and the people who may or may not enter things.
async function setUp(layout: "SENIOR" | "PRESCHOOL" = "SENIOR") {
  const w = await resultsWorld(home.id);
  const admin = await asRole(Role.ADMIN);
  const classTeacher = await asRole(Role.TEACHING_STAFF);
  const otherTeacher = await asRole(Role.TEACHING_STAFF);
  const clerk = await asRole(Role.NON_TEACHING_STAFF);
  const away = await asRole(Role.ADMIN, other.id);
  const record = await db.staffRecord.create({
    data: { branchId: home.id, category: "TEACHING", firstName: "Class", lastName: "Teacher", userId: classTeacher.user.id },
  });
  await db.classArm.update({ where: { id: w.arm.id }, data: { classTeacherId: record.id } });
  const list = await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie });
  const templates = list.json.data.templates as { id: string; layoutCode: string | null; name: string }[];
  const template = templates.find((t) => t.layoutCode === layout)!;
  expect(
    (await api(`${TEMPLATES}/${template.id}/classes`, { method: "PUT", cookie: admin.cookie, body: { classGroupIds: [w.group.id] } }))
      .status,
  ).toBe(200);
  const traits = await db.resultTemplateTrait.findMany({
    where: { templateId: template.id },
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return { w, admin, classTeacher, otherTeacher, clerk, away, template, traits };
}

const publish = async (w: World, periodId: string, total: number, studentId = w.student.id) =>
  db.result.create({
    data: {
      branchId: home.id,
      studentId,
      subjectId: w.subject.id,
      periodId,
      classArmId: w.arm.id,
      schemeId: w.scheme.id,
      scaleId: w.scale.id,
      // The scores rule: total = CA + exam, the exam within its maximum, the total within maxScore; CA takes up to 40 of the total.
      componentScores: [{ name: "Test 1", max: 40, score: Math.min(total, 40) }],
      examScore: total - Math.min(total, 40),
      examMax: 60,
      caTotal: Math.min(total, 40),
      total,
      maxScore: 100,
      gradeLetter: "C",
      gradeRemark: "Credit",
      ...(await (async () => {
        const by = (await db.user.findFirstOrThrow()).id;
        return { enteredByUserId: by, ...resultFootprint("PUBLISHED", by) };
      })()),
    },
  });

test.describe("the four seeded templates", () => {
  test("a branch has the school's four report cards the first time templates are read, with their trait sets and no class placed", async () => {
    const admin = await asRole(Role.ADMIN);
    const list = await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(list.status).toBe(200);
    const byLayout = Object.fromEntries(
      (list.json.data.templates as { layoutCode: string | null; name: string; isDefault: boolean; classGroupIds: string[] }[])
        .filter((t) => t.layoutCode)
        .map((t) => [t.layoutCode, t]),
    );
    expect(Object.keys(byLayout).sort()).toEqual(["BASIC", "JUNIOR", "PRESCHOOL", "SENIOR"]);
    expect(byLayout.SENIOR).toMatchObject({ name: "Senior Secondary (Year 10-12)", isDefault: false, classGroupIds: [] });
    const counts = await db.resultTemplateTrait.groupBy({ by: ["templateId"], where: { branchId: home.id }, _count: true });
    expect(counts.map((c) => c._count).sort((a, b) => a - b)).toEqual([10, 10, 19, 19]);
    // Reading again seeds nothing more.
    await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(await db.resultTemplate.count({ where: { branchId: home.id } })).toBe(5); // the default and the four
    expect(await db.resultTemplateClass.count()).toBe(0);
    // None of the seeded grade scales is the branch's default scale.
    expect(await db.gradeScale.count({ where: { branchId: home.id, isDefault: true } })).toBe(0);
  });

  test("they can be renamed, archived (while they hold no class) and restored like any template", async () => {
    const admin = await asRole(Role.ADMIN);
    const list = await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie });
    const basic = (list.json.data.templates as { id: string; layoutCode: string }[]).find((t) => t.layoutCode === "BASIC")!;
    expect(
      (await api(`${TEMPLATES}/${basic.id}`, { method: "PATCH", cookie: admin.cookie, body: { name: "Primary 1 to 6" } })).status,
    ).toBe(200);
    expect((await api(`${TEMPLATES}/${basic.id}/archive`, { method: "POST", cookie: admin.cookie })).status).toBe(200);
    expect((await api(`${TEMPLATES}/${basic.id}/restore`, { method: "POST", cookie: admin.cookie })).status).toBe(200);
    // An archived seeded template is not brought back by a later read.
    await api(`${TEMPLATES}/${basic.id}/archive`, { method: "POST", cookie: admin.cookie });
    await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: admin.cookie });
    expect((await db.resultTemplate.findUniqueOrThrow({ where: { id: basic.id } })).archivedAt).not.toBeNull();
    expect(await db.resultTemplate.count({ where: { branchId: home.id, layoutCode: "BASIC" } })).toBe(1);
  });

  test("a branch made later through the branches API has them too", async () => {
    const sup = await createUser({ role: Role.ADMIN });
    const cookie = cookieHeader((await loginAs(sup)).token!);
    const made = await api("/api/v1/branches", { method: "POST", cookie, body: { name: `Late Branch ${Date.now()}` } });
    expect(made.status, JSON.stringify(made.json)).toBe(201);
    const id = made.json.data.branch.id as string;
    expect(await db.resultTemplate.count({ where: { branchId: id, layoutCode: { not: null } } })).toBe(4);
    expect(await db.resultTemplateTrait.count({ where: { branchId: id } })).toBe(58);
  });
});

test.describe("trait ratings", () => {
  test("the sheet shows the pupil's template with no ratings yet; the administrator and the class teacher may enter, nobody else", async () => {
    const t = await setUp();
    for (const who of [t.admin, t.classTeacher, t.otherTeacher, t.clerk]) {
      const res = await api(traitsUrl(t.w.student.id, t.w.period.id), { cookie: who.cookie });
      expect(res.status).toBe(200);
      const sheet = res.json.data.sheet;
      expect(sheet.template).toMatchObject({ id: t.template.id, layoutCode: "SENIOR" });
      expect(sheet.groups.map((g: { title: string; showSign: boolean }) => [g.title, g.showSign])).toEqual([
        ["Character development", true],
        ["Practical skills", true],
      ]);
      expect(sheet.groups.flatMap((g: { traits: { rating: number | null }[] }) => g.traits.map((x) => x.rating))).toEqual(
        Array(10).fill(null),
      );
      expect(sheet.canEdit).toBe(who === t.admin || who === t.classTeacher);
      expect(sheet.locked).toBe(false);
    }
    expect((await api(traitsUrl(t.w.student.id, t.w.period.id), { cookie: t.away.cookie })).status).toBe(404);
    expect((await api(traitsUrl(t.w.student.id, "nope"), { cookie: t.admin.cookie })).status).toBe(404);
  });

  test("set, change, clear; every save is audited with what changed; saving the same value again changes nothing", async () => {
    const t = await setUp();
    const [a, b] = t.traits;
    const ok = await put(t.classTeacher.cookie, t.w.student.id, {
      periodId: t.w.period.id,
      ratings: [
        { traitId: a.id, rating: 4 },
        { traitId: b.id, rating: 5 },
      ],
    });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(ok.json.data).toMatchObject({ set: 2, cleared: 0 });
    expect(
      (await db.traitRating.findMany({ where: { studentId: t.w.student.id } })).map((r) => [r.traitId, r.rating, r.updatedByUserId]).sort(),
    ).toEqual(
      [
        [a.id, 4, t.classTeacher.user.id],
        [b.id, 5, t.classTeacher.user.id],
      ].sort(),
    );
    const change = await put(t.admin.cookie, t.w.student.id, {
      periodId: t.w.period.id,
      ratings: [
        { traitId: a.id, rating: 2 },
        { traitId: b.id, rating: null },
      ],
    });
    expect(change.json.data).toMatchObject({ set: 1, cleared: 1 });
    expect(await db.traitRating.count({ where: { studentId: t.w.student.id } })).toBe(1);
    expect((await db.traitRating.findFirstOrThrow({ where: { traitId: a.id } })).rating).toBe(2);
    const again = await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 2 }] });
    expect(again.json.data).toMatchObject({ set: 0, cleared: 0 });
    const rows = await db.auditLog.findMany({
      where: { action: "TRAIT_RATINGS_SAVED", targetId: t.w.student.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2); // the no-op wrote none
    expect(rows[1].afterValue).toMatchObject({
      set: 1,
      cleared: 1,
      changed: [
        { traitId: a.id, from: 4, to: 2 },
        { traitId: b.id, from: 5, to: null },
      ],
    });
    // The card sheet reads them back.
    const sheet = (await api(traitsUrl(t.w.student.id, t.w.period.id), { cookie: t.admin.cookie })).json.data.sheet;
    expect(
      sheet.groups.flatMap((g: { traits: { id: string; rating: number | null }[] }) => g.traits).find((x: { id: string }) => x.id === a.id)
        .rating,
    ).toBe(2);
  });

  test("a rating is 1 to 5: 0, 6, a fraction, a text and an empty list are refused, and an extra field is refused", async () => {
    const t = await setUp();
    const [a] = t.traits;
    for (const rating of [0, 6, 2.5, "3", -1]) {
      const res = await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating }] });
      expect([res.status, res.json.error.code], String(rating)).toEqual([400, "VALIDATION"]);
    }
    expect((await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [] })).status).toBe(400);
    expect(
      (await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 3, extra: 1 }] })).status,
    ).toBe(400);
    expect(
      (await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 3 }], surprise: true }))
        .status,
    ).toBe(400);
    expect(await db.traitRating.count()).toBe(0);
  });

  test("only traits of the pupil's own template: another template's trait, another branch's trait and a repeated trait are refused and nothing is written", async () => {
    const t = await setUp();
    const [mine] = t.traits;
    const preschool = await db.resultTemplateTrait.findFirstOrThrow({
      where: { branchId: home.id, template: { layoutCode: "PRESCHOOL" } },
    });
    // The other branch's templates, seeded the way a read does.
    const foreignAdmin = t.away;
    await api(`${TEMPLATES}?branchId=${other.id}`, { cookie: foreignAdmin.cookie });
    const foreign = await db.resultTemplateTrait.findFirstOrThrow({ where: { branchId: other.id } });
    for (const traitId of [preschool.id, foreign.id, "no-such-trait"]) {
      const res = await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId, rating: 3 }] });
      expect([res.status, res.json.error.code], traitId).toEqual([409, "CONFLICT"]);
      expect(res.json.error.message).toContain("not on this pupil's report card");
    }
    const dup = await put(t.admin.cookie, t.w.student.id, {
      periodId: t.w.period.id,
      ratings: [
        { traitId: mine.id, rating: 3 },
        { traitId: mine.id, rating: 4 },
      ],
    });
    expect(dup.status).toBe(409);
    // All or nothing: a good trait beside a bad one writes neither.
    const mixed = await put(t.admin.cookie, t.w.student.id, {
      periodId: t.w.period.id,
      ratings: [
        { traitId: mine.id, rating: 3 },
        { traitId: preschool.id, rating: 3 },
      ],
    });
    expect(mixed.status).toBe(409);
    expect(await db.traitRating.count()).toBe(0);
  });

  test("a pupil of another branch is the same 404 as an unknown id, for an administrator of this one and for the other branch's own administrator", async () => {
    const t = await setUp();
    const foreignPupil = await db.studentRecord.create({
      data: {
        branchId: other.id,
        firstName: "Far",
        lastName: "Away",
        gender: "MALE",
        dateOfBirth: new Date("2012-01-01"),
        admissionNo: `ADM/FAR/${Math.random()}`,
      },
    });
    const [a] = t.traits;
    expect((await put(t.admin.cookie, foreignPupil.id, { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 3 }] })).status).toBe(
      404,
    );
    expect((await putAtt(t.admin.cookie, foreignPupil.id, { periodId: t.w.period.id, timesOpen: 10 })).status).toBe(404);
    expect((await put(t.away.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 3 }] })).status).toBe(
      404,
    );
    expect((await put(t.admin.cookie, "nope", { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 3 }] })).status).toBe(404);
    expect(await db.traitRating.count()).toBe(0);
  });

  test("another teacher and non-teaching staff are refused, and so is a teacher who is the class teacher of a different arm; signed out is 401", async () => {
    const t = await setUp();
    const [a] = t.traits;
    const body = { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 3 }] };
    expect((await put(t.otherTeacher.cookie, t.w.student.id, body)).status).toBe(403);
    expect((await put(t.clerk.cookie, t.w.student.id, body)).status).toBe(403);
    expect((await putAtt(t.otherTeacher.cookie, t.w.student.id, { periodId: t.w.period.id, timesOpen: 10 })).status).toBe(403);
    // The other teacher is made class teacher of a DIFFERENT arm: still not this pupil's.
    const otherGroup = await db.classGroup.create({ data: { branchId: home.id, name: "Elsewhere" } });
    const otherArm = await db.classArm.create({ data: { branchId: home.id, classGroupId: otherGroup.id, name: "A" } });
    const rec = await db.staffRecord.create({
      data: { branchId: home.id, category: "TEACHING", firstName: "Other", lastName: "Teacher", userId: t.otherTeacher.user.id },
    });
    await db.classArm.update({ where: { id: otherArm.id }, data: { classTeacherId: rec.id } });
    expect((await put(t.otherTeacher.cookie, t.w.student.id, body)).status).toBe(403);
    expect((await api(`/api/v1/students/${t.w.student.id}/report-traits`, { method: "PUT", body })).status).toBe(401);
    expect(await db.traitRating.count()).toBe(0);
  });

  test("once the pupil's results for the term are published nothing can change; the sheet says locked", async () => {
    const t = await setUp();
    const [a] = t.traits;
    expect((await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 3 }] })).status).toBe(
      200,
    );
    await publish(t.w, t.w.period.id, 70);
    const refused = await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId: a.id, rating: 5 }] });
    expect([refused.status, refused.json.error.code]).toEqual([409, "CONFLICT"]);
    expect(refused.json.error.message).toContain("already published");
    expect((await putAtt(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, timesOpen: 90 })).status).toBe(409);
    const sheet = (await api(traitsUrl(t.w.student.id, t.w.period.id), { cookie: t.admin.cookie })).json.data.sheet;
    expect(sheet).toMatchObject({ locked: true, canEdit: false });
    expect((await db.traitRating.findFirstOrThrow({ where: { traitId: a.id } })).rating).toBe(3);
  });
});

test.describe("attendance", () => {
  test("from the register when nothing is entered; an entered number wins, field by field, and says so; clearing goes back to the register", async () => {
    const t = await setUp();
    const mate = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Mate",
        lastName: "Classmate",
        gender: "MALE",
        dateOfBirth: new Date("2012-02-02"),
        admissionNo: `ADM/M/${Math.random()}`,
      },
    });
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    await db.attendanceRecord.createMany({
      data: [
        { branchId: home.id, studentId: t.w.student.id, date: day("2026-09-07"), status: "PRESENT" },
        { branchId: home.id, studentId: t.w.student.id, date: day("2026-09-08"), status: "LATE" },
        { branchId: home.id, studentId: t.w.student.id, date: day("2026-09-09"), status: "ABSENT" },
        { branchId: home.id, studentId: mate.id, date: day("2026-09-10"), status: "PRESENT" },
      ],
    });
    const read = async () => (await api(traitsUrl(t.w.student.id, t.w.period.id), { cookie: t.admin.cookie })).json.data.sheet.attendance;
    const before = await read();
    expect(before.register).toEqual({ timesOpen: 4, timesPresent: 2, timesAbsent: 1 });
    expect(before.effective.timesOpen).toEqual({ value: 4, source: "register" });

    const set = await putAtt(t.classTeacher.cookie, t.w.student.id, { periodId: t.w.period.id, timesOpen: 90 });
    expect(set.status, JSON.stringify(set.json)).toBe(200);
    const after = await read();
    expect(after.effective).toEqual({
      timesOpen: { value: 90, source: "entered" },
      timesPresent: { value: 2, source: "register" },
      timesAbsent: { value: 1, source: "register" },
    });
    expect((await putAtt(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, timesOpen: null })).json.data.entered).toEqual({
      timesOpen: null,
      timesPresent: null,
      timesAbsent: null,
    });
    expect((await read()).effective.timesOpen).toEqual({ value: 4, source: "register" });
    expect(await db.reportAttendance.count()).toBe(0); // all three cleared: no row is kept
    const audits = await db.auditLog.findMany({ where: { action: "REPORT_ATTENDANCE_SAVED", targetId: t.w.student.id } });
    expect(audits).toHaveLength(2);
  });

  test("with no register and nothing entered every number is empty: nothing is invented", async () => {
    const t = await setUp();
    const att = (await api(traitsUrl(t.w.student.id, t.w.period.id), { cookie: t.admin.cookie })).json.data.sheet.attendance;
    expect(att.effective).toEqual({
      timesOpen: { value: null, source: null },
      timesPresent: { value: null, source: null },
      timesAbsent: { value: null, source: null },
    });
  });

  test("bounds: present or absent above the times open, a negative, a fraction and more than 366 are refused", async () => {
    const t = await setUp();
    const send = (body: object) => putAtt(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ...body });
    expect((await send({ timesOpen: 90, timesPresent: 91 })).json.error.message).toContain("Times present cannot be more");
    expect((await send({ timesOpen: 90, timesAbsent: 91 })).json.error.message).toContain("Times absent cannot be more");
    for (const bad of [{ timesOpen: -1 }, { timesOpen: 2.5 }, { timesOpen: 367 }, { timesPresent: "5" }])
      expect((await send(bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await send({ timesOpen: 90, timesPresent: 80, timesAbsent: 10 })).status).toBe(200);
    // The final set is checked as a whole: lowering the open count below the stored present count is refused.
    expect((await send({ timesOpen: 70 })).status).toBe(409);
    expect(await db.reportAttendance.count()).toBe(1);
  });
});

test.describe("the card", () => {
  test("carries the template's look and trait groups with ratings, attendance, the term's dates, the date of birth, the earlier terms and the annual figures", async () => {
    const t = await setUp();
    // A second and third term in the session, and results in the first two.
    const second = await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: t.w.session.id,
        ordinal: 2,
        label: "2nd Term",
        startDate: new Date("2027-01-05"),
        endDate: new Date("2027-04-01"),
        isCurrent: false,
      },
    });
    await db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId: t.w.session.id,
        ordinal: 3,
        label: "3rd Term",
        startDate: new Date("2027-04-20"),
        isCurrent: false,
      },
    });
    // Ratings and attendance are entered BEFORE the term's results are published: once they are, the sheet is locked (409).
    const [a] = t.traits;
    expect((await put(t.admin.cookie, t.w.student.id, { periodId: second.id, ratings: [{ traitId: a.id, rating: 4 }] })).status).toBe(200);
    expect(
      (await putAtt(t.admin.cookie, t.w.student.id, { periodId: second.id, timesOpen: 60, timesPresent: 55, timesAbsent: 5 })).status,
    ).toBe(200);

    await publish(t.w, t.w.period.id, 60);
    await publish(t.w, second.id, 80);
    const mate = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Mate",
        lastName: "Classmate",
        gender: "MALE",
        dateOfBirth: new Date("2012-02-02"),
        admissionNo: `ADM/M/${Math.random()}`,
      },
    });
    await db.studentEnrollment.create({
      data: {
        branchId: home.id,
        studentId: mate.id,
        sessionId: t.w.session.id,
        className: t.w.group.name,
        arm: "A",
        classArmId: t.w.arm.id,
      },
    });
    await publish(t.w, second.id, 90, mate.id);

    const res = await card(t.admin.cookie, t.w, second.id);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const c = res.json.data.card;
    expect(c.layout).toMatchObject({ code: "SENIOR" });
    expect(c.student.dateOfBirth).toBe("2012-05-01");
    expect(c.traits.map((g: { title: string }) => g.title)).toEqual(["Character development", "Practical skills"]);
    expect(c.traits[0].traits.find((x: { id: string }) => x.id === a.id).rating).toBe(4);
    expect(c.attendance.timesOpen).toEqual({ value: 60, source: "entered" });
    expect(c.attendance.timesAbsent).toEqual({ value: 5, source: "entered" });
    expect(c.dates).toEqual({ termStarts: "2027-01-05", schoolClosed: "2027-04-01", nextTermStarts: "2027-04-20" });
    const maths = c.subjects[0];
    expect(maths.termScores).toEqual([
      { ordinal: 2, label: "2nd Term", total: 80 },
      { ordinal: 1, label: "1st Term", total: 60 },
    ]);
    expect([maths.annual, maths.annualAverage]).toEqual([140, 70]);
    expect([maths.position, maths.classSize]).toEqual([2, 2]); // 80 behind the classmate's 90
  });

  test("before any result exists the card already has its class, its look and its trait sections from the pupil's enrolment", async () => {
    const t = await setUp("PRESCHOOL");
    const c = (await card(t.admin.cookie, t.w)).json.data.card;
    expect(c.subjects).toEqual([]);
    expect(c.layout).toMatchObject({ code: "PRESCHOOL" });
    expect(c.class).toEqual({ group: t.w.group.name, arm: "A", gradeLabel: null });
    expect(c.traits.map((g: { title: string }) => g.title)).toEqual(["Psychomotor skill", "Affective domain"]);
    expect(c.traits[1].traits).toHaveLength(13);
    expect(c.dates.termStarts).toBe("2026-09-01");
  });

  test("a class in no template gets the branch's standard card with no trait sections", async () => {
    const w = await resultsWorld(home.id);
    const admin = await asRole(Role.ADMIN);
    const c = (await card(admin.cookie, w)).json.data.card;
    expect(c.layout).toMatchObject({ code: "DEFAULT" });
    expect(c.traits).toEqual([]);
  });

  test("a template's trait set can be changed by moving the class: the pupil then answers to the new template's traits only", async () => {
    const t = await setUp("SENIOR");
    const [oldTrait] = t.traits;
    const list = await api(`${TEMPLATES}?branchId=${home.id}`, { cookie: t.admin.cookie });
    const basic = (list.json.data.templates as { id: string; layoutCode: string }[]).find((x) => x.layoutCode === "BASIC")!;
    expect(
      (
        await api(`${TEMPLATES}/${basic.id}/classes`, {
          method: "PUT",
          cookie: t.admin.cookie,
          body: { classGroupIds: [t.w.group.id], confirmMoves: true },
        })
      ).status,
    ).toBe(200);
    const stale = await put(t.admin.cookie, t.w.student.id, { periodId: t.w.period.id, ratings: [{ traitId: oldTrait.id, rating: 3 }] });
    expect(stale.status).toBe(409); // the senior template's trait is no longer on this pupil's card
    const sheet = (await api(traitsUrl(t.w.student.id, t.w.period.id), { cookie: t.admin.cookie })).json.data.sheet;
    expect(sheet.template.layoutCode).toBe("BASIC");
    expect(sheet.groups.map((g: { title: string }) => g.title)).toEqual(["Psychomotor skill", "Affective domain"]);
  });
});
