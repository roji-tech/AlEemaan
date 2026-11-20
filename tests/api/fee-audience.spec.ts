import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender, Residence } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0122 over real HTTP: who a fee line is for (new or returning, gender, day or boarding), optional lines a pupil can opt out of, a scholarship's share taken of the part it covers, and items
// handed over. The numbers are the school's real Basic 1 bill, scaled down: fees 42000 and lesson 2000 for everyone, the uniform 26000 (boys) or 30000 (girls) for new pupils, ID card 3000.

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
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
let n = 0;

/// A branch with a session that began 100 days ago, an earlier session (so a pupil can be "returning"), the term, a class, and the Basic 1 lines.
async function world(extraLines: Record<string, unknown>[] = []) {
  const earlier = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2025/2026",
      startDate: new Date(`${day(-500)}T00:00:00Z`),
      endDate: new Date(`${day(-200)}T00:00:00Z`),
      status: "CLOSED",
    },
  });
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
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "Basic 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A" } });
  const line = (name: string, amount: string, extra: Record<string, unknown> = {}) =>
    db.feeStructure.create({ data: { branchId: home.id, periodId: period.id, name, amount, ...extra } });
  const fees = await line("School fees", "42000.00");
  const lesson = await line("Lesson fee", "2000.00");
  const uniformM = await line("Two pairs of uniform (boys)", "26000.00", {
    audienceAdmission: "NEW",
    audienceGender: "MALE",
    optional: true,
    trackHandover: true,
    scholarshipCovers: false,
  });
  const uniformF = await line("Two pairs of uniform (girls)", "30000.00", {
    audienceAdmission: "NEW",
    audienceGender: "FEMALE",
    optional: true,
    trackHandover: true,
    scholarshipCovers: false,
  });
  const idCard = await line("ID card", "3000.00");
  for (const extra of extraLines) await line(String(extra.name), String(extra.amount), extra);
  const enrol = async (firstName: string, opts: { gender?: Gender; residence?: Residence | null; returning?: boolean } = {}) => {
    const p = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName,
        lastName: "Bill",
        gender: opts.gender ?? Gender.MALE,
        admissionNo: `FA/${Date.now() % 100000}/${++n}`,
        ...(opts.residence !== undefined ? { residence: opts.residence } : {}),
      },
    });
    if (opts.returning)
      await db.studentEnrollment.create({
        data: { studentId: p.id, branchId: home.id, sessionId: earlier.id, className: "Nursery 2", arm: "A", status: "ACTIVE" },
      });
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
  return { period, session, group, enrol, fees, lesson, uniformM, uniformF, idCard, line };
}
const generate = (cookie: string, periodId: string) =>
  api("/api/v1/finance/invoices", { method: "POST", cookie, body: { branchId: home.id, periodId } });
const invoiceOf = (studentId: string) => db.invoice.findFirstOrThrow({ where: { studentId }, include: { discounts: true } });
const namesOf = async (studentId: string) => ((await invoiceOf(studentId)).lineItems as { name: string }[]).map((l) => l.name).sort();
const ITEMS = (studentId: string, periodId: string) =>
  `/api/v1/finance/students/${studentId}/fee-items?branchId=${home.id}&periodId=${periodId}`;
const OPT = (studentId: string, feeId: string) => `/api/v1/finance/students/${studentId}/fee-items/${feeId}/opt-out?branchId=${home.id}`;
const HAND = (studentId: string, feeId: string) => `/api/v1/finance/students/${studentId}/fee-items/${feeId}/handover?branchId=${home.id}`;

