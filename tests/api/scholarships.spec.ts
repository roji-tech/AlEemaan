import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0113 S1 over real HTTP: scholarship types per branch, scholarships a pupil holds (several, never over 100% together), who may see and change them (an administrator of the pupil's branch
// only; never a teacher or the family portal), what a new invoice takes off, "Apply to open invoices" (once per scholarship per invoice), "Paid by scholarship", and that scholarships are never
// counted as money collected. Who may do each is checked first.

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
const asRole = async (role: Role, branchIds: string[] = [home.id]) => {
  const user = await createUser();
  for (const branchId of branchIds) await db.membership.create({ data: { userId: user.id, branchId, role } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const dto = (res: { json: { data: unknown } }) => res.json.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let n = 0;
const pupil = (branchId: string, extra: Record<string, unknown> = {}) =>
  db.studentRecord.create({
    data: {
      branchId,
      firstName: `Pupil${++n}`,
      lastName: "Schol",
      gender: Gender.FEMALE,
      admissionNo: `SCH/${Date.now() % 100000}/${n}`,
      ...extra,
    },
  });
const type = (branchId: string, name: string, percent: number, extra: Record<string, unknown> = {}) =>
  db.scholarshipType.create({ data: { branchId, name, percent, ...extra } });
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const TYPES = "/api/v1/finance/scholarship-types";
const grantsOf = (studentId: string) => `/api/v1/students/${studentId}/scholarships`;

test.describe("the types", () => {
  test("signed out 401; a teacher 403; an administrator of another branch is refused (404 on read, 403 in a body)", async () => {
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, [other.id]);
    const t = await type(home.id, "Merit", 50);
    expect((await api(`${TYPES}?branchId=${home.id}`)).status).toBe(401);
    expect((await api(`${TYPES}?branchId=${home.id}`, { cookie: teacher.cookie })).status).toBe(403);
    expect(
      (await api(TYPES, { method: "POST", cookie: teacher.cookie, body: { branchId: home.id, name: "Nope", percent: 10 } })).status,
    ).toBe(403);
    expect((await api(`${TYPES}?branchId=${home.id}`, { cookie: away.cookie })).status).toBe(404);
    expect((await api(TYPES, { method: "POST", cookie: away.cookie, body: { branchId: home.id, name: "Nope", percent: 10 } })).status).toBe(
      403,
    );
    expect((await api(`${TYPES}/${t.id}`, { method: "PATCH", cookie: away.cookie, body: { percent: 10 } })).status).toBe(404);
    expect((await api(`${TYPES}/${t.id}`, { method: "PATCH", cookie: teacher.cookie, body: { percent: 10 } })).status).toBe(403);
    expect(await db.scholarshipType.count()).toBe(1);
  });

  test("add, list with holders, rename, change the default share, archive and bring back; a name is used once among live types; shares are 1 to 100; audited", async () => {
    const admin = await asRole(Role.ADMIN);
    const made = await api(TYPES, {
      method: "POST",
      cookie: admin.cookie,
      body: { branchId: home.id, name: "Academic  merit", percent: 50, description: "Top of the class" },
    });
    expect(made.status, made.text).toBe(201);
    expect(made.headers.get("cache-control")).toBe("no-store");
    const id = dto(made).type.id as string;
    expect(dto(made).type).toMatchObject({ name: "Academic merit", percent: 50, archived: false });
    expect(
      (await api(TYPES, { method: "POST", cookie: admin.cookie, body: { branchId: home.id, name: "ACADEMIC MERIT", percent: 20 } })).status,
    ).toBe(409);
    for (const percent of [0, 101, 12.5])
      expect(
        (await api(TYPES, { method: "POST", cookie: admin.cookie, body: { branchId: home.id, name: `X${percent}`, percent } })).status,
        String(percent),
      ).toBe(400);
    // The same name in another branch is fine.
    expect((await asRole(Role.ADMIN, [other.id])).user.id).toBeTruthy();
    await type(other.id, "Academic merit", 30);

    const p = await pupil(home.id);
    await db.studentScholarship.create({
      data: { branchId: home.id, studentId: p.id, typeId: id, percent: 50, createdById: admin.user.id },
    });
    const list = await api(`${TYPES}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(dto(list).types).toEqual([expect.objectContaining({ id, name: "Academic merit", percent: 50, holders: 1, archived: false })]);

    expect(
      (await api(`${TYPES}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { name: "Merit award", percent: 60 } })).status,
    ).toBe(200);
    expect((await db.studentScholarship.findFirstOrThrow({ where: { studentId: p.id } })).percent).toBe(50); // the pupil's own share is not changed by the default
    expect((await api(`${TYPES}/${id}`, { method: "PATCH", cookie: admin.cookie, body: {} })).status).toBe(400);
    const archived = await api(`${TYPES}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { archived: true } });
    expect(dto(archived).type.archived).toBe(true);
    // An archived name is free again; bringing the first back then clashes.
    expect(
      (await api(TYPES, { method: "POST", cookie: admin.cookie, body: { branchId: home.id, name: "Merit award", percent: 10 } })).status,
    ).toBe(201);
    expect((await api(`${TYPES}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { archived: false } })).status).toBe(409);
    expect(
      await db.auditLog.count({
        where: { action: { in: ["SCHOLARSHIP_TYPE_CREATED", "SCHOLARSHIP_TYPE_UPDATED", "SCHOLARSHIP_TYPE_ARCHIVED"] } },
      }),
    ).toBeGreaterThanOrEqual(4);
  });
});

