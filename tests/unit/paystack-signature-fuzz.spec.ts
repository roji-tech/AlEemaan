import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { computePayloadHash, verifyPaystackSignature } from "@/lib/finance/crypto";
import { webhookEventId } from "@/lib/finance/service";

// Fuzz and edge cases for the webhook signature check (the maintainer's standing rule, 2026-10-19: always fuzz and edge-test security code). Seeded and
// deterministic. Properties:
//   S1  a header that is not the HMAC-SHA512 of the exact body under the secret NEVER verifies, and verifying NEVER throws;
//   S2  the one valid signature verifies, and ANY change to the body, the secret or one character of the signature stops it;
//   S3  the public mock secrets are just wrong secrets: a body signed with them does not verify under a real key.

const SECRET = "sk_test_harness_key_aleemaan_0123456789";
const sign = (body: string | Buffer, secret = SECRET) => crypto.createHmac("sha512", secret).update(body).digest("hex");

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
const HEX = "0123456789abcdef";
const randomHex = (next: () => number, n: number) => Array.from({ length: n }, () => HEX[Math.floor(next() * 16)]).join("");
const HOSTILE = [
  "",
  " ",
  "\n",
  "\t",
  "\u0000",
  "0",
  "null",
  "undefined",
  "NaN",
  "%00",
  "../",
  "'",
  '"',
  "\\",
  "\u202e",
  "😀",
  "é",
  "İ",
  "K",
  "ǅ",
  "ß",
  "ﬃ",
  "０１２３",
];

const body = JSON.stringify({ event: "charge.success", data: { id: 42, reference: "alm_pay_x", amount: 4500000 } });
const good = sign(body);

test.describe("S1: a wrong header never verifies and never throws", () => {
  test("6000 random 128-hex headers (the right length and alphabet, the wrong value)", () => {
    const next = mulberry32(1);
    for (let i = 0; i < 6000; i++) {
      const header = randomHex(next, 128);
      if (header === good) continue;
      let result: unknown;
      expect(() => (result = verifyPortalLike(header))).not.toThrow();
      expect(result).toBe(false);
    }
  });

  test("random strings of every length and hostile unicode", () => {
    const next = mulberry32(2);
    for (let i = 0; i < 4000; i++) {
      const length = Math.floor(next() * 300);
      let header = "";
      for (let j = 0; j < length; j++)
        header += next() < 0.5 ? HOSTILE[Math.floor(next() * HOSTILE.length)] : String.fromCharCode(32 + Math.floor(next() * 95));
      expect(verifyPortalLike(header), JSON.stringify(header)).toBe(false);
    }
  });

  test("empty, missing, whitespace and truncated headers", () => {
    for (const header of [undefined, null, "", " ", "\n", "   \t  "])
      expect(verifyPaystackSignature(body, header as string, SECRET), String(header)).toBe(false);
    for (let i = 0; i < good.length; i++) expect(verifyPaystackSignature(body, good.slice(0, i), SECRET), `cut at ${i}`).toBe(false);
    for (const suffix of ["0", "00", " x", "\u0000", "=="])
      expect(verifyPaystackSignature(body, good + suffix, SECRET), JSON.stringify(suffix)).toBe(false);
  });

  test("a header made of Unicode that lower-cases or encodes to the right LENGTH but not the right bytes", () => {
    // 128 two-byte characters: 256 bytes, not 128; 64 four-byte characters; the dotted capital I lower-cases to TWO code points.
    for (const header of [
      "é".repeat(128),
      "😀".repeat(64),
      "İ".repeat(64),
      "K".repeat(128),
      "ǅ".repeat(128),
      "ﬃ".repeat(64),
      "０".repeat(128),
    ]) {
      let result: unknown;
      expect(() => (result = verifyPaystackSignature(body, header, SECRET))).not.toThrow();
      expect(result).toBe(false);
    }
  });

  test("no secret, a blank secret or a different secret never verifies", () => {
    for (const secret of ["", undefined as unknown as string, null as unknown as string])
      expect(verifyPaystackSignature(body, good, secret)).toBe(false);
    for (const secret of [
      SECRET.toUpperCase(),
      `${SECRET} `,
      ` ${SECRET}`,
      SECRET.slice(1),
      SECRET + "x",
      "mock_secret",
      "mock_sk_test_aleemaan_secret",
      "mock_sk_test_octalve_secret",
    ]) {
      expect(verifyPaystackSignature(body, good, secret), JSON.stringify(secret)).toBe(false);
    }
  });

  function verifyPortalLike(header: string) {
    return verifyPaystackSignature(body, header, SECRET);
  }
});