test.describe("who is billed what", () => {
  test("a new boy, a new girl and a returning girl each get their own bill: 73000, 77000 and 47000", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    const boy = await w.enrol("Boy", { gender: Gender.MALE });
    const girl = await w.enrol("Girl", { gender: Gender.FEMALE });
    const old = await w.enrol("Old", { gender: Gender.FEMALE, returning: true });
    const res = await generate(admin.cookie, w.period.id);
    expect(res.status, res.text).toBe(201);
    expect(dto(res)).toMatchObject({ created: 3, missingResidence: 0 });
    expect((await invoiceOf(boy.id)).totalAmount.toString()).toBe("73000");
    expect(await namesOf(boy.id)).toEqual(["ID card", "Lesson fee", "School fees", "Two pairs of uniform (boys)"]);
    expect((await invoiceOf(girl.id)).totalAmount.toString()).toBe("77000");
    expect(await namesOf(girl.id)).toContain("Two pairs of uniform (girls)");
    expect((await invoiceOf(old.id)).totalAmount.toString()).toBe("47000");
    expect(await namesOf(old.id)).toEqual(["ID card", "Lesson fee", "School fees"]);
  });

  test("a line for boarders needs the pupil's residence: a pupil without one is left without it and counted, a boarder is billed it, a day pupil is not", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world([{ name: "Hostel", amount: "20000.00", audienceResidence: "BOARDING" }]);
    const unknown = await w.enrol("Unknown", { returning: true });
    const boarder = await w.enrol("Boarder", { returning: true, residence: Residence.BOARDING });
    const day1 = await w.enrol("Dayboy", { returning: true, residence: Residence.DAY });
    const res = await generate(admin.cookie, w.period.id);
    expect(dto(res)).toMatchObject({ created: 3, missingResidence: 1 });
    expect(await namesOf(boarder.id)).toContain("Hostel");
    expect(await namesOf(unknown.id)).not.toContain("Hostel");
    expect(await namesOf(day1.id)).not.toContain("Hostel");
  });

  test("a line that has no conditions is for everyone, as every line made before this was", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    await db.feeStructure.deleteMany({ where: { id: { in: [w.uniformM.id, w.uniformF.id] } } });
    const a = await w.enrol("A", { gender: Gender.MALE });
    const b = await w.enrol("B", { gender: Gender.FEMALE, returning: true });
    await generate(admin.cookie, w.period.id);
    expect((await invoiceOf(a.id)).totalAmount.toString()).toBe("47000");
    expect((await invoiceOf(b.id)).totalAmount.toString()).toBe("47000");
  });

  test("the fee line is made with its settings through the API, and only an administrator of the branch may", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, [other.id]);
    const w = await world();
    const body = {
      branchId: home.id,
      periodId: w.period.id,
      name: "Cardigan",
      amount: 9000,
      audienceAdmission: "NEW",
      audienceGender: null,
      optional: true,
      scholarshipCovers: false,
      trackHandover: true,
    };
    expect((await api("/api/v1/finance/fee-structures", { method: "POST", cookie: teacher.cookie, body })).status).toBe(403);
    expect((await api("/api/v1/finance/fee-structures", { method: "POST", cookie: away.cookie, body })).status).toBe(403);
    const made = await api("/api/v1/finance/fee-structures", { method: "POST", cookie: admin.cookie, body });
    expect(made.status, made.text).toBe(201);
    expect(dto(made)).toMatchObject({
      audienceAdmission: "NEW",
      audienceGender: null,
      optional: true,
      scholarshipCovers: false,
      trackHandover: true,
    });
    const patched = await api(`/api/v1/finance/fee-structures/${dto(made).id}?branchId=${home.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { audienceGender: "FEMALE", optional: false },
    });
    expect(dto(patched)).toMatchObject({ audienceAdmission: "NEW", audienceGender: "FEMALE", optional: false, trackHandover: true });
    expect(
      (await api("/api/v1/finance/fee-structures", { method: "POST", cookie: admin.cookie, body: { ...body, audienceGender: "OTHER" } }))
        .status,
    ).toBe(400);
  });
});

test.describe("new or returning, set by hand", () => {
  test("a pupil loaded this year has no earlier enrolment and looks new; marking them returning gives the returning bill, and clearing it goes back to working it out", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, [other.id]);
    const w = await world();
    const loaded = await w.enrol("Loaded", { gender: Gender.MALE }); // enrolled only this session: worked out as NEW
    const url = `/api/v1/finance/students/${loaded.id}/admission-status?branchId=${home.id}`;
    expect((await api(url, { method: "PUT", cookie: teacher.cookie, body: { admission: "RETURNING" } })).status).toBe(403);
    expect((await api(url, { method: "PUT", cookie: away.cookie, body: { admission: "RETURNING" } })).status).toBe(404);
    expect((await api(url, { method: "PUT", cookie: admin.cookie, body: { admission: "SOMETIMES" } })).status).toBe(400);
    expect(dto(await api(ITEMS(loaded.id, w.period.id), { cookie: admin.cookie })).admission).toBe("NEW");
    const set = await api(url, { method: "PUT", cookie: admin.cookie, body: { admission: "RETURNING" } });
    expect(set.status, set.text).toBe(200);
    expect(dto(await api(ITEMS(loaded.id, w.period.id), { cookie: admin.cookie })).admission).toBe("RETURNING");
    await generate(admin.cookie, w.period.id);
    expect((await invoiceOf(loaded.id)).totalAmount.toString()).toBe("47000");
    // Back to automatic: new again for the next run (the invoice that exists is not changed).
    await api(url, { method: "PUT", cookie: admin.cookie, body: { admission: null } });
    expect(dto(await api(ITEMS(loaded.id, w.period.id), { cookie: admin.cookie })).admission).toBe("NEW");
    expect((await invoiceOf(loaded.id)).totalAmount.toString()).toBe("47000");
    expect(await db.auditLog.count({ where: { action: "STUDENT_FEE_ADMISSION_SET", targetId: loaded.id } })).toBe(2);
    // An override of NEW beats an earlier enrolment too.
    const old = await w.enrol("Old", { gender: Gender.FEMALE, returning: true });
    await api(`/api/v1/finance/students/${old.id}/admission-status?branchId=${home.id}`, {
      method: "PUT",
      cookie: admin.cookie,
      body: { admission: "NEW" },
    });
    expect(dto(await api(ITEMS(old.id, w.period.id), { cookie: admin.cookie })).admission).toBe("NEW");
  });
});

test.describe("the pupil import's Admission status column", () => {
  test("New or Returning is saved on the pupil; empty leaves it worked out; a word it does not know is a problem on that row", async () => {
    const admin = await asRole(Role.ADMIN);
    const send = (rows: unknown[], dryRun = false) =>
      api("/api/v1/students/import", { method: "POST", cookie: admin.cookie, body: { branchId: home.id, dryRun, rows } });
    const base = (line: number, first: string, extra: Record<string, string> = {}) => ({
      line,
      values: { firstName: first, lastName: "Import", gender: "Male", ...extra },
    });
    const bad = await send([base(2, "Odd", { feeAdmission: "sometimes" })], true);
    expect(JSON.stringify(bad.json)).toContain("Write New or Returning");
    const saved = await send([
      base(2, "Fresh", { feeAdmission: "New" }),
      base(3, "Veteran", { feeAdmission: "Returning" }),
      base(4, "Plain"),
    ]);
    expect(saved.status, saved.text).toBe(201);
    const of = async (first: string) =>
      (await db.studentRecord.findFirstOrThrow({ where: { branchId: home.id, firstName: first } })).feeAdmission;
    expect([await of("Fresh"), await of("Veteran"), await of("Plain")]).toEqual(["NEW", "RETURNING", null]);
  });
});

test.describe("one flat fee for the whole branch", () => {
  test("a single line with no class and no conditions is charged to every pupil of the branch, whatever their class, gender or residence", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    await db.feeStructure.deleteMany({ where: { periodId: w.period.id } });
    await db.feeStructure.create({ data: { branchId: home.id, periodId: w.period.id, name: "School fees", amount: "85000.00" } });
    const other2 = await db.classGroup.create({ data: { branchId: home.id, name: "JSS 1", sortOrder: 2 } });
    const arm2 = await db.classArm.create({ data: { branchId: home.id, classGroupId: other2.id, name: "A" } });
    const a = await w.enrol("Basic", { gender: Gender.MALE });
    const b = await w.enrol("Boarder", { gender: Gender.FEMALE, residence: Residence.BOARDING, returning: true });
    const c = await db.studentRecord.create({
      data: {
        branchId: home.id,
        firstName: "Junior",
        lastName: "Bill",
        gender: Gender.FEMALE,
        admissionNo: `FA/FLAT/${Date.now() % 100000}`,
      },
    });
    await db.studentEnrollment.create({
      data: {
        studentId: c.id,
        branchId: home.id,
        sessionId: w.session.id,
        className: other2.name,
        arm: "A",
        classArmId: arm2.id,
        status: "ACTIVE",
      },
    });
    const res = await generate(admin.cookie, w.period.id);
    expect(dto(res)).toMatchObject({ created: 3, missingResidence: 0 });
    for (const p of [a, b, c]) {
      const inv = await invoiceOf(p.id);
      expect([inv.totalAmount.toString(), (inv.lineItems as unknown[]).length]).toEqual(["85000", 1]);
    }
  });
});

test.describe("opting out of an optional line", () => {
  test("before the run: the pupil's invoice leaves the line out; the others are unchanged", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    const skip = await w.enrol("Skip", { gender: Gender.MALE });
    const keep = await w.enrol("Keep", { gender: Gender.MALE });
    const res = await api(OPT(skip.id, w.uniformM.id), {
      method: "PUT",
      cookie: admin.cookie,
      body: { optedOut: true, note: "Has one already" },
    });
    expect(res.status, res.text).toBe(200);
    expect(dto(res)).toMatchObject({ optedOut: true, invoiceChanged: false });
    await generate(admin.cookie, w.period.id);
    expect((await invoiceOf(skip.id)).totalAmount.toString()).toBe("47000");
    expect((await invoiceOf(keep.id)).totalAmount.toString()).toBe("73000");
    const items = dto(await api(ITEMS(skip.id, w.period.id), { cookie: admin.cookie })).items as { name: string; verdict: string }[];
    expect(items.find((i) => i.name.includes("(boys)"))?.verdict).toBe("opted-out");
    expect(items.find((i) => i.name.includes("(girls)"))?.verdict).toBe("other-audience");
    expect(items.find((i) => i.name === "School fees")?.verdict).toBe("billed");
  });

  test("after the run, while nothing is paid: the line comes off the invoice and goes back on when the pupil opts in again", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    const p = await w.enrol("Later", { gender: Gender.MALE });
    await generate(admin.cookie, w.period.id);
    const off = await api(OPT(p.id, w.uniformM.id), { method: "PUT", cookie: admin.cookie, body: { optedOut: true } });
    expect(dto(off)).toMatchObject({ invoiceChanged: true });
    let inv = await invoiceOf(p.id);
    expect([inv.totalAmount.toString(), inv.status]).toEqual(["47000", "UNPAID"]);
    expect(await namesOf(p.id)).not.toContain("Two pairs of uniform (boys)");
    const back = await api(OPT(p.id, w.uniformM.id), { method: "PUT", cookie: admin.cookie, body: { optedOut: false } });
    expect(dto(back)).toMatchObject({ optedOut: false, invoiceChanged: true });
    inv = await invoiceOf(p.id);
    expect(inv.totalAmount.toString()).toBe("73000");
    expect(await db.studentFeeOptOut.count({ where: { studentId: p.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: { in: ["STUDENT_FEE_OPTED_OUT", "STUDENT_FEE_OPTED_IN"] }, targetId: p.id } })).toBe(
      2,
    );
  });

  test("once money is paid on the invoice, nothing is changed and nothing is saved; a compulsory line cannot be opted out of; a line cannot be put on a girl's invoice that is for boys", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    const p = await w.enrol("Paid", { gender: Gender.MALE });
    const g = await w.enrol("Girl", { gender: Gender.FEMALE });
    await generate(admin.cookie, w.period.id);
    await db.invoice.updateMany({ where: { studentId: p.id }, data: { amountPaid: "1000.00", status: "PARTIALLY_PAID" } });
    const refused = await api(OPT(p.id, w.uniformM.id), { method: "PUT", cookie: admin.cookie, body: { optedOut: true } });
    expect(refused.status).toBe(409);
    expect(refused.json.error?.code ?? refused.json.code).toBe("INVOICE_LOCKED");
    expect(await db.studentFeeOptOut.count({ where: { studentId: p.id } })).toBe(0); // the refusal rolled the choice back
    expect((await invoiceOf(p.id)).totalAmount.toString()).toBe("73000");
    const compulsory = await api(OPT(p.id, w.fees.id), { method: "PUT", cookie: admin.cookie, body: { optedOut: true } });
    expect(compulsory.status).toBe(409);
    // Opting a girl out of the boys' line changes nothing on her invoice (it is not on it), but is a clean no-op, not an error.
    const noop = await api(OPT(g.id, w.uniformM.id), { method: "PUT", cookie: admin.cookie, body: { optedOut: true } });
    expect(dto(noop)).toMatchObject({ invoiceChanged: false });
    expect((await invoiceOf(g.id)).totalAmount.toString()).toBe("77000");
  });

  test("with a hand-set discount on the invoice the change is refused with the reason", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    const p = await w.enrol("Disc", { gender: Gender.MALE });
    await generate(admin.cookie, w.period.id);
    const inv = await invoiceOf(p.id);
    await db.invoiceDiscount.create({
      data: {
        branchId: home.id,
        invoiceId: inv.id,
        amount: "1000.00",
        reason: "Staff child",
        mode: "MANUAL_OVERRIDE",
        appliedByUserId: admin.user.id,
      },
    });
    const res = await api(OPT(p.id, w.uniformM.id), { method: "PUT", cookie: admin.cookie, body: { optedOut: true } });
    expect(res.status).toBe(409);
    expect(res.text).toContain("set by hand");
  });
});

test.describe("scholarships and the part they cover", () => {
  const grant = async (admin: { user: { id: string } }, studentId: string, percent: number) => {
    const type = await db.scholarshipType.create({ data: { branchId: home.id, name: `T${percent}${++n}`, percent } });
    return db.studentScholarship.create({ data: { branchId: home.id, studentId, typeId: type.id, percent, createdById: admin.user.id } });
  };

  test("a scholarship's percent is taken of what it covers: 50% of the fees and lesson and ID card (47000), not of the uniform", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    const p = await w.enrol("Schol", { gender: Gender.MALE });
    await grant(admin, p.id, 50);
    await generate(admin.cookie, w.period.id);
    const inv = await invoiceOf(p.id);
    // Gross 73000; the uniform (26000) is not covered, so the share is 50% of 47000.
    expect(inv.discounts.map((d) => d.amount.toString())).toEqual(["23500"]);
    expect(inv.totalAmount.toString()).toBe("49500");
    expect((inv.lineItems as { name: string; covered?: boolean }[]).find((l) => l.name.includes("uniform"))?.covered).toBe(false);
  });

  test("opting out of a line the scholarship does not cover leaves its share alone; opting out of one it covers lowers the share in proportion", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world([{ name: "Cardigan", amount: "10000.00", optional: true }]);
    const p = await w.enrol("Both", { gender: Gender.MALE });
    await grant(admin, p.id, 50);
    await generate(admin.cookie, w.period.id);
    // Covered: 42000 + 2000 + 3000 + 10000 = 57000, so 50% = 28500; gross 83000; net 54500.
    expect((await invoiceOf(p.id)).discounts.map((d) => d.amount.toString())).toEqual(["28500"]);
    await api(OPT(p.id, w.uniformM.id), { method: "PUT", cookie: admin.cookie, body: { optedOut: true } });
    let inv = await invoiceOf(p.id);
    expect([inv.discounts[0].amount.toString(), inv.totalAmount.toString()]).toEqual(["28500", "28500"]); // gross 57000
    const cardigan = await db.feeStructure.findFirstOrThrow({ where: { name: "Cardigan" } });
    await api(OPT(p.id, cardigan.id), { method: "PUT", cookie: admin.cookie, body: { optedOut: true } });
    inv = await invoiceOf(p.id);
    // Covered is now 47000: the share goes from 28500 to 23500; gross 47000; net 23500.
    expect([inv.discounts[0].amount.toString(), inv.totalAmount.toString()]).toEqual(["23500", "23500"]);
  });

  test("'Apply to open invoices' takes the same covered base", async () => {
    const admin = await asRole(Role.ADMIN);
    const w = await world();
    const p = await w.enrol("Late", { gender: Gender.MALE });
    await generate(admin.cookie, w.period.id);
    const s = await grant(admin, p.id, 50);
    const res = await api(`/api/v1/students/${p.id}/scholarships/${s.id}/apply`, { method: "POST", cookie: admin.cookie, body: {} });
    expect(res.status, res.text).toBe(200);
    expect((await invoiceOf(p.id)).discounts.map((d) => d.amount.toString())).toEqual(["23500"]);
  });
});

test.describe("items handed over", () => {
  test("record, list with the invoice's money, undo; an untracked line, a future day and another branch are refused", async () => {
    const admin = await asRole(Role.ADMIN);
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, [other.id]);
    const w = await world();
    const a = await w.enrol("Ada", { gender: Gender.MALE });
    const b = await w.enrol("Bayo", { gender: Gender.MALE });
    await generate(admin.cookie, w.period.id);
    await db.invoice.updateMany({ where: { studentId: a.id }, data: { amountPaid: "73000.00", status: "PAID" } });

    expect((await api(HAND(a.id, w.uniformM.id), { method: "PUT", cookie: teacher.cookie, body: { received: true } })).status).toBe(403);
    expect((await api(HAND(a.id, w.uniformM.id), { method: "PUT", cookie: away.cookie, body: { received: true } })).status).toBe(404);
    expect((await api(HAND(a.id, w.fees.id), { method: "PUT", cookie: admin.cookie, body: { received: true } })).status).toBe(409); // not tracked
    expect(
      (await api(HAND(a.id, w.uniformM.id), { method: "PUT", cookie: admin.cookie, body: { received: true, receivedOn: day(3) } })).status,
    ).toBe(400);

    const done = await api(HAND(a.id, w.uniformM.id), {
      method: "PUT",
      cookie: admin.cookie,
      body: { received: true, receivedOn: day(-1), note: "Size 8" },
    });
    expect(done.status, done.text).toBe(200);
    expect(dto(done)).toMatchObject({ received: true, receivedOn: day(-1) });

    const list = dto(
      await api(`/api/v1/finance/handovers?branchId=${home.id}&periodId=${w.period.id}&feeId=${w.uniformM.id}`, { cookie: admin.cookie }),
    );
    expect(list.rows).toHaveLength(2);
    const rowA = (list.rows as Record<string, any>[]).find((r) => r.studentId === a.id)!; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(rowA).toMatchObject({ invoiceStatus: "PAID", amountPaid: "73000", received: { on: day(-1), note: "Size 8" } });
    const rowB = (list.rows as Record<string, any>[]).find((r) => r.studentId === b.id)!; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(rowB).toMatchObject({ invoiceStatus: "UNPAID", received: null });
    // It never touched the money.
    expect((await invoiceOf(a.id)).amountPaid.toString()).toBe("73000");

    // A line with a recorded handover cannot be deleted.
    const del = await api(`/api/v1/finance/fee-structures/${w.uniformM.id}?branchId=${home.id}`, {
      method: "DELETE",
      cookie: admin.cookie,
    });
    expect(del.status).toBe(409);
    expect(await db.feeStructure.count({ where: { id: w.uniformM.id } })).toBe(1);

    const undo = await api(HAND(a.id, w.uniformM.id), { method: "PUT", cookie: admin.cookie, body: { received: false } });
    expect(dto(undo)).toMatchObject({ received: false });
    expect(await db.feeItemHandover.count({ where: { studentId: a.id } })).toBe(0);
    expect(
      await db.auditLog.count({ where: { action: { in: ["STUDENT_ITEM_RECEIVED", "STUDENT_ITEM_RECEIPT_UNDONE"] }, targetId: a.id } }),
    ).toBe(2);
  });

  test("the reads are an administrator's: signed out 401, a teacher 403, an administrator of another branch 404", async () => {
    const teacher = await asRole(Role.TEACHING_STAFF);
    const away = await asRole(Role.ADMIN, [other.id]);
    const w = await world();
    const p = await w.enrol("Read");
    const urls = [ITEMS(p.id, w.period.id), `/api/v1/finance/handovers?branchId=${home.id}&periodId=${w.period.id}&feeId=${w.uniformM.id}`];
    for (const url of urls) {
      expect((await api(url)).status).toBe(401);
      expect((await api(url, { cookie: teacher.cookie })).status).toBe(403);
      expect((await api(url, { cookie: away.cookie })).status).toBe(404);
    }
  });
});
