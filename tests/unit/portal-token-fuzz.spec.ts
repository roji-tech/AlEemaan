import { TEST_PORTAL_SECRET } from "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { signPortalSession, verifyPortalSession, type PortalSessionPayload } from "@/lib/portal/auth";

// Fuzz and edge cases for the portal session cookie (the maintainer's standing rule, 2026-10-19: always test edge cases and fuzz for security anomalies).
// A seeded generator, no dependency: every run is the same run, so a failure reproduces. The properties:
//   P1  a token the app did not sign NEVER verifies, and verifying NEVER throws on any string;
//   P2  a token the app DID sign verifies only unchanged: any one-character change, truncation or extension is refused;
//   P3  a correctly signed token whose payload has the wrong SHAPE is refused (only the app signs, but a refused shape is a refused anomaly);
//   P4  hostile content (prototype keys, huge input) cannot pollute or stall the process.

const SEED = 20261019;
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

const ALPHABETS = {
  base64url: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
  ascii: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(""),
  hostile: [
    "\u0000",
    "\u202e",
    "\u200b",
    "\ufeff",
    "\n",
    "\r\n",
    "\t",
    "'",
    '"',
    "`",
    "\\",
    "%00",
    "%2e%2e",
    "../",
    "<script>",
    "${x}",
    "{{x}}",
    "😀",
    "é",
    "ال",
    "=",
  ].join(""),
};
function randomString(next: () => number, maxLength: number): string {
  const alphabet = Object.values(ALPHABETS)[Math.floor(next() * 3)];
  const chars = Array.from(alphabet);
  const length = Math.floor(next() * maxLength);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(next() * chars.length)];
  if (next() < 0.5 && length > 2)
    out = out.slice(0, 1 + Math.floor(next() * (length - 1))) + "." + out.slice(1 + Math.floor(next() * (length - 1)));
  return out;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const good = (over: Partial<PortalSessionPayload> = {}): PortalSessionPayload => ({
  actor: "GUARDIAN",
  primaryStudentId: "stu_1",
  allowedStudentIds: ["stu_1", "stu_2"],
  guardianPhone: "+2348012345678",
  guardianEmail: "parent@example.com",
  issuedAt: nowSeconds(),
  expiresAt: nowSeconds() + 3600,
  ...over,
});
/// A token for ANY payload, signed with the real secret: how the app would sign something odd.
function signAnything(body: unknown, secret = TEST_PORTAL_SECRET): string {
  const serialized = Buffer.from(typeof body === "string" ? body : JSON.stringify(body)).toString("base64url");
  return `${serialized}.${crypto.createHmac("sha256", secret).update(serialized).digest("base64url")}`;
}

test.describe("P1: garbage never verifies and never throws", () => {
  test("5000 random strings (ascii, base64url, hostile unicode, with dots)", () => {
    const next = mulberry32(SEED);
    for (let i = 0; i < 5000; i++) {
      const token = randomString(next, 400);
      let result: unknown;
      expect(() => (result = verifyPortalSession(token)), JSON.stringify(token)).not.toThrow();
      expect(result, JSON.stringify(token)).toBeNull();
    }
  });

  test("3000 strings shaped like payload.signature with random base64url on both sides", () => {
    const next = mulberry32(SEED + 1);
    const chars = Array.from(ALPHABETS.base64url);
    const part = (n: number) => Array.from({ length: n }, () => chars[Math.floor(next() * chars.length)]).join("");
    for (let i = 0; i < 3000; i++) {
      const token = `${part(Math.floor(next() * 200))}.${part(next() < 0.5 ? 43 : Math.floor(next() * 90))}`;
      expect(verifyPortalSession(token), token).toBeNull();
    }
  });

  test("the real payload with a random 43-character signature (the right length) is refused", () => {
    const next = mulberry32(SEED + 2);
    const chars = Array.from(ALPHABETS.base64url);
    const serialized = Buffer.from(JSON.stringify(good())).toString("base64url");
    for (let i = 0; i < 2000; i++) {
      const signature = Array.from({ length: 43 }, () => chars[Math.floor(next() * chars.length)]).join("");
      expect(verifyPortalSession(`${serialized}.${signature}`)).toBeNull();
    }
  });

  test("not-a-string tokens are refused without throwing", () => {
    for (const token of [undefined, null, 0, 1, NaN, true, {}, [], ["a.b"], { toString: () => "a.b" }, Symbol.iterator] as unknown[]) {
      let result: unknown;
      expect(() => (result = verifyPortalSession(token as string)), String(typeof token)).not.toThrow();
      expect(result).toBeNull();
    }
  });

  test("empty, dots-only, three-part and whitespace tokens are refused", () => {
    for (const token of ["", ".", "..", "...", "a.b.c", " . ", "\n.\n", "a.", ".a", "undefined", "null", "[object Object]"]) {
      expect(verifyPortalSession(token), JSON.stringify(token)).toBeNull();
    }
  });
});

