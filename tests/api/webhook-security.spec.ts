import { HTTP_URL, TEST_PAYSTACK_SECRET } from "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { Gender, Role } from "@prisma/client";
import { createUser, db, resetDatabase, seedInstance } from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";
import { MOCK_PAYSTACK_SECRET } from "@/lib/finance/paystack";

// The public Paystack webhook (the maintainer's standing rule, 2026-10-19: test edge cases and fuzz security code). Found by the bug hunt the same day:
//   - it verified with `PAYSTACK_SECRET_KEY || "mock_secret"`: anyone who knew a payment reference could sign a charge.success and mark an invoice paid;
//   - it wrote its audit ledger BEFORE checking the signature, keyed by an event id the sender chose: unsigned requests filled the table and could overwrite a
//     genuine event's row;
//   - an event without an id got one made from the clock, so the same body was a new event every time.
// The servers under test are production-shaped with the mock gateway forced on and a harness key (tests/support/env.ts), which is NOT the public mock secret.

let home: { id: string; name: string };
let admin: { cookie: string };
let counter = 0;

test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
  const user = await createUser({ superAdmin: false });
  await db.membership.create({ data: { userId: user.id, branchId: home.id, role: Role.ADMIN } });
  admin = { cookie: cookieHeader((await loginAs(user)).token!) };
});

const sign = (body: string | Buffer, secret = TEST_PAYSTACK_SECRET) => crypto.createHmac("sha512", secret).update(body).digest("hex");
const chargeBody = (reference: string, amountKobo: number, id: number | null = Date.now() + ++counter) =>
  JSON.stringify({
    event: "charge.success",
    data: { ...(id === null ? {} : { id }), reference, amount: amountKobo, status: "success", channel: "card" },
  });
const deliver = (raw: string | Buffer, signature: string | undefined) =>
  api("/api/v1/webhooks/paystack", {
    method: "POST",
    rawBody: raw as string,
    headers: signature === undefined ? {} : { "x-paystack-signature": signature },
    origin: null, // Paystack sends no Origin
  });
const ledgerCount = () => db.paymentWebhookEvent.count();

/// A real pending online payment, started through the API exactly as an administrator would.
async function pendingPayment(naira = 45000) {
  const n = ++counter;
  const session = await db.academicSession.create({
    data: {
      branchId: home.id,
      label: `S-${n}-${Date.now()}`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-07-31"),
      status: "PLANNED",
    },
  });
  const period = await db.academicPeriod.create({
    data: { branchId: home.id, sessionId: session.id, ordinal: 1, label: "1st Term", startDate: new Date("2026-09-01"), isCurrent: false },
  });
  const student = await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Ada",
      lastName: `Hook${n}`,
      admissionNo: `WH/${Date.now()}/${n}`,
      gender: Gender.FEMALE,
      dateOfBirth: new Date("2012-05-15"),
    },
  });
  const invoice = await db.invoice.create({
    data: {
      branchId: home.id,
      studentId: student.id,
      periodId: period.id,
      invoiceNo: `INV-WH-${Date.now()}-${n}`,
      totalAmount: naira,
      amountPaid: 0,
      status: "UNPAID",
    },
  });
  const started = await api(`/api/v1/finance/invoices/${invoice.id}/pay?branchId=${home.id}`, {
    method: "POST",
    cookie: admin.cookie,
    body: { email: "parent@example.com", amount: naira },
  });
  expect(started.status, started.text).toBe(200);
  return { invoice, reference: started.json.data.reference as string, kobo: naira * 100 };
}
const invoiceNow = (id: string) => db.invoice.findUniqueOrThrow({ where: { id }, include: { payments: true } });

