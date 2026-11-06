import { TEST_PAYSTACK_SECRET } from "../support/env";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { db, resetDatabase } from "../support/db";
import { api } from "../support/http";
import { mockPaystack } from "@/lib/finance/mock-paystack";
import { PROGRAMS, buildWorld, day, get, post, send, staffIn, type Person, type World } from "../support/programs";

// Programs, slice P4 (task 0043, section 11): the fees of a program. Fee items and who they are for, making the invoices of a period, who sees which invoice, payments under the school's
// part-payment rule and the invoice's lock, discounts, the gateway and its webhook, and the report. Real HTTP against a production build, real database.

let w: World;
const base = () => `${PROGRAMS}/${w.program}/fees`;
const settings = (who: Person, body: Record<string, unknown>) => send("PATCH", `${PROGRAMS}/${w.program}/settings`, who, body);
const item = (who: Person, body: Record<string, unknown>) =>
  post(`${base()}/items`, who, { name: "Monthly fee", amount: 5000, frequency: "MONTHLY", ...body });
const generate = (who: Person, periodKey: string, confirm = false) => post(`${base()}/generate`, who, { periodKey, confirm });
const invoices = (who: Person, qs = "") => get(`${base()}/invoices${qs ? `?${qs}` : ""}`, who);
const inv = (who: Person, id: string) => get(`${base()}/invoices/${id}`, who);
const pay = (who: Person, id: string, amount: number, over: Record<string, unknown> = {}) =>
  post(`${base()}/invoices/${id}/payments`, who, { amount, channel: "cash", ...over });
const discount = (who: Person, id: string, amount: number, reason = "Sibling discount") =>
  post(`${base()}/invoices/${id}/discounts`, who, { amount, reason });
const MONTH = day(0).slice(0, 7);
const rule = (policy: unknown) => send("PATCH", "/api/v1/settings/part-payment", w.sa, { scope: "GLOBAL", policy });
const switchFor = (who: Person, b: Record<string, unknown>) => send("PATCH", "/api/v1/settings/programs-fees", who, b);

/// A monthly fee for everyone, its invoices made for this month; returns the invoice ids by person.
async function billed(over: Record<string, unknown> = {}): Promise<Record<string, string>> {
  expect((await item(w.sa, over)).status).toBe(201);
  const made = await generate(w.sa, MONTH, true);
  expect(made.status, made.text).toBe(200);
  const rows = await db.programInvoice.findMany();
  return Object.fromEntries(rows.map((r) => [r.participantId, r.id]));
}

test.beforeEach(async () => {
  w = await buildWorld();
  const on = await settings(w.sa, { feesEnabled: true });
  expect(on.status, on.text).toBe(200);
});

test.afterAll(async () => {
  await resetDatabase();
});

test.describe("reaching the routes", () => {
  test("nobody signed out can read or change anything; a member of staff with no place finds no program; a teacher and a supervisor see no fees", async () => {
    const ids = await billed();
    for (const [method, path] of [
      ["GET", `${base()}/items`],
      ["POST", `${base()}/items`],
      ["PATCH", `${base()}/items/${ids[w.amina]}`],
      ["POST", `${base()}/generate`],
      ["GET", `${base()}/invoices`],
      ["GET", `${base()}/invoices/${ids[w.amina]}`],
      ["PATCH", `${base()}/invoices/${ids[w.amina]}`],
      ["POST", `${base()}/invoices/${ids[w.amina]}/payments`],
      ["POST", `${base()}/invoices/${ids[w.amina]}/discounts`],
      ["POST", `${base()}/invoices/${ids[w.amina]}/pay`],
      ["GET", `${base()}/report`],
    ] as const)
      expect((await api(path, { method, body: method === "GET" ? undefined : {} })).status, `${method} ${path}`).toBe(401);
    const outsider = await staffIn(w.B.id, Role.TEACHING_STAFF, "Outsider");
    expect((await invoices(outsider)).status).toBe(404);
    expect((await get(`${base()}/report`, outsider)).status).toBe(404);
    for (const who of [w.teacher, w.supervisor, w.recorder, w.loner]) {
      expect((await invoices(who)).status, who.name).toBe(403);
      expect((await get(`${base()}/items`, who)).status).toBe(403);
      expect((await get(`${base()}/report`, who)).status).toBe(403);
      expect((await inv(who, ids[w.amina]!)).status).toBe(403);
      expect((await pay(who, ids[w.amina]!, 100)).status).toBe(403);
    }
  });
});

