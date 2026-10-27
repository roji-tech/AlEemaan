import "../support/env";
import { test, expect } from "@playwright/test";
import { Gender } from "@prisma/client";
import { db, resetDatabase, seedInstance, uniqueIp } from "../support/db";
import { api } from "../support/http";

// Portal sign-in (`POST /api/v1/portal/session`), tested the way an attacker would use it (the maintainer's standing rule, 2026-10-19: always test edge cases and
// fuzz security code). Found by the bug hunt the same day, all in the code as it stood:
//   - no rate limit at all, and a "secret" that may be the last 4 digits of the guardian phone (10,000 guesses) or the pupil's date of birth;
//   - "No active student found with this admission number" versus "Verification failed...": the wording says which admission numbers exist;
//   - no bound on input length (a 5 MB admission number went to the database), and characters Postgres cannot store.
// What the secret SHOULD be is the maintainer's open decision (open-items.md); these tests pin what is true whatever it is.

let n = 0;
async function pupil(over: Partial<{ admissionNo: string; phone: string; dob: Date; email: string | null }> = {}) {
  const i = ++n;
  const admissionNo = over.admissionNo ?? `PS/${Date.now()}/${i}`;
  await db.studentRecord.create({
    data: {
      branchId: home.id,
      firstName: "Ada",
      lastName: `Signin${i}`,
      admissionNo,
      gender: Gender.FEMALE,
      dateOfBirth: over.dob ?? new Date("2012-05-15"),
      guardianPhone: over.phone ?? "08012345678",
      guardianEmail: over.email === undefined ? null : over.email,
    },
  });
  return { admissionNo, phone: over.phone ?? "08012345678" };
}
let home: { id: string; name: string };
test.beforeAll(async () => {
  await resetDatabase();
  home = await seedInstance();
});

const signIn = (admissionNo: unknown, secret: unknown, ip: string | null = uniqueIp()) =>
  api("/api/v1/portal/session", { method: "POST", body: { admissionNo, secret }, ip });

test.describe("what a failed sign-in says", () => {
  test("a real pupil with a wrong secret and an admission number that does not exist get the SAME status, message and body shape", async () => {
    const real = await pupil();
    const wrong = await signIn(real.admissionNo, "0000");
    const unknown = await signIn("NOPE/0000/0", "0000");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.json.error).toEqual(wrong.json.error); // the envelope's { code, message }
    expect(Object.keys(unknown.json).sort()).toEqual(Object.keys(wrong.json).sort());
    expect(unknown.setCookies).toEqual([]);
    expect(wrong.setCookies).toEqual([]);
    // and neither message names the admission number's existence
    expect(JSON.stringify(wrong.json)).not.toMatch(/no (active )?student|not found|does not exist|no such/i);
  });

  test("an archived pupil answers like an unknown one", async () => {
    const real = await pupil();
    await db.studentRecord.updateMany({ where: { admissionNo: real.admissionNo }, data: { archivedAt: new Date() } });
    const archived = await signIn(real.admissionNo, real.phone);
    const unknown = await signIn("NOPE/0000/1", real.phone);
    expect(archived.status).toBe(401);
    expect(archived.json.error).toEqual(unknown.json.error);
  });

  test("the response time does not separate a real pupil from an unknown one (medians within a factor of 3 over 8 tries each, under the per-pupil cap)", async () => {
    const real = await pupil();
    const time = async (admissionNo: string) => {
      const samples: number[] = [];
      for (let i = 0; i < 8; i++) {
        const started = performance.now();
        await signIn(admissionNo, "0000");
        samples.push(performance.now() - started);
      }
      return samples.sort((a, b) => a - b)[4];
    };
    const [a, b] = [await time(real.admissionNo), await time("NOPE/0000/2")];
    expect(Math.max(a, b) / Math.min(a, b)).toBeLessThan(3);
  });
});