test.describe("who may say a payment happened", () => {
  test("THE EXPLOIT: a charge.success signed with the public string 'mock_secret' (the old fallback) is refused; nothing is paid", async () => {
    const { invoice, reference, kobo } = await pendingPayment();
    for (const secret of ["mock_secret", MOCK_PAYSTACK_SECRET, "mock_sk_test_octalve_secret", "secret", ""]) {
      const raw = chargeBody(reference, kobo);
      const before = await ledgerCount();
      const res = await deliver(raw, sign(raw, secret || "x"));
      expect(res.status, `signed with ${JSON.stringify(secret)}`).toBe(401);
      expect(await ledgerCount()).toBe(before);
    }
    const after = await invoiceNow(invoice.id);
    expect(after.status).toBe("UNPAID");
    expect(Number(after.amountPaid)).toBe(0);
    expect(after.payments[0].status).toBe("PENDING");
  });

  test("a delivery signed with the server's own key is accepted once: invoice paid, receipt allocated; a replay is a no-op duplicate", async () => {
    const { invoice, reference, kobo } = await pendingPayment();
    const raw = chargeBody(reference, kobo, 9_100_001);
    const first = await deliver(raw, sign(raw));
    expect(first.status, first.text).toBe(200);
    expect(first.json).toMatchObject({ received: true, status: "processed", eventId: "9100001" });
    const paid = await invoiceNow(invoice.id);
    expect(paid.status).toBe("PAID");
    expect(Number(paid.amountPaid)).toBe(kobo / 100);
    expect(paid.payments[0]).toMatchObject({ status: "SUCCESS", verifiedServerSide: true });
    expect(paid.payments[0].receiptNo).toMatch(/^RCP-/);

    const replay = await deliver(raw, sign(raw));
    expect(replay.status).toBe(200);
    expect(replay.json).toMatchObject({ status: "processed", duplicate: true });
    const still = await invoiceNow(invoice.id);
    expect(Number(still.amountPaid)).toBe(kobo / 100);
    expect(still.payments).toHaveLength(1);
    expect(await db.paymentWebhookEvent.count({ where: { eventId: "9100001" } })).toBe(1);
  });
});

test.describe("an unsigned or wrongly signed delivery writes NOTHING", () => {
  test("no header, empty, garbage, wrong-length, right-length-wrong-value, huge and unicode headers: 401 and the ledger is untouched", async () => {
    const { reference, kobo } = await pendingPayment();
    const raw = chargeBody(reference, kobo);
    const good = sign(raw);
    const headers: Array<string | undefined> = [
      undefined,
      "",
      " ",
      "garbage",
      good.slice(0, 127),
      `${good}0`,
      "0".repeat(128),
      good.replace(/.$/, good.endsWith("0") ? "1" : "0"),
      "f".repeat(8000),
      "é".repeat(128), // Latin-1 high bytes are sendable; wider characters are refused by fetch itself (the unit fuzz covers them against verifyPaystackSignature)
      sign(raw, "mock_secret"),
    ];
    const before = await ledgerCount();
    for (const header of headers) {
      const res = await deliver(raw, header);
      expect(res.status, JSON.stringify(header)?.slice(0, 40)).toBe(401);
    }
    expect(await ledgerCount()).toBe(before);
  });

  test("not JSON, an empty body, a JSON array and a huge-but-allowed body, all with a bad signature: 401 and nothing written", async () => {
    const before = await ledgerCount();
    for (const raw of [
      "",
      "not json",
      "[]",
      "null",
      "{",
      "\u0000\u0001",
      JSON.stringify({ data: { id: 5, reference: "x".repeat(150_000) } }),
    ]) {
      const res = await deliver(raw, "0".repeat(128));
      expect(res.status, raw.slice(0, 20)).toBe(401);
    }
    expect(await ledgerCount()).toBe(before);
  });

  test("an unsigned request that carries a GENUINE event's id cannot overwrite that event's ledger row", async () => {
    const { reference, kobo } = await pendingPayment();
    const raw = chargeBody(reference, kobo, 9_100_002);
    expect((await deliver(raw, sign(raw))).status).toBe(200);
    const genuine = await db.paymentWebhookEvent.findFirstOrThrow({ where: { eventId: "9100002" } });
    expect(genuine).toMatchObject({ signatureValid: true });
    expect(genuine.processedAt).not.toBeNull();

    // same id, different body, no signature (and a wrong one): the old code upserted this to signatureValid=false with a new processedAt
    for (const header of [undefined, "0".repeat(128)]) {
      const forged = JSON.stringify({ event: "charge.failed", data: { id: 9_100_002, reference: "x" } });
      expect((await deliver(forged, header)).status).toBe(401);
    }
    const after = await db.paymentWebhookEvent.findFirstOrThrow({ where: { eventId: "9100002" } });
    expect(after).toMatchObject({ signatureValid: true, rawPayloadHash: genuine.rawPayloadHash });
    expect(after.processedAt?.getTime()).toBe(genuine.processedAt?.getTime());
    expect(await db.paymentWebhookEvent.count({ where: { eventId: "9100002" } })).toBe(1);
  });
});