test.describe("the switch", () => {
  test("fees start off for a program; the school, the branch and the program must all have them on; payments on existing invoices are still taken", async () => {
    await settings(w.sa, { feesEnabled: false });
    const off = await item(w.sa, {});
    expect(off.status).toBe(409);
    expect(off.json.error.code).toBe("FEES_OFF");
    expect((await get(`${PROGRAMS}/${w.program}`, w.sa)).json.data.fees).toMatchObject({ on: false, offBy: "PROGRAM", reach: true });
    expect((await get(`${PROGRAMS}/${w.program}`, w.teacher)).json.data.fees.reach).toBe(false);
    expect((await settings(w.progAdmin, { feesEnabled: true })).status).toBe(200);
    expect((await settings(w.teacher, { feesEnabled: false })).status).toBe(403);

    const ids = await billed();
    expect((await switchFor(w.sa, { scope: "GLOBAL", enabled: false })).status).toBe(200);
    expect((await get(`${PROGRAMS}/${w.program}`, w.sa)).json.data.fees).toMatchObject({ on: false, offBy: "SCHOOL" });
    expect((await item(w.sa, { name: "Another" })).json.error.code).toBe("FEES_OFF");
    expect((await generate(w.sa, MONTH, true)).json.error.code).toBe("FEES_OFF");
    // what exists is still readable and payable: an invoice that exists can be paid
    expect((await invoices(w.sa)).status).toBe(200);
    expect((await pay(w.sa, ids[w.amina]!, 1000)).status).toBe(201);
    expect((await switchFor(w.adminB, { scope: "BRANCH", branchId: w.B.id, enabled: true })).status).toBeGreaterThanOrEqual(400);
    expect((await switchFor(w.sa, { scope: "GLOBAL", enabled: null })).status).toBe(200);
    expect((await switchFor(w.adminB, { scope: "BRANCH", branchId: w.B.id, enabled: false })).status).toBe(200);
    expect((await get(`${PROGRAMS}/${w.program}`, w.sa)).json.data.fees).toMatchObject({ on: true, branchesOff: [{ id: w.B.id }] });
  });
});

test.describe("fee items", () => {
  test("a super admin and a program admin make and change them; a branch administrator reads them", async () => {
    const made = await item(w.progAdmin, {
      name: "  Registration  ",
      frequency: "ONCE",
      amount: 2000.5,
      billedTo: "GUARDIAN",
      discountPercent: 10,
    });
    expect(made.status, made.text).toBe(201);
    const row = await db.programFeeItem.findFirstOrThrow();
    expect(row).toMatchObject({
      name: "Registration",
      frequency: "ONCE",
      billedTo: "GUARDIAN",
      status: "ACTIVE",
      createdByUserId: w.progAdmin.id,
    });
    expect(Number(row.amount)).toBe(2000.5);
    const listed = (await get(`${base()}/items`, w.adminA)).json.data;
    expect(listed.items).toHaveLength(1);
    expect(listed.canManage).toBe(false);
    expect((await get(`${base()}/items`, w.sa)).json.data.canManage).toBe(true);
    expect((await item(w.adminA, {})).status).toBe(403);
    expect((await send("PATCH", `${base()}/items/${row.id}`, w.adminA, { amount: 1 })).status).toBe(403);
    expect((await send("PATCH", `${base()}/items/${row.id}`, w.sa, { amount: 2500, name: "Registration fee", dueDay: 5 })).status).toBe(
      200,
    );
    expect(Number((await db.programFeeItem.findFirstOrThrow()).amount)).toBe(2500);
    expect((await send("PATCH", `${base()}/items/${row.id}`, w.sa, { status: "ARCHIVED" })).status).toBe(200);
    expect((await db.programFeeItem.findFirstOrThrow()).status).toBe("ARCHIVED");
    expect((await send("PATCH", `${base()}/items/${row.id}`, w.sa, {})).status).toBe(400);
    expect((await send("PATCH", `${base()}/items/well-formed-but-nothing`, w.sa, { amount: 3 })).status).toBe(404);
    expect(await db.programAudit.count({ where: { action: { in: ["FEE_ITEM_CREATED", "FEE_ITEM_CHANGED", "FEE_ITEM_ARCHIVED"] } } })).toBe(
      3,
    );
  });

  test("the shape is checked: name, amount, due day, discount, audience, exemptions and unknown keys", async () => {
    const bad: Record<string, unknown>[] = [
      { name: "  " },
      { name: "n".repeat(81) },
      { amount: 0 },
      { amount: 0.001 },
      { amount: 10_000_001 },
      { amount: 12.345 },
      { amount: "5000" },
      { frequency: "WEEKLY" },
      { dueDay: 0 },
      { dueDay: 29 },
      { discountPercent: 101 },
      { discountPercent: -1 },
      { billedTo: "SCHOOL" },
      { audience: { kinds: ["ROBOT"] } },
      { audience: { groupIds: ["not an id"] } },
      { audience: { extra: 1 } },
      { exemptIds: ["not an id"] },
      { exemptIds: [w.amina, w.amina] },
      { extra: 1 },
    ];
    for (const over of bad) expect((await item(w.sa, over)).status, JSON.stringify(over)).toBe(400);
    expect((await item(w.sa, { audience: { groupIds: ["well-formed-but-nothing"] } })).status).toBe(404);
    expect((await item(w.sa, { audience: { branchIds: ["well-formed-but-nothing"] } })).status).toBe(400);
    expect((await item(w.sa, { exemptIds: ["well-formed-but-nothing"] })).status).toBe(404);
    const other = await post(PROGRAMS, w.sa, { name: "Other", kind: "ONGOING", branchIds: [w.A.id], levelLabels: ["Class"] });
    const foreignGroup = (await post(`${PROGRAMS}/${other.json.data.id}/groups`, w.sa, { name: "Foreign", parentId: null })).json.data.id;
    expect((await item(w.sa, { audience: { groupIds: [foreignGroup] } })).status).toBe(404);
    expect(await db.programFeeItem.count()).toBe(0);
  });

  test("at most 200 fees", async () => {
    await db.programFeeItem.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({ programId: w.program, name: `F${i}`, amount: 1, createdByUserId: w.sa.id })),
    });
    expect((await item(w.sa, {})).json.error.code).toBe("TOO_MANY");
  });
});