test.describe("guessing is limited", () => {
  test("the sixth wrong guess at one pupil from one client is refused with 429, and so is the right answer until the window passes", async () => {
    const real = await pupil();
    const ip = uniqueIp();
    for (let i = 0; i < 5; i++) expect((await signIn(real.admissionNo, `99${i}9`, ip)).status, `guess ${i + 1}`).toBe(401);
    const sixth = await signIn(real.admissionNo, "9999", ip);
    expect(sixth.status).toBe(429);
    expect(sixth.json.error.message).toMatch(/too many/i);
    expect(sixth.json.error.code).toBe("RATE_LIMITED");
    expect((await signIn(real.admissionNo, real.phone, ip)).status).toBe(429);
    expect((await signIn(real.admissionNo, real.phone, ip)).setCookies).toEqual([]);
  });

  test("admission numbers are matched case-insensitively, so the limit must be too: changing the case does not reset it", async () => {
    const real = await pupil({ admissionNo: `Case/${Date.now()}/Q` });
    const ip = uniqueIp();
    const variants = [
      real.admissionNo,
      real.admissionNo.toUpperCase(),
      real.admissionNo.toLowerCase(),
      ` ${real.admissionNo} `,
      real.admissionNo.toUpperCase(),
    ];
    for (const [i, variant] of variants.entries()) expect((await signIn(variant, `88${i}8`, ip)).status, `variant ${i}`).toBe(401);
    expect((await signIn(real.admissionNo.toLowerCase(), "8888", ip)).status).toBe(429);
  });

  test("a different client is not locked out by one client's typos (they have their own allowance)", async () => {
    const real = await pupil();
    const ip = uniqueIp();
    for (let i = 0; i < 6; i++) await signIn(real.admissionNo, `77${i}7`, ip);
    expect((await signIn(real.admissionNo, real.phone, uniqueIp())).status).toBe(200);
  });

  test("a correct sign-in hands its attempt back: eight in a row from one client are never refused", async () => {
    const real = await pupil();
    const ip = uniqueIp();
    for (let i = 0; i < 8; i++) {
      const res = await signIn(real.admissionNo, real.phone, ip);
      expect(res.status, `sign-in ${i + 1}`).toBe(200);
      expect(res.setCookies.length).toBe(1);
    }
  });

  test("guesses from MANY clients at one pupil are capped across clients: the eleventh in a window is refused whoever sends it", async () => {
    const real = await pupil();
    for (let i = 0; i < 10; i++) expect((await signIn(real.admissionNo, `66${i}6`)).status, `guess ${i + 1}`).toBe(401);
    const eleventh = await signIn(real.admissionNo, "6666");
    expect(eleventh.status).toBe(429);
  });

  test("one client trying 31 different pupils is refused at the 31st, whatever the pupil", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 30; i++) expect((await signIn(`SPRAY/${Date.now()}/${i}`, "0000", ip)).status, `try ${i + 1}`).toBe(401);
    expect((await signIn(`SPRAY/${Date.now()}/last`, "0000", ip)).status).toBe(429);
  });

  test("a client with no usable IP header still gets a limit (one shared bucket), never an unlimited one", async () => {
    const real = await pupil();
    let refused = 0;
    for (let i = 0; i < 40; i++) if ((await signIn(real.admissionNo, `55${i}5`, null)).status === 429) refused++;
    expect(refused).toBeGreaterThan(0);
  });
});