test.describe("what a signed delivery may and may not do", () => {
  test("an amount that does not match is a refusal: 200 (retrying cannot help), the payment stays PENDING, the reason is on the ledger row", async () => {
    const { invoice, reference, kobo } = await pendingPayment();
    for (const amount of [kobo - 1, kobo + 1, 1, 0, -kobo, kobo * 100, kobo + 0.5]) {
      const raw = chargeBody(reference, amount);
      const res = await deliver(raw, sign(raw));
      expect(res.status, `amount ${amount}`).toBe(200);
      expect(res.json.status, `amount ${amount}`).toMatch(/refused|ignored/);
    }
    const after = await invoiceNow(invoice.id);
    expect(after.status).toBe("UNPAID");
    expect(after.payments[0].status).toBe("PENDING");
    const refused = await db.paymentWebhookEvent.findMany({ where: { error: { not: null } } });
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((row) => row.processedAt === null)).toBe(true);

    // the right amount, as a new event, still goes through afterwards
    const ok = chargeBody(reference, kobo);
    expect((await deliver(ok, sign(ok))).json.status).toBe("processed");
    expect((await invoiceNow(invoice.id)).status).toBe("PAID");
  });

  test("events that are not charge.success, and a charge.success for an unknown reference, change nothing", async () => {
    const { invoice, kobo } = await pendingPayment();
    for (const raw of [
      JSON.stringify({ event: "charge.failed", data: { id: Date.now() + ++counter, reference: "x", amount: kobo } }),
      JSON.stringify({ event: "transfer.success", data: { id: Date.now() + ++counter } }),
      JSON.stringify({ event: 42, data: "nope" }),
      chargeBody("alm_pay_does_not_exist", kobo),
    ]) {
      const res = await deliver(raw, sign(raw));
      expect(res.status, raw.slice(0, 40)).toBe(200);
    }
    const after = await invoiceNow(invoice.id);
    expect(after.status).toBe("UNPAID");
    expect(after.payments[0].status).toBe("PENDING");
  });

  test("an event with NO id of its own gets one from its payload, never the clock: the same signed body twice is ONE event", async () => {
    const { reference, kobo } = await pendingPayment();
    const raw = JSON.stringify({ event: "charge.success", data: { reference, amount: kobo + 7 } }); // wrong amount: refused, stays unprocessed
    const before = await ledgerCount();
    const a = await deliver(raw, sign(raw));
    const b = await deliver(raw, sign(raw));
    expect(a.json.eventId).toBe(reference);
    expect(b.json.eventId).toBe(a.json.eventId);
    expect((await ledgerCount()) - before).toBe(1);

    const bare = JSON.stringify({ event: "ping" });
    const x = await deliver(bare, sign(bare));
    const y = await deliver(bare, sign(bare));
    expect(x.json.eventId).toMatch(/^sha256:[0-9a-f]{32}$/);
    expect(y.json.eventId).toBe(x.json.eventId);
  });

  test("eight identical signed deliveries at once fulfil the payment exactly once and are never a 400 or 500", async () => {
    const { invoice, reference, kobo } = await pendingPayment();
    const raw = chargeBody(reference, kobo, 9_100_003);
    const sig = sign(raw);
    const results = await Promise.all(Array.from({ length: 8 }, () => deliver(raw, sig)));
    for (const res of results) expect([200, 503], `${res.status} ${res.text}`).toContain(res.status);
    expect(results.some((res) => res.status === 200)).toBe(true);

    const after = await invoiceNow(invoice.id);
    expect(after.status).toBe("PAID");
    expect(Number(after.amountPaid)).toBe(kobo / 100); // paid once, not eight times
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0].receiptNo).toMatch(/^RCP-/);
    expect(await db.payment.count({ where: { invoiceId: invoice.id, status: "SUCCESS" } })).toBe(1);
    expect(await db.paymentWebhookEvent.count({ where: { eventId: "9100003" } })).toBe(1);
    const again = await deliver(raw, sig);
    expect(again.json).toMatchObject({ status: "processed", duplicate: true });
  });
});

