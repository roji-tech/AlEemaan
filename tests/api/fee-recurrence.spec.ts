import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { Role, createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Task 0124 over real HTTP: a fee line charged every term or once a year, carried into new terms and new sessions until its amount is changed; the term-only lines work as before.

let home: { id: string };
test.afterAll(async () => {
  await resetDatabase();
});
test.beforeEach(async () => {
  await resetDatabase();
  home = await seedInstance();
});
const asAdmin = async () => {
  const user = await createUser();
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  return { user, cookie: cookieHeader((await loginAs(user)).token!) };
};
const dto = (res: { json: { data: unknown } }) => res.json.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
let n = 0;

/// Two sessions, three terms in the first and one in the second; one class and one pupil enrolled in both sessions.
async function world() {
  const s1 = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2025/2026",
      startDate: new Date(`${day(-400)}T00:00:00Z`),
      endDate: new Date(`${day(-40)}T00:00:00Z`),
      status: "CLOSED",
    },
  });
  const s2 = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: "2026/2027",
      startDate: new Date(`${day(-30)}T00:00:00Z`),
      endDate: new Date(`${day(300)}T00:00:00Z`),
      status: "ACTIVE",
    },
  });
  const term = (sessionId: string, ordinal: number, label: string, offset: number, current = false) =>
    db.academicPeriod.create({
      data: {
        branchId: home.id,
        sessionId,
        kind: "TERM",
        ordinal,
        label,
        startDate: new Date(`${day(offset)}T00:00:00Z`),
        isCurrent: current,
      },
    });
  const t1 = await term(s1.id, 1, "1st Term", -390);
  const t2 = await term(s1.id, 2, "2nd Term", -300);
  const t3 = await term(s1.id, 3, "3rd Term", -200);
  const t4 = await term(s2.id, 1, "1st Term", -20, true);
  const group = await db.classGroup.create({ data: { branchId: home.id, name: "Basic 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { branchId: home.id, classGroupId: group.id, name: "A" } });
  const enrol = async (firstName: string, sessions: { id: string }[]) => {
    const p = await db.studentRecord.create({
      data: { branchId: home.id, firstName, lastName: "Rec", gender: Gender.MALE, admissionNo: `FR/${Date.now() % 100000}/${++n}` },
    });
    for (const s of sessions)
      await db.studentEnrollment.create({
        data: {
          studentId: p.id,
          branchId: home.id,
          sessionId: s.id,
          className: group.name,
          arm: "A",
          classArmId: arm.id,
          status: "ACTIVE",
        },
      });
    return p;
  };
  return { s1, s2, t1, t2, t3, t4, group, enrol };
}
const generate = (cookie: string, periodId: string) =>
  api("/api/v1/finance/invoices", { method: "POST", cookie, body: { branchId: home.id, periodId } });
const invoiceIn = (studentId: string, periodId: string) =>
  db.invoice.findUniqueOrThrow({ where: { branchId_studentId_periodId: { branchId: home.id, studentId, periodId } } });
const line = (data: Record<string, unknown>) => db.feeStructure.create({ data: { branchId: home.id, ...data } as never });

test.describe("a line charged every term", () => {
  test("is on every term's invoice, in every session, and a new amount reaches only the invoices made afterwards", async () => {
    const admin = await asAdmin();
    const w = await world();
    const fee = await line({ name: "School fees", amount: "85000.00", recurrence: "EVERY_TERM", periodId: null });
    const p = await w.enrol("Flat", [w.s1, w.s2]);
    for (const t of [w.t1, w.t2]) expect((await generate(admin.cookie, t.id)).status).toBe(201);
    expect((await invoiceIn(p.id, w.t1.id)).totalAmount.toString()).toBe("85000");
    expect((await invoiceIn(p.id, w.t2.id)).totalAmount.toString()).toBe("85000");
    // The school changes the fee: edit the one line.
    const patched = await api(`/api/v1/finance/fee-structures/${fee.id}?branchId=${home.id}`, {
      method: "PATCH",
      cookie: admin.cookie,
      body: { amount: 90000 },
    });
    expect(patched.status, patched.text).toBe(200);
    await generate(admin.cookie, w.t3.id);
    await generate(admin.cookie, w.t4.id); // the next session's first term: still there
    expect((await invoiceIn(p.id, w.t3.id)).totalAmount.toString()).toBe("90000");
    expect((await invoiceIn(p.id, w.t4.id)).totalAmount.toString()).toBe("90000");
    // Invoices already made kept the amount they were made with.
    expect((await invoiceIn(p.id, w.t1.id)).totalAmount.toString()).toBe("85000");
    expect((await invoiceIn(p.id, w.t2.id)).totalAmount.toString()).toBe("85000");
  });

  test("a term-only line and a recurring line together: the term-only line is in its own term only", async () => {
    const admin = await asAdmin();
    const w = await world();
    await line({ name: "Flat", amount: "80000.00", recurrence: "EVERY_TERM", periodId: null });
    await line({ name: "Exam levy", amount: "5000.00", periodId: w.t2.id });
    const p = await w.enrol("Both", [w.s1]);
    for (const t of [w.t1, w.t2, w.t3]) await generate(admin.cookie, t.id);
    const totals = [];
    for (const t of [w.t1, w.t2, w.t3]) totals.push((await invoiceIn(p.id, t.id)).totalAmount.toString());
    expect(totals).toEqual(["80000", "85000", "80000"]);
  });

  test("a branch with only recurring lines can generate; one with no lines at all still cannot", async () => {
    const admin = await asAdmin();
    const w = await world();
    await w.enrol("Empty", [w.s1]);
    expect((await generate(admin.cookie, w.t1.id)).status).toBe(400);
    await line({ name: "Flat", amount: "1000.00", recurrence: "EVERY_TERM", periodId: null });
    expect((await generate(admin.cookie, w.t1.id)).status).toBe(201);
  });
});

test.describe("a line charged once a year", () => {
  test("is on the pupil's first invoice of the session only; a pupil who joins in the 2nd term gets it then; the next session starts again", async () => {
    const admin = await asAdmin();
    const w = await world();
    await line({ name: "Annual levy", amount: "20000.00", recurrence: "EVERY_SESSION", periodId: null });
    await line({ name: "Tuition", amount: "50000.00", recurrence: "EVERY_TERM", periodId: null });
    const old = await w.enrol("Old", [w.s1, w.s2]);
    await generate(admin.cookie, w.t1.id); // only the pupils enrolled now
    const late = await w.enrol("Late", [w.s1, w.s2]); // joins before the 2nd term
    await generate(admin.cookie, w.t2.id);
    await generate(admin.cookie, w.t3.id);
    expect((await invoiceIn(old.id, w.t1.id)).totalAmount.toString()).toBe("70000"); // tuition + levy
    expect((await invoiceIn(old.id, w.t2.id)).totalAmount.toString()).toBe("50000"); // tuition only: the levy is already on the 1st
    expect((await invoiceIn(old.id, w.t3.id)).totalAmount.toString()).toBe("50000");
    // The pupil who had no 1st term invoice is charged the levy on their first invoice of the session.
    expect((await db.invoice.findMany({ where: { studentId: late.id } })).map((i) => i.totalAmount.toString()).sort()).toEqual(
      ["50000", "70000"].sort(),
    );
    expect((await invoiceIn(late.id, w.t2.id)).totalAmount.toString()).toBe("70000");
    // A new session: the levy comes again on the first invoice.
    await generate(admin.cookie, w.t4.id);
    expect((await invoiceIn(old.id, w.t4.id)).totalAmount.toString()).toBe("70000");
  });
});

test.describe("making the line", () => {
  test("a recurring line has no term; a term-only line needs one; the database refuses the other combinations", async () => {
    const admin = await asAdmin();
    const w = await world();
    const post = (body: Record<string, unknown>) =>
      api("/api/v1/finance/fee-structures", {
        method: "POST",
        cookie: admin.cookie,
        body: { branchId: home.id, name: "Fees", amount: 1000, ...body },
      });
    const recurring = await post({ recurrence: "EVERY_TERM" });
    expect(recurring.status, recurring.text).toBe(201);
    expect(dto(recurring)).toMatchObject({ recurrence: "EVERY_TERM", periodId: null });
    // A period named on a recurring line is dropped, never stored.
    expect(dto(await post({ recurrence: "EVERY_SESSION", periodId: w.t1.id }))).toMatchObject({
      recurrence: "EVERY_SESSION",
      periodId: null,
    });
    expect((await post({})).status).toBe(400); // no term and no recurrence
    expect((await post({ recurrence: "THIS_TERM" })).status).toBe(400);
    expect(dto(await post({ periodId: w.t1.id }))).toMatchObject({ recurrence: "THIS_TERM", periodId: w.t1.id });
    await expect(line({ name: "Bad", amount: "1.00", recurrence: "EVERY_TERM", periodId: w.t1.id })).rejects.toThrow();
    await expect(line({ name: "Bad", amount: "1.00", recurrence: "THIS_TERM", periodId: null })).rejects.toThrow();
  });

  test("a term's list holds its own lines and the recurring ones", async () => {
    const admin = await asAdmin();
    const w = await world();
    await line({ name: "Mine", amount: "1.00", periodId: w.t1.id });
    await line({ name: "Other term", amount: "1.00", periodId: w.t2.id });
    await line({ name: "Always", amount: "1.00", recurrence: "EVERY_TERM", periodId: null });
    const names = async (periodId: string) =>
      (
        (await api(`/api/v1/finance/fee-structures?branchId=${home.id}&periodId=${periodId}`, { cookie: admin.cookie })).json.data as {
          name: string;
        }[]
      )
        .map((f) => f.name)
        .sort();
    expect(await names(w.t1.id)).toEqual(["Always", "Mine"]);
    expect(await names(w.t2.id)).toEqual(["Always", "Other term"]);
  });
});

test.describe("the fees file", () => {
  test("How often with an empty Period makes a recurring line; both or neither is a problem on the row; the same line twice is refused", async () => {
    const admin = await asAdmin();
    const w = await world();
    const send = (rows: unknown[], dryRun = false) =>
      api("/api/v1/finance/fee-structures/import", { method: "POST", cookie: admin.cookie, body: { branchId: home.id, dryRun, rows } });
    const rows = [
      { line: 2, values: { period: "", howOften: "Every term", name: "School fees", amount: "85000" } },
      { line: 3, values: { period: "", howOften: "Once a year", name: "Annual levy", amount: "20000" } },
      { line: 4, values: { period: "1st Term (2026/2027)", name: "Exam levy", amount: "5000" } },
      { line: 5, values: { period: "1st Term (2026/2027)", howOften: "Every term", name: "Both", amount: "1" } },
      { line: 6, values: { period: "", name: "Neither", amount: "1" } },
      { line: 7, values: { period: "", howOften: "Every term", name: "School fees", amount: "85000" } },
    ];
    const dry = await send(rows, true);
    const text = JSON.stringify(dry.json);
    expect(text).toContain("Leave the period empty");
    expect(text).toContain("Choose the period, or say how often");
    expect(text).toContain("Same period");
    const saved = await send(rows.slice(0, 3));
    expect(saved.status, saved.text).toBe(201);
    const stored = Object.fromEntries(
      (await db.feeStructure.findMany({ where: { branchId: home.id } })).map((f) => [f.name, [f.recurrence, f.periodId === null]]),
    );
    expect(stored).toEqual({
      "School fees": ["EVERY_TERM", true],
      "Annual levy": ["EVERY_SESSION", true],
      "Exam levy": ["THIS_TERM", false],
    });
    // The same recurring line again is refused against what exists.
    const again = await send([rows[0]], true);
    expect(JSON.stringify(again.json)).toContain("already exists");
    expect(w.t1.id).toBeTruthy();
  });
});

test.describe("the pupil's fee lines", () => {
  test("a recurring line shows in every term; a once-a-year line already on an earlier invoice of the session is marked carried; opting out changes the current term's invoice", async () => {
    const admin = await asAdmin();
    const w = await world();
    const fee = await line({ name: "Annual levy", amount: "20000.00", recurrence: "EVERY_SESSION", periodId: null, optional: true });
    await line({ name: "Tuition", amount: "50000.00", recurrence: "EVERY_TERM", periodId: null });
    const p = await w.enrol("Show", [w.s1]);
    await generate(admin.cookie, w.t1.id);
    const t1 = dto(
      await api(`/api/v1/finance/students/${p.id}/fee-items?branchId=${home.id}&periodId=${w.t1.id}`, { cookie: admin.cookie }),
    ).items as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(t1.map((i) => [i.name, i.recurrence, i.carried, i.onInvoice]).sort()).toEqual([
      ["Annual levy", "EVERY_SESSION", false, true],
      ["Tuition", "EVERY_TERM", false, true],
    ]);
    await generate(admin.cookie, w.t2.id);
    const t2 = dto(
      await api(`/api/v1/finance/students/${p.id}/fee-items?branchId=${home.id}&periodId=${w.t2.id}`, { cookie: admin.cookie }),
    ).items as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(t2.find((i) => i.name === "Annual levy")).toMatchObject({ carried: true, onInvoice: false });
    // Opting out of the recurring optional line acts on the current term's invoice (the 1st term of the new session): the pupil has none there, so nothing on an invoice changes, and the choice is kept.
    const out = await api(`/api/v1/finance/students/${p.id}/fee-items/${fee.id}/opt-out?branchId=${home.id}`, {
      method: "PUT",
      cookie: admin.cookie,
      body: { optedOut: true },
    });
    expect(out.status, out.text).toBe(200);
    expect(dto(out)).toMatchObject({ optedOut: true, invoiceChanged: false });
    expect(await db.studentFeeOptOut.count({ where: { studentId: p.id, feeStructureId: fee.id } })).toBe(1);
  });
});