test.describe("hostile input never gives a 500 and never a cookie", () => {
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

  test("characters Postgres cannot store, control characters, wrong types, empty and huge strings", async () => {
    const cases: Array<[string, unknown, unknown]> = [
      ["a null byte in the admission number", "PS/1\u0000x", "0000"],
      ["a null byte in the secret", "PS/1", "08012\u0000345"],
      ["control characters", "PS/1\u0001\u0002\u001f", "\u0007\u0008"],
      ["a line break", "PS/1\nx", "x\r\ny"],
      ["a lone surrogate", "PS/\ud800", "\udfff"],
      ["a right-to-left override", "PS/1\u202e", "\u202e0000"],
      ["an admission number of 100,000 characters", "A".repeat(100_000), "0000"],
      ["an admission number of 5 MB", "A".repeat(5_000_000), "0000"],
      ["a secret of 5 MB", "PS/1", "9".repeat(5_000_000)],
      ["an SQL-looking admission number", "' OR '1'='1' --", "0000"],
      ["a LIKE wildcard", "%", "%"],
      ["a regex-looking value", "(.*)", "(.*)"],
      ["a number", 12345, 6789],
      ["null", null, null],
      ["an array", ["PS/1"], ["0000"]],
      ["an object", { $ne: null }, { $gt: "" }],
      ["a boolean", true, false],
      ["empty strings", "", ""],
      ["whitespace only", "   ", "   "],
    ];
    for (const [name, admissionNo, secret] of cases) {
      const res = await signIn(admissionNo, secret);
      expect([400, 401, 413], `${name}: ${res.status} ${res.text.slice(0, 120)}`).toContain(res.status);
      expect(res.setCookies, name).toEqual([]);
    }
  });

  test("a wildcard in the admission number never matches another pupil: '%', '_' and prefixes with the REAL secret are refused", async () => {
    const real = await pupil({ admissionNo: `WILD/${Date.now()}/A`, phone: "08055500011" });
    await pupil({ admissionNo: `WILD/${Date.now()}/B`, phone: "08055500011" });
    for (const admissionNo of [
      "%",
      "%%",
      "WILD/%",
      "%/A",
      "WILD/%/A",
      "_".repeat(real.admissionNo.length),
      "WILD/_____________/A",
      "%WILD%",
      "w%",
      "\\%",
    ]) {
      const res = await signIn(admissionNo, real.phone);
      expect(res.status, `admission number ${JSON.stringify(admissionNo)}`).toBeGreaterThanOrEqual(400);
      expect(res.setCookies, admissionNo).toEqual([]);
    }
  });

  test("300 seeded random admission numbers and secrets: always a 4xx, never a 500, never a cookie", async () => {
    const next = mulberry32(20261019);
    const pool = Array.from("abcXYZ019/-._ ()%'\"\\;:<>{}[]é\u202e\u0000\n\ud83d\ude00");
    const text = () => Array.from({ length: Math.floor(next() * 90) }, () => pool[Math.floor(next() * pool.length)]).join("");
    for (let i = 0; i < 300; i++) {
      const res = await signIn(text(), text());
      expect(res.status, `case ${i}: ${res.text.slice(0, 100)}`).toBeLessThan(500);
      expect(res.setCookies).toEqual([]);
    }
  });

  test("a body that is not JSON, or JSON with the wrong shape, or a token that is wrong, is a 400/401 and never a 500", async () => {
    for (const rawBody of [
      "",
      "{",
      "not json",
      "[]",
      "null",
      '"x"',
      "{}",
      '{"token":""}',
      '{"token":5}',
      `{"token":"${"a".repeat(100_000)}"}`,
      '{"admissionNo":"a"}',
      '{"secret":"a"}',
    ]) {
      const res = await api("/api/v1/portal/session", { method: "POST", rawBody, ip: uniqueIp() });
      expect([400, 401, 413], `${rawBody.slice(0, 40)} -> ${res.status}`).toContain(res.status);
      expect(res.setCookies).toEqual([]);
    }
  });

  test("a forged, malformed or expired portal cookie is a 401 on the session read, never a 500", async () => {
    for (const value of ["", "x", "a.b", "a.b.c", "A".repeat(10_000), "%00", "\u202e", "e30.x", "null.null"]) {
      const res = await api("/api/v1/portal/session", { cookie: `aleemaan.portal-session=${encodeURIComponent(value)}`, ip: uniqueIp() });
      expect(res.status, JSON.stringify(value)).toBe(401);
    }
  });

  test("a cross-origin sign-in is refused (CSRF) before anything is looked up", async () => {
    const res = await api("/api/v1/portal/session", {
      method: "POST",
      body: { admissionNo: "PS/1", secret: "0000" },
      origin: "https://evil.example",
      ip: uniqueIp(),
    });
    expect(res.status).toBe(403);
    expect(res.setCookies).toEqual([]);
  });
});

test.describe("the cookie a successful sign-in sets", () => {
  test("is HttpOnly, SameSite=Lax, Path=/, has a Max-Age of at most 7 days, and the response is never cached", async () => {
    const real = await pupil({ phone: "08098765432" });
    const res = await signIn(real.admissionNo, real.phone);
    expect(res.status).toBe(200);
    const cookie = res.setCookies[0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie)?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(7 * 24 * 3600);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    // Not asserted, and logged in open-items 1b instead: the cookie payload (signed, not encrypted) still carries the guardian's phone and email.
  });
});