test.describe("a pupil's scholarships", () => {
  test("a teacher, a signed-out caller and another branch's administrator are refused on every route; another branch's pupil is a 404", async () => {
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, [other.id]);
    const p = await pupil(home.id);
    const t = await type(home.id, "Merit", 50);
    const g = await db.studentScholarship.create({
      data: { branchId: home.id, studentId: p.id, typeId: t.id, percent: 50, createdById: teacher.user.id },
    });
    const base = grantsOf(p.id);
    expect((await api(base)).status).toBe(401);
    for (const [method, path, body] of [
      ["GET", base, undefined],
      ["POST", base, { typeId: t.id }],
      ["PATCH", `${base}/${g.id}`, { percent: 10 }],
      ["POST", `${base}/${g.id}/apply`, {}],
    ] as const) {
      expect((await api(path, { method, cookie: teacher.cookie, body })).status, `${method} ${path} teacher`).toBe(403);
      expect((await api(path, { method, cookie: away.cookie, body })).status, `${method} ${path} other branch`).toBe(404);
    }
    expect((await db.studentScholarship.findUniqueOrThrow({ where: { id: g.id } })).percent).toBe(50);
  });

  test("grant (the share from the type, or the pupil's own), change, end; audited with before and after and never the note", async () => {
    const admin = await asRole(Role.ADMIN);
    const p = await pupil(home.id);
    const t = await type(home.id, "Merit", 50);
    const first = await api(grantsOf(p.id), { method: "POST", cookie: admin.cookie, body: { typeId: t.id, note: "Top of Basic 4" } });
    expect(first.status, first.text).toBe(201);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(dto(first).scholarship).toMatchObject({ typeName: "Merit", percent: 50, live: true, startsOn: null, endsOn: null });
    const id = dto(first).scholarship.id as string;
    const changed = await api(`${grantsOf(p.id)}/${id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { percent: 40, endsOn: day(60), note: "" },
    });
    expect(changed.status, changed.text).toBe(200);
    expect(dto(changed).scholarship).toMatchObject({ percent: 40, endsOn: day(60), note: null });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "STUDENT_SCHOLARSHIP_CHANGED", targetId: p.id } });
    expect(log.beforeValue).toMatchObject({ percent: 50 });
    expect(log.afterValue).toMatchObject({ percent: 40, endsOn: day(60) });
    expect(JSON.stringify(await db.auditLog.findMany({ where: { targetId: p.id } }))).not.toContain("Top of Basic 4");
    const ended = await api(`${grantsOf(p.id)}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { end: true } });
    expect(dto(ended).scholarship).toMatchObject({ live: false });
    expect(dto(ended).scholarship.endedAt).toBeTruthy();
    expect(await db.auditLog.count({ where: { action: "STUDENT_SCHOLARSHIP_ENDED", targetId: p.id } })).toBe(1);
    expect((await api(`${grantsOf(p.id)}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { percent: 10 } })).status).toBe(409); // an ended one is not changed
    expect((await api(`${grantsOf(p.id)}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { end: true, percent: 10 } })).status).toBe(
      400,
    );
    expect((await api(`${grantsOf(p.id)}/no-such`, { method: "PATCH", cookie: admin.cookie, body: { percent: 10 } })).status).toBe(404);
    // The pupil's own share, and the listing with the types on offer.
    const own = await api(grantsOf(p.id), { method: "POST", cookie: admin.cookie, body: { typeId: t.id, percent: 25, startsOn: day(0) } });
    expect(dto(own).scholarship.percent).toBe(25);
    const list = await api(grantsOf(p.id), { cookie: admin.cookie });
    expect(dto(list).scholarships.map((s: { live: boolean }) => s.live)).toEqual([true, false]); // live first
    expect(dto(list).types).toEqual([{ id: t.id, name: "Merit", percent: 50 }]);
  });

  test("several at once are fine while they add up to 100% or less; over 100% is refused (409) in the same transaction, on a grant and on a change; days that never overlap do not add", async () => {
    const admin = await asRole(Role.ADMIN);
    const p = await pupil(home.id);
    const half = await type(home.id, "Half", 50);
    const sixty = await type(home.id, "Sixty", 60);
    const grant = (typeId: string, extra: object = {}) =>
      api(grantsOf(p.id), { method: "POST", cookie: admin.cookie, body: { typeId, ...extra } });
    expect((await grant(half.id)).status).toBe(201);
    const over = await grant(sixty.id);
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe("OVER_100");
    expect(over.json.error.message).toMatch(/110%/);
    const second = await grant(sixty.id, { percent: 50 });
    expect(second.status, second.text).toBe(201); // exactly 100
    const id = dto(second).scholarship.id as string;
    expect((await api(`${grantsOf(p.id)}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { percent: 51 } })).status).toBe(409);
    expect((await api(`${grantsOf(p.id)}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { percent: 50 } })).status).toBe(200); // not counting itself
    // End one: room again.
    const firstId = (await db.studentScholarship.findFirstOrThrow({ where: { studentId: p.id, percent: 50, typeId: half.id } })).id;
    await api(`${grantsOf(p.id)}/${firstId}`, { method: "PATCH", cookie: admin.cookie, body: { end: true } });
    expect((await grant(sixty.id, { percent: 50 })).status).toBe(409); // 50 + 50 still live from the second
    // Days that do not overlap.
    const q = await pupil(home.id);
    const later = (body: object) => api(grantsOf(q.id), { method: "POST", cookie: admin.cookie, body: { typeId: sixty.id, ...body } });
    expect((await later({ percent: 100, endsOn: day(30) })).status).toBe(201);
    expect((await later({ percent: 100, startsOn: day(31) })).status).toBe(201);
    expect((await later({ percent: 1, startsOn: day(10), endsOn: day(40) })).status).toBe(409);
    expect((await later({ percent: 10, startsOn: day(5), endsOn: day(1) })).status).toBe(400); // the days run backwards
    expect((await later({ percent: 0 })).status).toBe(400);
    expect((await later({ percent: 101 })).status).toBe(400);
  });

  test("an archived type, another branch's type and an archived pupil cannot be granted", async () => {
    const admin = await asRole(Role.ADMIN);
    const p = await pupil(home.id);
    const archived = await type(home.id, "Old", 50, { archivedAt: new Date() });
    const foreign = await type(other.id, "Foreign", 50);
    expect((await api(grantsOf(p.id), { method: "POST", cookie: admin.cookie, body: { typeId: archived.id } })).status).toBe(404);
    expect((await api(grantsOf(p.id), { method: "POST", cookie: admin.cookie, body: { typeId: foreign.id } })).status).toBe(404);
    const live = await type(home.id, "Fine", 50);
    const gone = await pupil(home.id, { archivedAt: new Date() });
    expect((await api(grantsOf(gone.id), { method: "POST", cookie: admin.cookie, body: { typeId: live.id } })).status).toBe(409);
    expect(await db.studentScholarship.count()).toBe(0);
  });
});