test.describe("making the invoices of a period", () => {
  test("the preview says who would get one and changes nothing; confirming makes them; doing it again makes nothing new", async () => {
    await item(w.sa, { name: "Monthly fee", amount: 5000, dueDay: 10 });
    const preview = await generate(w.sa, MONTH);
    expect(preview.status, preview.text).toBe(200);
    expect(preview.json.data).toMatchObject({ periodKey: MONTH, items: 1, count: 4, totalAmount: 20_000, noFee: 0 });
    expect(await db.programInvoice.count()).toBe(0);

    const made = await generate(w.sa, MONTH, true);
    expect(made.json.data).toMatchObject({ created: 4, skipped: 0, totalAmount: 20_000, more: false });
    const rows = await db.programInvoice.findMany({ orderBy: { invoiceNo: "asc" } });
    expect(rows).toHaveLength(4);
    const year = new Date().getUTCFullYear();
    expect(rows.map((r) => r.invoiceNo)).toEqual([1, 2, 3, 4].map((n) => `PINV-${year}-000${n}`));
    expect(
      rows.every((r) => r.status === "UNPAID" && Number(r.amountPaid) === 0 && Number(r.totalAmount) === 5000 && r.periodKey === MONTH),
    ).toBe(true);
    expect(rows[0]!.dueDate!.toISOString().slice(0, 10)).toBe(`${MONTH}-10`);
    expect(rows.find((r) => r.participantId === w.cara)!.branchId).toBe(w.B.id);
    // billed to the person: their name, and the phone on the record (a pupil's is the guardian's)
    expect(rows.find((r) => r.participantId === w.amina)).toMatchObject({ billingName: "Amina Pupil", billingPhone: "+2348011110001" });
    expect(rows.find((r) => r.participantId === w.hauwa)).toMatchObject({ billingName: "Hauwa Bello", billingPhone: "08031234567" });
    expect(rows[0]!.lineItems).toEqual([
      { itemId: expect.any(String), name: "Monthly fee", amount: 5000, discountPercent: null, net: 5000 },
    ]);

    const again = await generate(w.sa, MONTH, true);
    expect(again.json.data.created).toBe(0);
    expect((await generate(w.sa, MONTH)).json.data).toMatchObject({
      count: 0,
      skipped: expect.arrayContaining([expect.objectContaining({ reason: "Already has an invoice for this period." })]),
    });
    expect(await db.programInvoice.count()).toBe(4);
    expect(await db.programAudit.count({ where: { action: "INVOICES_GENERATED" } })).toBe(1);
  });

  test("a period matches how often a fee is charged; a fee changed later does not change an invoice already made", async () => {
    await item(w.sa, { name: "Registration", frequency: "ONCE", amount: 2000 });
    await item(w.sa, { name: "Yearly levy", frequency: "YEARLY", amount: 9000 });
    expect((await generate(w.sa, MONTH)).json.data).toMatchObject({ count: 0, items: 0 });
    expect((await generate(w.sa, MONTH.slice(0, 4))).json.data).toMatchObject({ count: 4, totalAmount: 36_000, items: 1 });
    expect((await generate(w.sa, "once", true)).json.data.created).toBe(4);
    const regId = (await db.programFeeItem.findFirstOrThrow({ where: { name: "Registration" } })).id;
    expect((await send("PATCH", `${base()}/items/${regId}`, w.sa, { amount: 9999 })).status).toBe(200);
    const row = await db.programInvoice.findFirstOrThrow({ where: { periodKey: "once" } });
    expect(Number(row.totalAmount)).toBe(2000);
    // bad periods
    for (const bad of ["2026-13", "26-11", "monthly", "2026-1", "once "]) expect((await generate(w.sa, bad)).status, bad).toBe(400);
  });

  test("who an item is for: kinds, branches, groups (with what is inside), exemptions, a percentage off", async () => {
    await item(w.sa, { name: "Pupils of Juz A", amount: 1000, audience: { kinds: ["STUDENT"], groupIds: [w.juzA] }, exemptIds: [w.binta] });
    const plan = (await generate(w.sa, MONTH)).json.data;
    expect(plan.willGet.map((r: { participantId: string }) => r.participantId).sort()).toEqual([w.amina, w.cara].sort());
    expect(plan.noFee).toBe(2); // Binta is exempt, Hauwa is an adult in Juz B
    await item(w.sa, { name: "Branch B only", amount: 500, audience: { branchIds: [w.B.id] }, discountPercent: 50 });
    const both = (await generate(w.sa, MONTH)).json.data;
    const of = (id: string) => both.willGet.find((r: { participantId: string }) => r.participantId === id);
    expect(of(w.cara).amount).toBe(1250); // 1000 + 500 less 50%
    expect(of(w.amina).amount).toBe(1000);
    expect(of(w.binta)).toBeUndefined();
    expect((await generate(w.sa, MONTH, true)).json.data.created).toBe(2);
    expect(Number((await db.programInvoice.findFirstOrThrow({ where: { participantId: w.cara } })).totalAmount)).toBe(1250);
  });

  test("a suspension does not cancel a fee; someone who has left owes nothing new; an archived fee is not billed", async () => {
    await item(w.sa, { name: "Monthly fee", amount: 100 });
    expect(
      (await post(`${PROGRAMS}/${w.program}/people/${w.hauwa}/standing`, w.sa, { action: "suspend", reason: "Disturbing the class" }))
        .status,
    ).toBe(200);
    expect(
      (await post(`${PROGRAMS}/${w.program}/people/${w.binta}/place`, w.sa, { action: "withdraw", reason: "Moved away" })).status,
    ).toBe(200);
    const plan = (await generate(w.sa, MONTH)).json.data;
    expect(plan.willGet.map((r: { participantId: string }) => r.participantId).sort()).toEqual([w.amina, w.cara, w.hauwa].sort());
    const feeId = (await db.programFeeItem.findFirstOrThrow()).id;
    expect((await send("PATCH", `${base()}/items/${feeId}`, w.sa, { status: "ARCHIVED" })).status).toBe(200);
    expect((await generate(w.sa, MONTH)).json.data).toMatchObject({ count: 0, items: 0 });
  });

  test("people with nobody to bill, a fully discounted fee, and a branch that has fees off are skipped with the reason", async () => {
    await item(w.sa, { name: "Guardian fee", amount: 100, billedTo: "GUARDIAN" });
    await db.programParticipant.update({ where: { id: w.hauwa }, data: { phone: null } });
    await db.studentRecord.updateMany({ where: { admissionNo: "2026/0002" }, data: { guardianPhone: null } });
    expect((await switchFor(w.adminB, { scope: "BRANCH", branchId: w.B.id, enabled: false })).status).toBe(200);
    const plan = (await generate(w.sa, MONTH)).json.data;
    expect(plan.willGet.map((r: { participantId: string }) => r.participantId)).toEqual([w.amina]);
    const reasons = Object.fromEntries(plan.skipped.map((s: { participantId: string; reason: string }) => [s.participantId, s.reason]));
    expect(reasons[w.hauwa]).toBe("No contact on record to bill.");
    expect(reasons[w.binta]).toBe("No contact on record to bill.");
    expect(reasons[w.cara]).toBe("Fees are switched off for this branch.");
  });

  test("a fee that is fully discounted leaves nothing to pay and makes no invoice", async () => {
    await item(w.sa, { name: "Free", amount: 100, discountPercent: 100, audience: { kinds: ["ADULT"] } });
    const plan = (await generate(w.sa, MONTH)).json.data;
    expect(plan.count).toBe(0);
    expect(plan.skipped).toEqual([{ participantId: w.hauwa, name: "Hauwa Bello", reason: "Fully discounted: nothing to pay." }]);
    expect((await generate(w.sa, MONTH, true)).json.data.created).toBe(0);
  });

  test("only a super admin or a program admin; an archived or completed program refuses to make invoices", async () => {
    await item(w.sa, {});
    for (const who of [w.adminA, w.teacher, w.supervisor]) {
      expect((await generate(who, MONTH)).status, who.name).toBe(403);
      expect((await generate(who, MONTH, true)).status).toBe(403);
    }
    expect((await generate(w.progAdmin, MONTH, true)).status).toBe(200);
    expect((await post(`${PROGRAMS}/${w.program}/status`, w.sa, { action: "archive" })).status).toBe(200);
    expect((await generate(w.sa, "2099-01", true)).json.error.code).toBe("PROGRAM_READ_ONLY");
    expect((await item(w.sa, { name: "Late" })).json.error.code).toBe("PROGRAM_READ_ONLY");
    expect((await invoices(w.sa)).status).toBe(200);
  });

  test("a fee made later is added to the open invoices of a period - never to one with a payment or a discount", async () => {
    const ids = await billed();
    expect((await pay(w.sa, ids[w.amina]!, 1000)).status).toBe(201);
    expect((await discount(w.sa, ids[w.binta]!, 100)).status).toBe(201);
    const late = await item(w.sa, { name: "Trip", amount: 700 });
    const tripId = late.json.data.id;
    const added = await post(`${base()}/items/${tripId}/add-to-open`, w.sa, { periodKey: MONTH });
    expect(added.status, added.text).toBe(200);
    expect(added.json.data).toEqual({ updated: 2, skipped: 2 });
    const totals = Object.fromEntries((await db.programInvoice.findMany()).map((r) => [r.participantId, Number(r.totalAmount)]));
    expect(totals).toEqual({ [w.amina]: 5000, [w.binta]: 4900, [w.cara]: 5700, [w.hauwa]: 5700 });
    expect((await post(`${base()}/items/${tripId}/add-to-open`, w.sa, { periodKey: MONTH })).json.data.updated).toBe(0); // already on them
    expect((await post(`${base()}/items/${tripId}/add-to-open`, w.sa, { periodKey: "once" })).json.error.code).toBe("WRONG_PERIOD");
    expect((await post(`${base()}/items/${tripId}/add-to-open`, w.adminA, { periodKey: MONTH })).status).toBe(403);
    expect(await db.programAudit.count({ where: { action: "FEE_ADDED_TO_OPEN_INVOICES" } })).toBe(2);
  });
});

