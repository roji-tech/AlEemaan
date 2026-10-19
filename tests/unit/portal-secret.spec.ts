import { TEST_PORTAL_SECRET } from "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { PORTAL_SECRET_MIN_LENGTH, PortalSecretError, portalSecret, portalSecretProblem } from "@/lib/portal/secret";
import { signPortalSession, verifyPortalSession, type PortalSessionPayload } from "@/lib/portal/auth";

// The portal cookie is signed with a secret that has NO default. Until 2026-10-19 the code fell back to a string that was in the source, so a deployment that
// forgot the variable accepted cookies anyone who could read the repository could forge, for any pupil id. These tests pin the rules (required, long enough,
// not the old published default, not repetitive) and prove that signing and verifying fail instead of falling back.

const GOOD = "q7Zr-1mLw0pXc9Vt3nBh8Ys2KdJf6GaE5uTo4iNx";
const RETIRED_DEFAULT = "aleemaan-portal-secure-hmac-secret-salt-2026"; // the string that used to be the fallback; it is in git history, so it is never a secret

const payload = (): PortalSessionPayload => {
  const now = Math.floor(Date.now() / 1000);
  return { primaryStudentId: "s-1", allowedStudentIds: ["s-1"], issuedAt: now, expiresAt: now + 3600 };
};

test.describe("portalSecretProblem (a pure function of the environment)", () => {
  test("a long, varied SESSION_SECRET is accepted and returned as given", () => {
    expect(portalSecretProblem({ SESSION_SECRET: GOOD })).toBeNull();
    expect(portalSecret({ SESSION_SECRET: GOOD })).toBe(GOOD);
  });

  test("missing, empty and blank are refused", () => {
    for (const SESSION_SECRET of [undefined, "", "   "]) {
      expect(portalSecretProblem({ SESSION_SECRET })).toMatch(/SESSION_SECRET is not set/);
      expect(() => portalSecret({ SESSION_SECRET })).toThrow(PortalSecretError);
    }
  });

  test("AUTH_SECRET alone is not read any more, and the message says so", () => {
    expect(portalSecretProblem({ AUTH_SECRET: GOOD })).toMatch(/AUTH_SECRET is no longer read/);
    expect(() => portalSecret({ AUTH_SECRET: GOOD })).toThrow(/SESSION_SECRET/);
  });

  test(`shorter than ${PORTAL_SECRET_MIN_LENGTH} characters is refused; exactly ${PORTAL_SECRET_MIN_LENGTH} is accepted`, () => {
    expect(portalSecretProblem({ SESSION_SECRET: GOOD.slice(0, PORTAL_SECRET_MIN_LENGTH - 1) })).toMatch(/too short/);
    expect(portalSecretProblem({ SESSION_SECRET: GOOD.slice(0, PORTAL_SECRET_MIN_LENGTH) })).toBeNull();
    // the 28-character AUTH_SECRET that was in a developer's .env is exactly the kind of value this refuses
    expect(portalSecretProblem({ SESSION_SECRET: "x7Kq-2mLw0pXc9Vt3nBh8Ys2KdJ" })).toMatch(/too short/);
  });

  test("surrounding whitespace is not part of the secret, and does not count towards its length", () => {
    expect(portalSecret({ SESSION_SECRET: `  ${GOOD}\n` })).toBe(GOOD);
    expect(portalSecretProblem({ SESSION_SECRET: `   ${GOOD.slice(0, 20)}   ` })).toMatch(/too short/);
  });

  test("the old published default is refused even though it is long enough", () => {
    expect(RETIRED_DEFAULT.length).toBeGreaterThanOrEqual(PORTAL_SECRET_MIN_LENGTH);
    expect(portalSecretProblem({ SESSION_SECRET: RETIRED_DEFAULT })).toMatch(/old default/);
  });

  test("a repetitive value is refused", () => {
    expect(portalSecretProblem({ SESSION_SECRET: "a".repeat(64) })).toMatch(/repetitive/);
    expect(portalSecretProblem({ SESSION_SECRET: "abababababababababababababababababab" })).toMatch(/repetitive/);
  });

  test("no message ever contains the secret itself", () => {
    for (const SESSION_SECRET of [GOOD.slice(0, 20), "a".repeat(64), RETIRED_DEFAULT]) {
      const message = portalSecretProblem({ SESSION_SECRET }) ?? "";
      expect(message).not.toContain(SESSION_SECRET);
    }
  });
});

test.describe("signing and verifying use that secret and never a default", () => {
  const original = process.env.SESSION_SECRET;
  test.afterEach(() => {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  });

  test("the harness secret is valid, so the rest of the suite signs and verifies normally", () => {
    expect(portalSecretProblem({ SESSION_SECRET: TEST_PORTAL_SECRET })).toBeNull();
    expect(verifyPortalSession(signPortalSession(payload()))?.primaryStudentId).toBe("s-1");
  });

  test("with no secret, signing throws instead of using a built-in value", () => {
    delete process.env.SESSION_SECRET;
    process.env.AUTH_SECRET = GOOD; // still not read
    expect(() => signPortalSession(payload())).toThrow(PortalSecretError);
    delete process.env.AUTH_SECRET;
  });

  test("a token signed with the old published default is NOT accepted when a real secret is set", () => {
    process.env.SESSION_SECRET = GOOD;
    const forged = signWith(RETIRED_DEFAULT, { ...payload(), primaryStudentId: "any-pupil", allowedStudentIds: ["any-pupil"] });
    expect(verifyPortalSession(forged)).toBeNull();
  });

  test("with no secret, verifying a token throws (misconfiguration is loud) instead of accepting a token forged with the old default", () => {
    delete process.env.SESSION_SECRET;
    const forged = signWith(RETIRED_DEFAULT, payload());
    expect(() => verifyPortalSession(forged)).toThrow(PortalSecretError);
  });

  test("a token signed with one secret does not verify under another", () => {
    process.env.SESSION_SECRET = GOOD;
    const token = signPortalSession(payload());
    process.env.SESSION_SECRET = TEST_PORTAL_SECRET;
    expect(verifyPortalSession(token)).toBeNull();
  });
});

/// The cookie format the app uses, built by hand: how an attacker who read the source would forge one.
function signWith(secret: string, body: PortalSessionPayload): string {
  const serialized = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${serialized}.${crypto.createHmac("sha256", secret).update(serialized).digest("base64url")}`;
}