test.describe("who is shown scholarships", () => {
  test("the pupil list shows them to an administrator of the branch only; a teacher gets none and cannot filter by them (403); the pupil's detail and the portal never carry them", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, [other.id]);
    const withIt = await pupil(home.id, { firstName: "Holder" });
    await pupil(home.id, { firstName: "Without" });
    const t = await type(home.id, "Merit", 50);
    await db.studentScholarship.create({
      data: { branchId: home.id, studentId: withIt.id, typeId: t.id, percent: 50, createdById: admin.user.id },
    });
    const list = (cookie: string, query = "") => api(`/api/v1/students?branchId=${home.id}${query}`, { cookie });

    const asAdmin = await list(admin.cookie);
    const rows = dto(asAdmin).students as { firstName: string; scholarships?: { typeName: string; percent: number }[] }[];
    expect(rows.find((r) => r.firstName === "Holder")!.scholarships).toEqual([{ typeName: "Merit", percent: 50 }]);
    expect(rows.find((r) => r.firstName === "Without")!.scholarships).toEqual([]);
    const asTeacher = await list(teacher.cookie);
    expect(asTeacher.status).toBe(200);
    expect(asTeacher.text).not.toContain("scholarship");
    expect(asTeacher.text).not.toContain("Merit");
    expect((await list(teacher.cookie, "&scholarship=ANY")).status).toBe(403);
    expect((await list(admin.cookie, "&scholarship=ANY")).status).toBe(200);
    expect((await api(`/api/v1/students?scholarship=ANY`, { cookie: admin.cookie })).status).toBe(403); // no branch named: only a superadmin
    expect((await api(`/api/v1/students?scholarship=ANY`, { cookie: (await asRole(Role.ADMIN)).cookie })).status).toBe(403);
    expect((await list(away.cookie)).status).toBe(404);

    for (const cookie of [admin.cookie, teacher.cookie]) {
      const detail = await api(`/api/v1/students/${withIt.id}`, { cookie });
      expect(detail.status).toBe(200);
      expect(detail.text.toLowerCase()).not.toContain("scholarship");
    }
  });

  test("the filter: has one, none, or one type; a scholarship that has ended, has not started or is past its last day does not count", async () => {
    const admin = await asRole(Role.ADMIN);
    const merit = await type(home.id, "Merit", 50);
    const hafiz = await type(home.id, "Hafiz", 100);
    const mk = async (name: string, grants: { typeId: string; startsOn?: string; endsOn?: string; endedAt?: Date }[]) => {
      const p = await pupil(home.id, { firstName: name });
      for (const g of grants)
        await db.studentScholarship.create({
          data: {
            branchId: home.id,
            studentId: p.id,
            typeId: g.typeId,
            percent: 10,
            createdById: admin.user.id,
            startsOn: g.startsOn ? new Date(`${g.startsOn}T00:00:00Z`) : null,
            endsOn: g.endsOn ? new Date(`${g.endsOn}T00:00:00Z`) : null,
            endedAt: g.endedAt ?? null,
          },
        });
    };
    await mk("Live", [{ typeId: merit.id }]);
    await mk("Both", [{ typeId: merit.id }, { typeId: hafiz.id }]);
    await mk("Ended", [{ typeId: merit.id, endedAt: new Date() }]);
    await mk("Future", [{ typeId: merit.id, startsOn: day(5) }]);
    await mk("Past", [{ typeId: merit.id, endsOn: day(-5) }]);
    await mk("Plain", []);
    const names = async (query: string) => {
      const res = await api(`/api/v1/students?branchId=${home.id}${query}`, { cookie: admin.cookie });
      expect(res.status, query).toBe(200);
      return (dto(res).students as { firstName: string }[]).map((s) => s.firstName).sort();
    };
    expect(await names("&scholarship=ANY")).toEqual(["Both", "Live"]);
    expect(await names("&scholarship=NONE")).toEqual(["Ended", "Future", "Past", "Plain"]);
    expect(await names(`&scholarship=${hafiz.id}`)).toEqual(["Both"]);
    expect(await names(`&scholarship=${merit.id}`)).toEqual(["Both", "Live"]);
    // The export says the same, with the names and the shares added up (an administrator's export).
    const exported = await api("/api/v1/exports", {
      method: "POST",
      cookie: admin.cookie,
      body: { kind: "pupils", branchId: home.id, scope: "shown", pupils: { q: "", show: "live", query: "&scholarship=ANY" } },
    });
    expect(exported.status, exported.text).toBe(200);
    const headers = dto(exported).headers as string[];
    const rowsOut = dto(exported).rows as string[][];
    const ix = { name: headers.indexOf("Scholarship"), pct: headers.indexOf("Scholarship %"), first: headers.indexOf("First name") };
    expect(rowsOut.map((r) => [r[ix.first], r[ix.name], r[ix.pct]]).sort()).toEqual([
      ["Both", "Merit, Hafiz", "20"],
      ["Live", "Merit", "10"],
    ]);
  });
});