test.describe("who sees which invoice", () => {
  test("a super admin and a program admin all; a branch administrator only through their own branch; the filters narrow it", async () => {
    const ids = await billed();
    const of = async (who: Person, qs = "") =>
      ((await invoices(who, qs)).json.data.invoices as { participantId: string }[]).map((r) => r.participantId).sort();
    expect(await of(w.sa)).toEqual([w.amina, w.binta, w.cara, w.hauwa].sort());
    expect(await of(w.progAdmin)).toEqual(await of(w.sa));
    expect(await of(w.adminA)).toEqual([w.amina, w.binta, w.hauwa].sort());
    expect(await of(w.adminB)).toEqual([w.cara]);
    // a filter on another branch never widens a branch administrator's reach
    expect(await of(w.adminA, `branchId=${w.B.id}`)).toEqual([]);
    expect(await of(w.sa, `branchId=${w.B.id}`)).toEqual([w.cara]);
    expect(await of(w.sa, `groupId=${w.juzA}`)).toEqual([w.amina, w.binta, w.cara].sort());
    expect(await of(w.sa, "q=amina")).toEqual([w.amina]);
    expect(await of(w.sa, "q=%25")).toEqual([]);
    expect(await of(w.sa, `status=PAID`)).toEqual([]);
    expect(await of(w.sa, `periodKey=${MONTH}`)).toHaveLength(4);
    expect((await invoices(w.sa, "status=BOGUS")).status).toBe(400);
    expect((await invoices(w.sa, "page=0")).status).toBe(400);
    expect((await inv(w.adminA, ids[w.amina]!)).status).toBe(200);
    expect((await inv(w.adminA, ids[w.cara]!)).status).toBe(404);
    expect((await inv(w.adminB, ids[w.amina]!)).status).toBe(404);
    expect((await inv(w.sa, "well-formed-but-nothing")).status).toBe(404);
    const one = (await inv(w.sa, ids[w.amina]!)).json.data;
    expect(one).toMatchObject({
      name: "Amina Pupil",
      total: 5000,
      paid: 0,
      balance: 5000,
      status: "UNPAID",
      invoiceNo: expect.stringMatching(/^PINV-\d{4}-\d{4}$/),
      can: { pay: true, discount: true },
    });
    expect(one.rule).toMatch(/./);
    expect(one.lines).toHaveLength(1);
  });

  test("the list pages 50 at a time", async () => {
    const ids = await billed();
    const a = ids[w.amina]!;
    const template = await db.programInvoice.findUniqueOrThrow({ where: { id: a } });
    // 54 more invoices of other periods for the same person
    await db.programInvoice.createMany({
      data: Array.from({ length: 54 }, (_, i) => ({
        programId: w.program,
        branchId: template.branchId,
        participantId: w.amina,
        periodKey: `${2030 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
        invoiceNo: `PINV-9999-${String(i + 1).padStart(4, "0")}`,
        totalAmount: 1,
        lineItems: [],
        createdByUserId: w.sa.id,
      })),
    });
    const first = await invoices(w.sa);
    expect(first.json.data.invoices).toHaveLength(50);
    expect(first.json.meta).toMatchObject({ total: 58, page: 1, pageSize: 50, hasNext: true });
    const second = await invoices(w.sa, "page=2");
    expect(second.json.data.invoices).toHaveLength(8);
    expect(second.json.meta.hasNext).toBe(false);
  });
});

test.describe("payments", () => {
  test("a payment is recorded with a receipt; the balance and status follow; a full payment settles it", async () => {
    const ids = await billed();
    const id = ids[w.amina]!;
    const first = await pay(w.sa, id, 2000, { notes: "Part one", reference: "BANK-001" });
    expect(first.status, first.text).toBe(201);
    expect(first.json.data).toMatchObject({
      balance: 3000,
      status: "PARTIALLY_PAID",
      receiptNo: expect.stringMatching(/^RCP-[A-Z0-9]+-\d{4}-\d{4}$/),
    });
    const rows = await db.programPayment.findMany();
    expect(rows[0]).toMatchObject({
      provider: "MANUAL",
      status: "SUCCESS",
      channel: "cash",
      providerRef: "BANK-001",
      recordedByUserId: w.sa.id,
      verifiedServerSide: true,
    });
    const second = await pay(w.progAdmin, id, 3000);
    expect(second.json.data).toMatchObject({ balance: 0, status: "PAID" });
    expect(second.json.data.receiptNo).not.toBe(first.json.data.receiptNo);
    const settled = (await inv(w.sa, id)).json.data;
    expect(settled).toMatchObject({ paid: 5000, balance: 0, status: "PAID", can: { pay: false } });
    expect(settled.payments).toHaveLength(2);
    expect((await pay(w.sa, id, 1)).json.error.code).toBe("ALREADY_PAID");
    expect(await db.programAudit.count({ where: { action: "PAYMENT_RECORDED" } })).toBe(2);
  });

  test("the amount: more than zero, at most two decimals, never more than is owed; a reference is used once", async () => {
    const ids = await billed();
    const id = ids[w.amina]!;
    for (const amount of [0, -5, 12.345]) expect((await pay(w.sa, id, amount)).status, String(amount)).toBe(400);
    expect((await pay(w.sa, id, 5000.01)).json.error.code).toBe("EXCEEDS_BALANCE");
    expect((await post(`${base()}/invoices/${id}/payments`, w.sa, { amount: "100" })).status).toBe(400);
    expect((await post(`${base()}/invoices/${id}/payments`, w.sa, { amount: 100, extra: 1 })).status).toBe(400);
    expect((await pay(w.sa, id, 100, { reference: "R-1" })).status).toBe(201);
    const dup = await pay(w.sa, id, 100, { reference: "R-1" });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("DUPLICATE_REFERENCE");
    expect(await db.programPayment.count()).toBe(1);
  });

  test("the school's part-payment rule applies, and so does 'pay in full only' on one invoice", async () => {
    const ids = await billed();
    expect((await rule({ allowed: true, minimum: { kind: "AMOUNT", value: 2000 } })).status).toBe(200);
    const low = await pay(w.sa, ids[w.amina]!, 1999);
    expect(low.status).toBe(409);
    expect(low.json.error.code).toBe("BELOW_MINIMUM");
    expect((await pay(w.sa, ids[w.amina]!, 2000)).status).toBe(201);
    // the part that settles the balance is always allowed, even under the smallest part
    expect((await pay(w.sa, ids[w.amina]!, 3000)).json.data.status).toBe("PAID");
    expect((await rule({ allowed: false, minimum: { kind: "NONE" } })).status).toBe(200);
    expect((await pay(w.sa, ids[w.binta]!, 100)).json.error.code).toBe("PAY_IN_FULL");
    expect((await pay(w.sa, ids[w.binta]!, 5000)).json.data.status).toBe("PAID");
    expect((await rule({ allowed: true, minimum: { kind: "NONE" } })).status).toBe(200);
    expect((await pay(w.sa, ids[w.cara]!, 100)).status).toBe(201);
    const marked = await send("PATCH", `${base()}/invoices/${ids[w.hauwa]}`, w.sa, { payInFull: true });
    expect(marked.json.data).toEqual({ payInFull: true });
    expect((await pay(w.sa, ids[w.hauwa]!, 100)).json.error.code).toBe("PAY_IN_FULL");
    expect((await send("PATCH", `${base()}/invoices/${ids[w.hauwa]}`, w.sa, { payInFull: false })).status).toBe(200);
    expect((await pay(w.sa, ids[w.hauwa]!, 100)).status).toBe(201);
    expect((await send("PATCH", `${base()}/invoices/${ids[w.binta]}`, w.sa, { payInFull: true })).json.error.code).toBe("NOT_OPEN");
    expect((await send("PATCH", `${base()}/invoices/${ids[w.cara]}`, w.sa, { payInFull: "yes" })).status).toBe(400);
  });

  test("a branch administrator takes payments only through their own branch; a teacher and a supervisor take none", async () => {
    const ids = await billed();
    expect((await pay(w.adminA, ids[w.amina]!, 500)).status).toBe(201);
    expect((await pay(w.adminA, ids[w.cara]!, 500)).status).toBe(404);
    expect((await pay(w.adminB, ids[w.cara]!, 500)).status).toBe(201);
    expect((await pay(w.adminB, ids[w.amina]!, 500)).status).toBe(404);
    expect((await send("PATCH", `${base()}/invoices/${ids[w.cara]}`, w.adminA, { payInFull: true })).status).toBe(404);
    expect((await send("PATCH", `${base()}/invoices/${ids[w.amina]}`, w.adminA, { payInFull: true })).status).toBe(200);
    for (const who of [w.teacher, w.supervisor, w.recorder]) expect((await pay(who, ids[w.amina]!, 100)).status, who.name).toBe(403);
    expect(await db.programPayment.count()).toBe(2);
  });

  test("two payments at once cannot together take more than the balance", async () => {
    const ids = await billed();
    const id = ids[w.amina]!;
    const results = await Promise.all([pay(w.sa, id, 3000), pay(w.progAdmin, id, 3000), pay(w.adminA, id, 3000)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const row = await db.programInvoice.findUniqueOrThrow({ where: { id } });
    expect(Number(row.amountPaid)).toBe(3000);
    expect(await db.programPayment.count()).toBe(1);
  });

  test("a program that is archived still takes payments on its open invoices", async () => {
    const ids = await billed();
    expect((await post(`${PROGRAMS}/${w.program}/status`, w.sa, { action: "archive" })).status).toBe(200);
    expect((await pay(w.sa, ids[w.amina]!, 1000)).status).toBe(201);
    expect((await discount(w.sa, ids[w.binta]!, 100)).status).toBe(201);
    expect((await get(`${base()}/report`, w.sa)).status).toBe(200);
  });
});

test.describe("discounts", () => {
  test("a discount lowers the total, is kept with who and why, and cannot take it below what was paid", async () => {
    const ids = await billed();
    const id = ids[w.amina]!;
    const given = await discount(w.progAdmin, id, 1000, "Sibling discount");
    expect(given.status, given.text).toBe(201);
    expect(given.json.data).toMatchObject({ total: 4000, status: "UNPAID" });
    expect((await pay(w.sa, id, 3000)).json.data).toMatchObject({ balance: 1000, status: "PARTIALLY_PAID" });
    const tooMuch = await discount(w.sa, id, 1500);
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.json.error.code).toBe("DISCOUNT_TOO_LARGE");
    expect((await discount(w.sa, id, 1000, "Scholarship")).json.data).toMatchObject({ total: 3000, status: "PAID" });
    const view = (await inv(w.sa, id)).json.data;
    expect(view.discounts.map((d: { amount: number; reason: string; by: string }) => [d.amount, d.reason, d.by])).toEqual([
      [1000, "Sibling discount", "Program Admin"],
      [1000, "Scholarship", "Super Admin"],
    ]);
    expect((await discount(w.sa, id, 1)).json.error.code).toBe("NOT_OPEN");
    expect(await db.programAudit.count({ where: { action: "DISCOUNT_APPLIED" } })).toBe(2);
  });

  test("the shape and the reach: a reason is needed; a branch administrator discounts only their branch; a teacher cannot", async () => {
    const ids = await billed();
    for (const bad of [
      { amount: 0, reason: "Fine" },
      { amount: 10, reason: "x" },
      { amount: 10 },
      { amount: 10.123, reason: "Fine" },
      { amount: 10, reason: "Fine", extra: 1 },
    ])
      expect((await post(`${base()}/invoices/${ids[w.amina]}/discounts`, w.sa, bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await discount(w.adminA, ids[w.amina]!, 100)).status).toBe(201);
    expect((await discount(w.adminA, ids[w.cara]!, 100)).status).toBe(404);
    expect((await discount(w.teacher, ids[w.amina]!, 100)).status).toBe(403);
  });
});

test.describe("the gateway and its webhook", () => {
  const webhook = (reference: string, kobo: number) => {
    const payload = mockPaystack.generateWebhookPayload(reference, TEST_PAYSTACK_SECRET, kobo, "parent@example.com");
    return api("/api/v1/webhooks/paystack", {
      method: "POST",
      headers: { "x-paystack-signature": payload.signature, "content-type": "application/json" },
      rawBody: payload.rawBody,
    });
  };
  const start = (who: Person, id: string, body: Record<string, unknown>) => post(`${base()}/invoices/${id}/pay`, who, body);

  test("a payment is started under the rule, the signed webhook completes it with a receipt, and a repeat does nothing", async () => {
    const ids = await billed();
    const id = ids[w.amina]!;
    const started = await start(w.sa, id, { email: "parent@example.com", amount: 2000 });
    expect(started.status, started.text).toBe(201);
    expect(started.json.data.reference).toMatch(/^prg_pay_/);
    expect(started.json.data.authorizationUrl).toMatch(/^https?:/); // the mock gateway of the tests answers on http
    expect((await db.programPayment.findFirstOrThrow()).status).toBe("PENDING");
    expect(Number((await db.programInvoice.findUniqueOrThrow({ where: { id } })).amountPaid)).toBe(0);

    const first = await webhook(started.json.data.reference, 200_000);
    expect(first.status).toBe(200);
    const row = await db.programInvoice.findUniqueOrThrow({ where: { id } });
    expect(Number(row.amountPaid)).toBe(2000);
    expect(row.status).toBe("PARTIALLY_PAID");
    const payment = await db.programPayment.findFirstOrThrow();
    expect(payment).toMatchObject({ status: "SUCCESS", verifiedServerSide: true });
    expect(payment.receiptNo).toMatch(/^RCP-[A-Z0-9]+-\d{4}-\d{4}$/);
    expect((await webhook(started.json.data.reference, 200_000)).status).toBe(200);
    expect(Number((await db.programInvoice.findUniqueOrThrow({ where: { id } })).amountPaid)).toBe(2000);
    // the school's own invoices and payments were never touched
    expect(await db.payment.count()).toBe(0);
  });

  test("a wrong amount is refused and nothing is changed; an unsigned delivery is refused", async () => {
    const ids = await billed();
    const started = await start(w.sa, ids[w.amina]!, { email: "parent@example.com" });
    expect(started.json.data.amount).toBe(5000);
    expect((await webhook(started.json.data.reference, 100_000)).status).toBe(200); // a deliberate refusal is answered 200 (retrying cannot change it)
    expect((await db.programPayment.findFirstOrThrow()).status).toBe("PENDING");
    expect(Number((await db.programInvoice.findUniqueOrThrow({ where: { id: ids[w.amina] } })).amountPaid)).toBe(0);
    const unsigned = await api("/api/v1/webhooks/paystack", {
      method: "POST",
      headers: { "x-paystack-signature": "0".repeat(128), "content-type": "application/json" },
      rawBody: "{}",
    });
    expect(unsigned.status).toBe(401);
  });

  test("the rule applies when starting, not when the webhook arrives: money already taken is accepted even if the rule changed", async () => {
    const ids = await billed();
    const id = ids[w.amina]!;
    const started = await start(w.sa, id, { email: "parent@example.com", amount: 1000 });
    expect(started.status).toBe(201);
    expect((await rule({ allowed: false, minimum: { kind: "NONE" } })).status).toBe(200);
    expect((await start(w.sa, id, { email: "parent@example.com", amount: 1000 })).json.error.code).toBe("PAY_IN_FULL");
    expect((await webhook(started.json.data.reference, 100_000)).status).toBe(200);
    expect(Number((await db.programInvoice.findUniqueOrThrow({ where: { id } })).amountPaid)).toBe(1000);
  });

  test("a discount given after a payment was started does not make the payment fail: the total is raised to what was paid, and audited", async () => {
    const ids = await billed();
    const id = ids[w.amina]!;
    const started = await start(w.sa, id, { email: "parent@example.com" }); // the whole 5,000
    expect((await discount(w.sa, id, 2000)).status).toBe(201);
    expect((await webhook(started.json.data.reference, 500_000)).status).toBe(200);
    const row = await db.programInvoice.findUniqueOrThrow({ where: { id } });
    expect([Number(row.amountPaid), Number(row.totalAmount), row.status]).toEqual([5000, 5000, "PAID"]);
    expect(await db.programAudit.count({ where: { action: "OVERPAYMENT_ACCEPTED" } })).toBe(1);
  });

  test("only the people who may record a payment may start one; the shape is checked; no callback address is taken", async () => {
    const ids = await billed();
    expect((await start(w.teacher, ids[w.amina]!, { email: "p@example.com" })).status).toBe(403);
    expect((await start(w.adminA, ids[w.cara]!, { email: "p@example.com" })).status).toBe(404);
    expect((await start(w.adminA, ids[w.amina]!, { email: "p@example.com" })).status).toBe(201);
    for (const bad of [
      {},
      { email: "nope" },
      { email: "p@example.com", amount: 0 },
      { email: "p@example.com", callbackUrl: "https://evil.example" },
      { email: "p@example.com", amount: 6000 },
    ])
      expect((await start(w.sa, ids[w.binta]!, bad)).status, JSON.stringify(bad)).toBeGreaterThanOrEqual(400);
  });
});

test.describe("the report", () => {
  test("collected, outstanding and the rate overall, per branch and per group; who owes; only what the caller may see", async () => {
    const ids = await billed();
    await pay(w.sa, ids[w.amina]!, 5000);
    await pay(w.sa, ids[w.cara]!, 2000);
    await discount(w.sa, ids[w.binta]!, 1000);
    const report = (await get(`${base()}/report`, w.sa)).json.data;
    expect(report.totals).toEqual({ billed: 19_000, collected: 7000, outstanding: 12_000, rate: 36.8, invoices: 4 });
    const branch = Object.fromEntries(
      report.byBranch.map((b: { branchId: string; billed: number; collected: number }) => [b.branchId, [b.billed, b.collected]]),
    );
    expect(branch).toEqual({ [w.A.id]: [14_000, 5000], [w.B.id]: [5000, 2000] });
    expect(report.byGroup.map((g: { path: string; billed: number }) => [g.path, g.billed])).toEqual([
      ["Juz A–Group 1", 10_000],
      ["Juz A–Group 2", 4000],
      ["Juz B", 5000],
    ]);
    expect(report.owing.map((o: { name: string; outstanding: number }) => [o.name, o.outstanding])).toEqual(
      [
        ["Hauwa Bello", 5000],
        ["Cara Pupil", 3000],
        ["Binta Pupil", 4000],
      ].sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0]))),
    );
    const forB = (await get(`${base()}/report`, w.adminB)).json.data;
    expect(forB.totals).toMatchObject({ billed: 5000, collected: 2000, outstanding: 3000, invoices: 1 });
    expect(forB.byBranch).toHaveLength(1);
    expect(forB.owing.map((o: { name: string }) => o.name)).toEqual(["Cara Pupil"]);
    // an empty program
    await db.programPayment.deleteMany();
    await db.programInvoiceDiscount.deleteMany();
    await db.programInvoice.deleteMany();
    expect((await get(`${base()}/report`, w.sa)).json.data.totals).toEqual({
      billed: 0,
      collected: 0,
      outstanding: 0,
      rate: null,
      invoices: 0,
    });
  });
});

test.describe("the database", () => {
  test("refuses what the service would: a second invoice for a period, an overpaid invoice, a negative payment, a bad period, a person of another program", async () => {
    const ids = await billed();
    const template = await db.programInvoice.findUniqueOrThrow({ where: { id: ids[w.amina] } });
    const make = (over: Record<string, unknown>) =>
      db.programInvoice.create({
        data: {
          programId: w.program,
          branchId: template.branchId,
          participantId: w.binta,
          periodKey: "2031-01",
          invoiceNo: `PINV-8888-${Math.random().toString().slice(2, 8)}`,
          totalAmount: 10,
          lineItems: [],
          createdByUserId: w.sa.id,
          ...over,
        },
      });
    await expect(make({ periodKey: MONTH })).rejects.toThrow(); // one per person and period
    await expect(make({ periodKey: "2031-13" })).rejects.toThrow();
    await expect(make({ amountPaid: 11 })).rejects.toThrow();
    await expect(make({ totalAmount: -1 })).rejects.toThrow();
    await expect(make({ invoiceNo: template.invoiceNo })).rejects.toThrow();
    await expect(make({ branchId: (await db.branch.create({ data: { name: "Not in the program" } })).id })).rejects.toThrow(); // a branch the program does not run in
    await expect(
      db.programPayment.create({
        data: { programId: w.program, branchId: template.branchId, invoiceId: template.id, amount: 0, providerRef: "x1" },
      }),
    ).rejects.toThrow();
    const other = await post(PROGRAMS, w.sa, { name: "Elsewhere", kind: "ONGOING", branchIds: [w.A.id], levelLabels: ["Class"] });
    await expect(make({ programId: other.json.data.id })).rejects.toThrow();
    await expect(
      db.programFeeItem.create({ data: { programId: w.program, name: " x", amount: 1, createdByUserId: w.sa.id } }),
    ).rejects.toThrow();
    await expect(
      db.programFeeItem.create({ data: { programId: w.program, name: "ok", amount: 1, dueDay: 31, createdByUserId: w.sa.id } }),
    ).rejects.toThrow();
    await expect(
      db.programInvoiceDiscount.create({
        data: { programId: w.program, invoiceId: template.id, amount: 1, reason: "no", appliedByUserId: w.sa.id },
      }),
    ).rejects.toThrow();
    // an invoice with payments cannot be removed
    await db.programPayment.create({
      data: { programId: w.program, branchId: template.branchId, invoiceId: template.id, amount: 1, providerRef: "x2", status: "SUCCESS" },
    });
    await expect(db.programInvoice.delete({ where: { id: template.id } })).rejects.toThrow();
  });
});