test.describe("P2: a signed token verifies only unchanged", () => {
  const token = signPortalSession(good());
  const alphabet = Array.from(ALPHABETS.base64url);

  test("the unchanged token verifies (the control: every refusal below is meaningful)", () => {
    expect(verifyPortalSession(token)?.primaryStudentId).toBe("stu_1");
  });

  test("changing any single character, at any position, is refused", () => {
    const next = mulberry32(SEED + 3);
    for (let i = 0; i < token.length; i++) {
      if (token[i] === ".") continue;
      let replacement = alphabet[Math.floor(next() * alphabet.length)];
      if (replacement === token[i]) replacement = alphabet[(alphabet.indexOf(replacement) + 1) % alphabet.length];
      expect(verifyPortalSession(token.slice(0, i) + replacement + token.slice(i + 1)), `position ${i}`).toBeNull();
    }
  });

  test("deleting or inserting any single character is refused", () => {
    for (let i = 0; i < token.length; i++) {
      expect(verifyPortalSession(token.slice(0, i) + token.slice(i + 1)), `delete ${i}`).toBeNull();
      expect(verifyPortalSession(token.slice(0, i) + "A" + token.slice(i)), `insert ${i}`).toBeNull();
    }
  });

  test("truncation at every length and every kind of suffix is refused", () => {
    for (let i = 0; i < token.length; i++) expect(verifyPortalSession(token.slice(0, i)), `cut at ${i}`).toBeNull();
    for (const suffix of ["A", "=", "==", ".", ".x", " ", "\n", "\u0000", "%00"])
      expect(verifyPortalSession(token + suffix), JSON.stringify(suffix)).toBeNull();
    for (const prefix of [" ", "\n", "Bearer ", "\u0000"]) expect(verifyPortalSession(prefix + token), JSON.stringify(prefix)).toBeNull();
  });

  test("swapping the two halves, or reusing one signature on another payload, is refused", () => {
    const [data, signature] = token.split(".");
    expect(verifyPortalSession(`${signature}.${data}`)).toBeNull();
    const other = signPortalSession(good({ primaryStudentId: "stu_9", allowedStudentIds: ["stu_9"] }));
    expect(verifyPortalSession(`${other.split(".")[0]}.${signature}`)).toBeNull();
  });

  test("a token made with the old published default, or any other secret, is refused", () => {
    for (const secret of [
      "aleemaan-portal-secure-hmac-secret-salt-2026",
      "",
      "secret",
      TEST_PORTAL_SECRET.toUpperCase(),
      `${TEST_PORTAL_SECRET} `,
    ]) {
      expect(verifyPortalSession(signAnything(good(), secret)), JSON.stringify(secret)).toBeNull();
    }
  });
});