test.describe("the import's scholarship columns", () => {
  test("a type by name (any case) and an optional share; an unknown or archived type, a share without a type, and a share over 100 are problems and nothing is saved", async () => {
    const admin = await asRole(Role.ADMIN);
    const merit = await type(home.id, "Academic merit", 50);
    await type(home.id, "Old", 30, { archivedAt: new Date() });
    const row = (line: number, values: Record<string, string>) => ({
      line,
      values: { firstName: `Imp${line}`, lastName: "Orted", gender: "Female", ...values },
    });
    const send = (rows: unknown[], dryRun = false) =>
      api("/api/v1/students/import", { method: "POST", cookie: admin.cookie, body: { branchId: home.id, dryRun, rows } });
    const bad = await send([
      row(2, { scholarship: "Academic Merit" }),
      row(3, { scholarship: "Nope" }),
      row(4, { scholarship: "Old" }),
      row(5, { scholarshipPercent: "50" }),
    ]);
    expect(bad.status).toBe(422);
    expect(await db.studentRecord.count()).toBe(0);
    expect(await db.studentScholarship.count()).toBe(0);
    const saved = await send([
      row(2, { scholarship: "academic MERIT" }),
      row(3, { scholarship: "Academic merit", scholarshipPercent: "25%" }),
      row(4, {}),
    ]);
    expect(saved.status, saved.text).toBe(201);
    const grants = await db.studentScholarship.findMany({ include: { student: true }, orderBy: { student: { firstName: "asc" } } });
    expect(grants.map((g) => [g.student.firstName, g.percent, g.typeId])).toEqual([
      ["Imp2", 50, merit.id],
      ["Imp3", 25, merit.id],
    ]);
    expect(await db.auditLog.count({ where: { action: "STUDENT_SCHOLARSHIP_GRANTED" } })).toBe(2);
  });
});