test.describe("S2: only the exact signature over the exact bytes verifies", () => {
  test("the control: the valid signature verifies, and so does its upper-case form and the form with surrounding spaces (hex is case-insensitive; trimmed)", () => {
    expect(verifyPaystackSignature(body, good, SECRET)).toBe(true);
    expect(verifyPaystackSignature(body, good.toUpperCase(), SECRET)).toBe(true);
    expect(verifyPaystackSignature(body, `  ${good}\n`, SECRET)).toBe(true);
  });

  test("changing any single character of the signature is refused", () => {
    for (let i = 0; i < good.length; i++) {
      const other = HEX[(HEX.indexOf(good[i]) + 1) % 16];
      expect(verifyPaystackSignature(body, good.slice(0, i) + other + good.slice(i + 1), SECRET), `position ${i}`).toBe(false);
    }
  });

  test("changing, adding or removing any byte of the body is refused (the signature is over the exact bytes)", () => {
    const bytes = Buffer.from(body);
    for (let i = 0; i < bytes.length; i++) {
      const flipped = Buffer.from(bytes);
      flipped[i] ^= 0x01;
      expect(verifyPaystackSignature(flipped, good, SECRET), `flip ${i}`).toBe(false);
      expect(verifyPaystackSignature(Buffer.concat([bytes.subarray(0, i), bytes.subarray(i + 1)]), good, SECRET), `delete ${i}`).toBe(
        false,
      );
    }
    for (const extra of [" ", "\n", "\r\n", "\u0000", "{}"])
      expect(verifyPaystackSignature(body + extra, good, SECRET), JSON.stringify(extra)).toBe(false);
  });

  test("a re-serialised body (same JSON, different bytes) is refused: pretty-printing, key order, escaped characters", () => {
    const parsed = JSON.parse(body);
    for (const variant of [
      JSON.stringify(parsed, null, 2),
      JSON.stringify({ data: parsed.data, event: parsed.event }),
      body.replace("charge.success", "charge\\u002esuccess"),
    ]) {
      expect(verifyPaystackSignature(variant, good, SECRET), variant.slice(0, 40)).toBe(false);
    }
  });

  test("a string body and the same bytes as a Buffer give the same answer; non-UTF-8 bytes do not throw", () => {
    expect(verifyPaystackSignature(Buffer.from(body, "utf8"), good, SECRET)).toBe(true);
    const odd = Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28, 0x7b]);
    expect(verifyPaystackSignature(odd, sign(odd), SECRET)).toBe(true);
    expect(verifyPaystackSignature(odd, good, SECRET)).toBe(false);
    expect(verifyPaystackSignature(Buffer.alloc(0), sign(Buffer.alloc(0)), SECRET)).toBe(true);
  });

  test("a 5 MB body is checked quickly and a wrong signature is refused", () => {
    const started = Date.now();
    const big = Buffer.alloc(5_000_000, 0x61);
    expect(verifyPaystackSignature(big, sign(big), SECRET)).toBe(true);
    expect(verifyPaystackSignature(big, good, SECRET)).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

test.describe("S3: the public mock secrets are just wrong secrets under a real key", () => {
  test("a body signed with 'mock_secret' (the old fallback) or any mock string is refused under the real key", () => {
    for (const secret of ["mock_secret", "mock_sk_test_aleemaan_secret", "mock_sk_test_octalve_secret", "", "secret", "sk_test"]) {
      expect(verifyPaystackSignature(body, sign(body, secret || "x"), SECRET), JSON.stringify(secret)).toBe(false);
    }
  });
});

test.describe("computePayloadHash and webhookEventId", () => {
  test("the hash is deterministic, sensitive to every byte, and a 64-hex SHA-256", () => {
    expect(computePayloadHash(body)).toBe(computePayloadHash(Buffer.from(body)));
    expect(computePayloadHash(body)).toMatch(/^[0-9a-f]{64}$/);
    expect(computePayloadHash(body)).not.toBe(computePayloadHash(body + " "));
  });

  test("the event id is the payload's own id, then its reference, then a digest: never the clock, never an object, never longer than 128", () => {
    const hash = computePayloadHash(body);
    expect(webhookEventId({ data: { id: 42 } }, hash)).toBe("42");
    expect(webhookEventId({ data: { id: "evt_1" } }, hash)).toBe("evt_1");
    expect(webhookEventId({ data: { reference: "alm_pay_x" } }, hash)).toBe("alm_pay_x");
    expect(webhookEventId({ data: { id: 0, reference: "r" } }, hash)).toBe("0");
    const fallback = `sha256:${hash.slice(0, 32)}`;
    for (const data of [
      {},
      { id: null },
      { id: {} },
      { id: [] },
      { id: "" },
      { id: NaN },
      { id: Infinity },
      { id: true },
      { reference: {} },
    ] as const) {
      expect(webhookEventId({ data: data as never }, hash), JSON.stringify(data)).toBe(fallback);
    }
    expect(webhookEventId({}, hash)).toBe(fallback);
    expect(webhookEventId({ data: { id: "x".repeat(10_000) } }, hash)).toHaveLength(128);
    // the same body twice is the same event
    expect(webhookEventId({}, hash)).toBe(webhookEventId({}, computePayloadHash(body)));
  });
});