test.describe("fuzz: validly signed bodies of any shape never crash the endpoint and never pay anything", () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const next = mulberry32(20261019);
  const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)];
  const junk = (depth = 0): unknown =>
    pick<() => unknown>([
      () => null,
      () => true,
      () => Math.floor(next() * 2 ** 40),
      () => -Math.floor(next() * 1000),
      () => next() * 100,
      () => 1e308,
      () => Number.MAX_SAFE_INTEGER,
      () => "",
      () => "x".repeat(Math.floor(next() * 400)),
      () =>
        pick([
          "charge.success",
          '\'; DROP TABLE "Payment";--',
          "../../etc/passwd",
          "\u0000",
          "\u202e",
          "${jndi:ldap://x}",
          "{{7*7}}",
          "é😀",
          "__proto__",
        ]),
      () => (depth < 3 ? Array.from({ length: Math.floor(next() * 4) }, () => junk(depth + 1)) : []),
      () =>
        depth < 3
          ? Object.fromEntries(
              Array.from({ length: Math.floor(next() * 4) }, () => [
                pick(["id", "reference", "amount", "channel", "__proto__", "constructor", "a"]),
                junk(depth + 1),
              ]),
            )
          : {},
    ])();

  test("200 random signed bodies: always 200 or 4xx/503-by-design, never 500; no payment is fulfilled", async () => {
    const { invoice } = await pendingPayment();
    const statuses = new Map<number, number>();
    for (let i = 0; i < 200; i++) {
      const body =
        next() < 0.5
          ? JSON.stringify({ event: junk(), data: junk() })
          : JSON.stringify({
              event: next() < 0.7 ? "charge.success" : junk(),
              data: { id: junk(), reference: junk(), amount: junk(), channel: junk() },
            });
      const res = await deliver(body, sign(body));
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
      expect([200, 503], `body ${body.slice(0, 120)} -> ${res.status} ${res.text.slice(0, 120)}`).toContain(res.status);
    }
    expect(statuses.get(500) ?? 0).toBe(0);
    const after = await invoiceNow(invoice.id);
    expect(after.payments[0].status).toBe("PENDING");
    expect(after.status).toBe("UNPAID");
  });
});

// Last on purpose: the oversize tests make the server drop their connections (it stops reading at the cap), and a pooled dead socket must not be reused by another test.
test.describe("size limits", () => {
  test("a body over 256 KB is refused with 413 before anything is read into the ledger, whatever its signature", async () => {
    const big = JSON.stringify({ event: "x", data: { id: 1, blob: "a".repeat(300_000) } });
    const before = await ledgerCount();
    expect((await deliver(big, sign(big))).status).toBe(413);
    expect((await deliver(big, undefined)).status).toBe(413);
    expect(await ledgerCount()).toBe(before);
  });

  test("a body just under the cap and signed is handled normally", async () => {
    const edge = JSON.stringify({ event: "ping", data: { id: Date.now() + ++counter, blob: "a".repeat(250_000) } });
    const res = await deliver(edge, sign(edge));
    expect(res.status).toBe(200);
  });

  test("a CHUNKED body with no Content-Length that runs past the cap is refused with 413 (the server stops reading at the cap)", async () => {
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 40) return controller.close(); // 2.5 MB if it were all read
        sent++;
        controller.enqueue(chunk);
      },
    });
    const before = await ledgerCount();
    const res = await fetch(`${HTTP_URL}/api/v1/webhooks/paystack`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-paystack-signature": "0".repeat(128), "x-real-ip": "10.77.0.9" },
      body: stream,
      duplex: "half", // Node's fetch needs this for a streamed request body
    } as RequestInit & { duplex: "half" });
    expect(res.status).toBe(413);
    expect(await ledgerCount()).toBe(before);
  });
});