/// The finance side: a branch with fees, a term, and pupils enrolled in it.
async function termWithFees() {
  const session = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2026/2027",
      startDate: new Date(`${day(-100)}T00:00:00Z`),
      endDate: new Date(`${day(200)}T00:00:00Z`),
      status: "ACTIVE",
    },
  });
  const period = await db.academicPeriod.create({
    data: {
      branchId: home.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: new Date(`${day(-90)}T00:00:00Z`),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "Basic 4", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A" } });
  await db.feeStructure.createMany({
    data: [
      { branchId: home.id, periodId: period.id, name: "Tuition", amount: "40000.00" },
      { branchId: home.id, periodId: period.id, name: "Books", amount: "10000.00" },
    ],
  });
  const enrol = async (firstName: string, extra: Record<string, unknown> = {}) => {
    const p = await pupil(home.id, { firstName, ...extra });
    await db.studentEnrollment.create({
      data: {
        studentId: p.id,
        branchId: home.id,
        sessionId: session.id,
        className: group.name,
        arm: "A",
        classArmId: arm.id,
        status: "ACTIVE",
      },
    });
    return p;
  };
  return { period, enrol, group };
}
const generate = (cookie: string, periodId: string) =>
  api("/api/v1/finance/invoices", { method: "POST", cookie, body: { branchId: home.id, periodId } });
const invoiceOf = (studentId: string) => db.invoice.findFirstOrThrow({ where: { studentId }, include: { discounts: true } });

test.describe("invoices", () => {
  test("a new invoice takes each live scholarship's share off, once, through the discount path: the net total, a SCHOLARSHIP discount linked to the scholarship, audited by the maker; one that has ended, not started or is past its day is skipped", async () => {
    const admin = await asRole(Role.ADMIN);
    const { period, enrol } = await termWithFees();
    const t50 = await type(home.id, "Academic merit", 50);
    const t25 = await type(home.id, "Hafiz award", 25);
    const mk = (studentId: string, typeId: string, percent: number, extra: Record<string, unknown> = {}) =>
      db.studentScholarship.create({ data: { branchId: home.id, studentId, typeId, percent, createdById: admin.user.id, ...extra } });
    const both = await enrol("Both");
    const plain = await enrol("Plain");
    const stopped = await enrol("Stopped");
    const future = await enrol("Future");
    const past = await enrol("Past");
    const a = await mk(both.id, t50.id, 50);
    const b = await mk(both.id, t25.id, 25);
    await mk(stopped.id, t50.id, 50, { endedAt: new Date() });
    await mk(future.id, t50.id, 50, { startsOn: new Date(`${day(3)}T00:00:00Z`) });
    await mk(past.id, t50.id, 50, { endsOn: new Date(`${day(-3)}T00:00:00Z`) });

    const res = await generate(admin.cookie, period.id);
    expect(res.status, res.text).toBe(201);
    expect(dto(res)).toMatchObject({ created: 5, scholarshipDiscounts: 2 });

    const inv = await invoiceOf(both.id);
    expect(inv.discounts.map((d) => [d.mode, d.amount.toString(), d.studentScholarshipId, d.reason, d.appliedByUserId]).sort()).toEqual(
      [
        ["SCHOLARSHIP", "12500", b.id, "Hafiz award (25%)", admin.user.id],
        ["SCHOLARSHIP", "25000", a.id, "Academic merit (50%)", admin.user.id],
      ].sort(),
    );
    expect([inv.totalAmount.toString(), inv.amountPaid.toString(), inv.status]).toEqual(["12500", "0", "UNPAID"]); // 50000 - 25000 - 12500
    for (const p of [plain, stopped, future, past]) {
      const other = await invoiceOf(p.id);
      expect([other.totalAmount.toString(), other.discounts.length]).toEqual(["50000", 0]);
    }
    // Run again: nothing is made twice, nothing is discounted twice.
    expect(dto(await generate(admin.cookie, period.id))).toMatchObject({ created: 0, skipped: 5 });
    expect((await invoiceOf(both.id)).discounts).toHaveLength(2);
    // The unique link: the same scholarship on the same invoice cannot be written twice, whatever calls it.
    await expect(
      db.invoiceDiscount.create({
        data: {
          branchId: home.id,
          invoiceId: inv.id,
          amount: "1",
          reason: "again",
          mode: "SCHOLARSHIP",
          appliedByUserId: admin.user.id,
          studentScholarshipId: a.id,
        },
      }),
    ).rejects.toThrow();
  });

  test("a full scholarship settles the invoice: PAID with nothing paid, labelled Paid by scholarship in the list and the detail; a manual discount of the whole fee keeps the status it always had", async () => {
    const admin = await asRole(Role.ADMIN);
    const { period, enrol } = await termWithFees();
    const full = await type(home.id, "Hafiz award", 100);
    const holder = await enrol("Holder");
    const manual = await enrol("Manual");
    await db.studentScholarship.create({
      data: { branchId: home.id, studentId: holder.id, typeId: full.id, percent: 100, createdById: admin.user.id },
    });
    await generate(admin.cookie, period.id);

    const inv = await invoiceOf(holder.id);
    expect([inv.totalAmount.toString(), inv.amountPaid.toString(), inv.status]).toEqual(["0", "0", "PAID"]);
    const list = await api(`/api/v1/finance/invoices?branchId=${home.id}`, { cookie: admin.cookie });
    const rows = dto(list).invoices as { id: string; paidByScholarship: boolean }[];
    expect(rows.find((r) => r.id === inv.id)!.paidByScholarship).toBe(true);
    const detail = await api(`/api/v1/finance/invoices/${inv.id}?branchId=${home.id}`, { cookie: admin.cookie });
    expect(dto(detail).paidByScholarship).toBe(true);
    // Nothing is left to pay on it.
    const pay = await api(`/api/v1/finance/invoices/${inv.id}/record-payment?branchId=${home.id}`, {
      method: "POST",
      cookie: admin.cookie,
      body: { amount: 100, channel: "cash" },
    });
    expect(pay.status).toBe(400);

    // A manual discount that reaches the total: unchanged behaviour (UNPAID at nothing owed), and not labelled.
    const m = await invoiceOf(manual.id);
    const discount = await api(`/api/v1/finance/invoices/${m.id}/discount?branchId=${home.id}`, {
      method: "POST",
      cookie: admin.cookie,
      body: { amount: 50000, reason: "Staff child", mode: "MANUAL_OVERRIDE" },
    });
    expect(discount.status, discount.text).toBeLessThan(300);
    const after = await db.invoice.findUniqueOrThrow({ where: { id: m.id } });
    expect([after.totalAmount.toString(), after.status]).toEqual(["0", "UNPAID"]);
    const list2 = await api(`/api/v1/finance/invoices?branchId=${home.id}`, { cookie: admin.cookie });
    expect((dto(list2).invoices as { id: string; paidByScholarship: boolean }[]).find((r) => r.id === m.id)!.paidByScholarship).toBe(false);
  });

  test("a manual discount still works as before: a smaller manual discount lowers the total and keeps the status", async () => {
    const admin = await asRole(Role.ADMIN);
    const { period, enrol } = await termWithFees();
    const p = await enrol("Plain");
    await generate(admin.cookie, period.id);
    const inv = await invoiceOf(p.id);
    const res = await api(`/api/v1/finance/invoices/${inv.id}/discount?branchId=${home.id}`, {
      method: "POST",
      cookie: admin.cookie,
      body: { amount: 5000, reason: "Sibling discount", mode: "SIBLING_DISCOUNT" },
    });
    expect(res.status, res.text).toBeLessThan(300);
    const after = await invoiceOf(p.id);
    expect([after.totalAmount.toString(), after.status, after.discounts[0].studentScholarshipId]).toEqual(["45000", "UNPAID", null]);
  });

  test("Apply to open invoices: unpaid and part-paid ones, never more than the balance, once per scholarship per invoice (a second press does nothing), not paid or cancelled ones, not an ended scholarship", async () => {
    const admin = await asRole(Role.ADMIN);
    const { period, enrol } = await termWithFees();
    const p = await enrol("Late");
    await generate(admin.cookie, period.id); // no scholarship yet: 50000 owed
    const t = await type(home.id, "Merit", 50);
    const granted = await api(grantsOf(p.id), { method: "POST", cookie: admin.cookie, body: { typeId: t.id } });
    const id = dto(granted).scholarship.id as string;
    const before = await api(grantsOf(p.id), { cookie: admin.cookie });
    expect(dto(before).scholarships[0].openInvoices).toBe(1);
    expect((await invoiceOf(p.id)).totalAmount.toString()).toBe("50000"); // granting alone changes nothing already issued

    const apply = () => api(`${grantsOf(p.id)}/${id}/apply`, { method: "POST", cookie: admin.cookie, body: {} });
    const first = await apply();
    expect(first.status, first.text).toBe(200);
    expect(dto(first)).toMatchObject({ applied: 1, settled: 0, kobo: 2_500_000 });
    const inv = await invoiceOf(p.id);
    expect([inv.totalAmount.toString(), inv.discounts.length, inv.discounts[0].studentScholarshipId]).toEqual(["25000", 1, id]);
    expect(dto(await apply())).toMatchObject({ applied: 0, kobo: 0 }); // idempotent
    expect((await invoiceOf(p.id)).discounts).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "STUDENT_SCHOLARSHIP_APPLIED", targetId: p.id } })).toBe(1);

    // A part-paid invoice: the share is capped at what is still owed. A second pupil: 10000 paid of 50000, a 100% scholarship takes only the 40000 left, and the invoice is settled.
    const q = await enrol("Partial");
    await generate(admin.cookie, period.id);
    const qi = await invoiceOf(q.id);
    await db.invoice.update({ where: { id: qi.id }, data: { amountPaid: "10000", status: "PARTIALLY_PAID" } });
    const full = await type(home.id, "Full", 100);
    const g2 = dto(await api(grantsOf(q.id), { method: "POST", cookie: admin.cookie, body: { typeId: full.id } })).scholarship.id as string;
    const res = await api(`${grantsOf(q.id)}/${g2}/apply`, { method: "POST", cookie: admin.cookie, body: {} });
    expect(dto(res)).toMatchObject({ applied: 1, kobo: 4_000_000 });
    const settled = await invoiceOf(q.id);
    expect([settled.totalAmount.toString(), settled.amountPaid.toString(), settled.status]).toEqual(["10000", "10000", "PAID"]);
    // Money was paid on it, so it is simply paid, not "Paid by scholarship".
    const list = await api(`/api/v1/finance/invoices?branchId=${home.id}`, { cookie: admin.cookie });
    expect((dto(list).invoices as { id: string; paidByScholarship: boolean }[]).find((r) => r.id === settled.id)!.paidByScholarship).toBe(
      false,
    );

    // Paid and cancelled invoices are not touched; an ended scholarship cannot be applied.
    const r = await enrol("Paid");
    await generate(admin.cookie, period.id);
    const ri = await invoiceOf(r.id);
    await db.invoice.update({ where: { id: ri.id }, data: { amountPaid: "50000", status: "PAID" } });
    const g3 = dto(await api(grantsOf(r.id), { method: "POST", cookie: admin.cookie, body: { typeId: t.id } })).scholarship.id as string;
    expect(dto(await api(`${grantsOf(r.id)}/${g3}/apply`, { method: "POST", cookie: admin.cookie, body: {} })).applied).toBe(0);
    await api(`${grantsOf(r.id)}/${g3}`, { method: "PATCH", cookie: admin.cookie, body: { end: true } });
    expect((await api(`${grantsOf(r.id)}/${g3}/apply`, { method: "POST", cookie: admin.cookie, body: {} })).status).toBe(409);
    expect((await api(`${grantsOf(p.id)}/${g3}/apply`, { method: "POST", cookie: admin.cookie, body: {} })).status).toBe(404); // another pupil's scholarship
  });

  test("ending a scholarship does not change invoices already issued", async () => {
    const admin = await asRole(Role.ADMIN);
    const { period, enrol } = await termWithFees();
    const p = await enrol("Ends");
    const t = await type(home.id, "Merit", 50);
    const id = dto(await api(grantsOf(p.id), { method: "POST", cookie: admin.cookie, body: { typeId: t.id } })).scholarship.id as string;
    await generate(admin.cookie, period.id);
    await api(`${grantsOf(p.id)}/${id}`, { method: "PATCH", cookie: admin.cookie, body: { end: true } });
    const inv = await invoiceOf(p.id);
    expect([inv.totalAmount.toString(), inv.discounts.length]).toEqual(["25000", 1]);
  });
});