test.describe("P3: a correctly signed token with a malformed payload is refused", () => {
  const refused: Array<[string, unknown]> = [
    ["no body at all", "null"],
    ["a JSON array", []],
    ["a JSON string", "abc"],
    ["a number", 42],
    ["not JSON", "{not json"],
    ["an empty object", {}],
    ["no primaryStudentId", { ...good(), primaryStudentId: undefined }],
    ["an empty primaryStudentId", good({ primaryStudentId: "" })],
    ["a numeric primaryStudentId", { ...good(), primaryStudentId: 7 }],
    ["an object primaryStudentId", { ...good(), primaryStudentId: { id: "stu_1" } }],
    ["allowedStudentIds missing", { ...good(), allowedStudentIds: undefined }],
    ["allowedStudentIds a string", { ...good(), allowedStudentIds: "stu_1" }],
    ["allowedStudentIds an object", { ...good(), allowedStudentIds: { 0: "stu_1", length: 1 } }],
    ["allowedStudentIds holding a number", { ...good(), allowedStudentIds: ["stu_1", 2] }],
    ["allowedStudentIds holding null", { ...good(), allowedStudentIds: ["stu_1", null] }],
    ["allowedStudentIds holding an empty string", { ...good(), allowedStudentIds: ["stu_1", ""] }],
    ["allowedStudentIds holding an object", { ...good(), allowedStudentIds: [{ id: "x" }] }],
    ["expiresAt missing", { ...good(), expiresAt: undefined }],
    ["expiresAt a numeric string", { ...good(), expiresAt: String(nowSeconds() + 3600) }],
    ["expiresAt a non-numeric string (compares false against the clock, so it never expired)", { ...good(), expiresAt: "abc" }],
    ["expiresAt true", { ...good(), expiresAt: true }],
    ["expiresAt an array", { ...good(), expiresAt: [nowSeconds() + 3600] }],
    ["expiresAt an object", { ...good(), expiresAt: {} }],
    ["expiresAt NaN (JSON turns it into null)", { ...good(), expiresAt: NaN }],
    ["expiresAt Infinity (JSON turns it into null)", { ...good(), expiresAt: Infinity }],
    ["expiresAt zero", { ...good(), expiresAt: 0 }],
    ["expiresAt negative", { ...good(), expiresAt: -1 }],
    ["expiresAt in the past", { ...good(), expiresAt: nowSeconds() - 5 }],
    ["issuedAt a string", { ...good(), issuedAt: "yesterday" }],
    ["issuedAt missing", { ...good(), issuedAt: undefined }],
    ["guardianPhone a number", { ...good(), guardianPhone: 8012345678 }],
    ["guardianEmail an object", { ...good(), guardianEmail: { a: 1 } }],
  ];
  for (const [name, body] of refused) {
    test(`refused: ${name}`, () => {
      expect(verifyPortalSession(signAnything(body))).toBeNull();
    });
  }

  test("accepted (the controls): the normal payload, null or absent contact details, and one second before expiry", () => {
    expect(verifyPortalSession(signAnything(good()))).not.toBeNull();
    expect(verifyPortalSession(signAnything(good({ guardianPhone: null, guardianEmail: null })))).not.toBeNull();
    const { guardianPhone: _p, guardianEmail: _e, ...bare } = good();
    void _p;
    void _e;
    expect(verifyPortalSession(signAnything(bare))).not.toBeNull();
    expect(verifyPortalSession(signAnything(good({ expiresAt: nowSeconds() + 1 })))).not.toBeNull();
  });
});

test.describe("P4: hostile content cannot pollute or stall", () => {
  test("a signed payload with __proto__ / constructor keys cannot pollute Object.prototype", () => {
    const body = `{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}},"primaryStudentId":"stu_1","allowedStudentIds":["stu_1"],"issuedAt":${nowSeconds()},"expiresAt":${nowSeconds() + 3600}}`;
    verifyPortalSession(signAnything(body));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(false);
  });

  test("a huge token (5 MB) and a deeply nested signed payload are refused quickly, without throwing", () => {
    const started = Date.now();
    expect(verifyPortalSession("A".repeat(5_000_000))).toBeNull();
    expect(verifyPortalSession(`${"A".repeat(2_500_000)}.${"B".repeat(2_500_000)}`)).toBeNull();
    const nested = `${"[".repeat(20000)}${"]".repeat(20000)}`;
    let result: unknown;
    expect(() => (result = verifyPortalSession(signAnything(nested)))).not.toThrow();
    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test("the cookie the app makes stays small enough for a browser (under 4096 bytes) for a family of 12 children", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `cm${i}${"x".repeat(22)}`);
    const token = signPortalSession(good({ primaryStudentId: ids[0], allowedStudentIds: ids }));
    expect(token.length).toBeLessThan(4096);
  });
});