test.describe("money and who else sees it", () => {
  test("collections are payments only: a scholarship is its own figure and never part of what was collected; the family portal sees only that an invoice was paid by scholarship, not which one", async () => {
    const admin = await asRole(Role.ADMIN);
    const { period, enrol } = await termWithFees();
    const full = await type(home.id, "Hafiz award (secret name)", 100);
    const half = await type(home.id, "Merit", 50);
    const holder = await enrol("Holder", { guardianName: "Mrs Schol", guardianPhone: "08031112222", admissionNo: "SCH/PORTAL/1" });
    const payer = await enrol("Payer");
    await db.studentScholarship.create({
      data: { branchId: home.id, studentId: holder.id, typeId: full.id, percent: 100, createdById: admin.user.id },
    });
    await db.studentScholarship.create({
      data: { branchId: home.id, studentId: payer.id, typeId: half.id, percent: 50, createdById: admin.user.id },
    });
    await generate(admin.cookie, period.id);
    // The payer pays their half in money.
    const pi = await invoiceOf(payer.id);
    expect(
      (
        await api(`/api/v1/finance/invoices/${pi.id}/record-payment?branchId=${home.id}`, {
          method: "POST",
          cookie: admin.cookie,
          body: { amount: 25000, channel: "cash" },
        })
      ).status,
    ).toBeLessThan(300);

    const stats = await api(`/api/v1/finance/stats?branchId=${home.id}`, { cookie: admin.cookie });
    expect(stats.status, stats.text).toBe(200);
    const totals = dto(stats).totals as { collectedKobo: number; scholarshipsKobo: number; discountsKobo: number; invoicedKobo: number };
    expect(totals.scholarshipsKobo).toBe(5_000_000 + 2_500_000); // 50000 (full) + 25000 (half)
    expect(totals.discountsKobo).toBe(0);
    expect(totals.collectedKobo).toBe(2_500_000); // only the payment
    expect(totals.invoicedKobo).toBe(2_500_000); // the fees less the scholarships

    const session = await api("/api/v1/portal/session", { method: "POST", body: { admissionNo: "SCH/PORTAL/1", secret: "08031112222" } });
    expect(session.status, session.text).toBe(200);
    const cookie = session.setCookies[0]!.split(";")[0]!;
    const portal = await api(`/api/v1/portal/students/${holder.id}/invoices`, { cookie });
    expect(portal.status, portal.text).toBe(200);
    expect(dto(portal).invoices[0].paidByScholarship).toBe(true);
    expect(portal.text).not.toContain("secret name");
    expect(portal.text).not.toContain("studentScholarshipId");
    expect(dto(portal).invoices[0].discounts).toEqual([expect.objectContaining({ reason: "Discount", mode: "MANUAL_OVERRIDE" })]);
    const overview = await api(`/api/v1/portal/students/${holder.id}/overview`, { cookie });
    expect(overview.text.toLowerCase()).not.toContain("scholarship");
  });
});
