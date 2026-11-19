import crypto from "node:crypto";
import { portalSecret } from "./secret";
import type { Actor } from "./access";

export const PORTAL_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

const isHttps = (process.env.APP_URL ?? "").startsWith("https://");
export const PORTAL_COOKIE_NAME = isHttps ? "__Host-aleemaan.portal-session" : "aleemaan.portal-session";

export const PORTAL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: isHttps,
  maxAge: PORTAL_SESSION_MAX_AGE_SECONDS,
};

export interface CookieJar {
  set(name: string, value: string, options: Record<string, unknown>): void;
}

export function setPortalCookie<T extends { cookies: CookieJar }>(response: T, token: string): T {
  response.cookies.set(PORTAL_COOKIE_NAME, token, PORTAL_COOKIE_OPTIONS);
  return response;
}

export function clearPortalCookie<T extends { cookies: CookieJar }>(response: T): T {
  response.cookies.set(PORTAL_COOKIE_NAME, "", {
    ...PORTAL_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

/**
 * Extracts and verifies the portal session from request cookies.
 */
export function getPortalSession(req: { cookies: { get(name: string): { value: string } | undefined } }): PortalSessionPayload | null {
  const token = req.cookies.get(PORTAL_COOKIE_NAME)?.value;
  return verifyPortalSession(token);
}

export interface PortalSessionPayload {
  /// Who is acting: a PUPIL or a GUARDIAN (task 0040; which door, task 0113 D6). A cookie signed before this existed has no actor and is read as a GUARDIAN with no `guardianId`, which
  /// the session check now ends (task 0113 D6): it is never widened to a pupil's or anyone's more.
  actor: Actor;
  primaryStudentId: string;
  allowedStudentIds: string[];
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  /// The guardian signed in as (task 0113 D6): their children are their allowed links, re-read on every request. Absent for a pupil.
  guardianId?: string;
  /// The `portalVersion` of whoever signed in (the pupil, or the guardian) when the session was made (task 0113): a new code, a block or an unblock raises it and ends this session.
  /// Absent in sessions made before codes existed (= 0).
  version?: number;
  issuedAt: number;
  expiresAt: number;
}

/// The signing secret, from SESSION_SECRET only. There is no default: a missing or weak one throws (lib/portal/secret.ts), and the server does not start
/// without one (src/instrumentation.ts). A misconfiguration is not an "invalid token": it must be loud, never a silent sign-out and never a built-in value.
function getPortalSecret(): string {
  return portalSecret();
}

/**
 * Signs a portal session payload using HMAC-SHA256.
 */
export function signPortalSession(payload: PortalSessionPayload): string {
  const secret = getPortalSecret();
  const serialized = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(serialized).digest("base64url");
  return `${serialized}.${signature}`;
}

/**
 * Verifies and decodes a signed portal session token.
 * Returns null if the token is tampered, invalid, or expired.
 */
export function verifyPortalSession(token: string | undefined | null): PortalSessionPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [serialized, signature] = parts;
  const secret = getPortalSecret();
  const expectedSignature = crypto.createHmac("sha256", secret).update(serialized).digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedSigBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    return null;
  }

  try {
    const rawJson = Buffer.from(serialized, "base64url").toString("utf-8");
    const payload = parsePayload(JSON.parse(rawJson));
    if (!payload) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

const MAX_ID_LENGTH = 128;
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
const isContact = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null || typeof value === "string";
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/// The payload of a correctly signed token, checked field by field and REBUILT (unknown keys, including a `__proto__` own key, are dropped). Only the app
/// signs, so a wrong shape should never happen; but a number is read as a clock time only if it IS a number: before this check `expiresAt: "abc"` compared
/// false against the clock and a token with it never expired, and ids of the wrong type reached the database layer. Found by the fuzz tests, 2026-10-19.
function parsePayload(raw: unknown): PortalSessionPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (p.actor !== undefined && p.actor !== "PUPIL" && p.actor !== "GUARDIAN") return null;
  if (!isId(p.primaryStudentId)) return null;
  if (!Array.isArray(p.allowedStudentIds) || !p.allowedStudentIds.every(isId)) return null;
  if (!isTime(p.issuedAt) || !isTime(p.expiresAt)) return null;
  if (!isContact(p.guardianPhone) || !isContact(p.guardianEmail)) return null;
  if (p.version !== undefined && !(typeof p.version === "number" && Number.isInteger(p.version) && p.version >= 0)) return null;
  if (p.guardianId !== undefined && !isId(p.guardianId)) return null;
  return {
    actor: p.actor === "PUPIL" ? "PUPIL" : "GUARDIAN",
    primaryStudentId: p.primaryStudentId,
    allowedStudentIds: [...p.allowedStudentIds],
    ...(p.guardianPhone !== undefined ? { guardianPhone: p.guardianPhone } : {}),
    ...(p.guardianEmail !== undefined ? { guardianEmail: p.guardianEmail } : {}),
    ...(p.guardianId !== undefined ? { guardianId: p.guardianId as string } : {}),
    ...(p.version !== undefined ? { version: p.version as number } : {}),
    issuedAt: p.issuedAt,
    expiresAt: p.expiresAt,
  };
}

/**
 * Normalizes a phone number by stripping spaces, hyphens, and non-digit characters (preserving leading + if any).
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, "");
}

/**
 * Extracts standard national significant digits (e.g. stripping 234 or leading 0).
 */
export function extractNationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length >= 12) {
    return digits.slice(3);
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Checks whether an input matches a target phone: the whole number, written either way (0803... or +234803...). Task 0094 D3: never a part of it.
 */
export function matchesPhone(input: string, targetPhone: string | null | undefined): boolean {
  if (!targetPhone) return false;
  const cleanInput = normalizePhone(input);
  const cleanTarget = normalizePhone(targetPhone);
  if (!cleanInput || !cleanTarget) return false;

  if (cleanInput === cleanTarget) return true;

  const natInput = extractNationalDigits(cleanInput);
  const natTarget = extractNationalDigits(cleanTarget);
  if (natInput && natTarget && natInput === natTarget) return true;

  // The WHOLE number only (task 0113, task 0094 D3): the old "last 4 or more digits" match let 10,000 guesses cover any family, and is gone.
  return false;
}

/**
 * Checks whether an input matches a date of birth (accepting YYYY-MM-DD or DD/MM/YYYY).
 */
export function matchesDateOfBirth(input: string, dob: Date | null): boolean {
  // A pupil with no date of birth on record cannot sign in with one.
  if (!dob) return false;
  const clean = input.trim();
  const year = dob.getUTCFullYear();
  const month = String(dob.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dob.getUTCDate()).padStart(2, "0");

  const iso = `${year}-${month}-${day}`;
  const ddmmyyyy = `${day}/${month}/${year}`;
  const ddmmyyyyDash = `${day}-${month}-${year}`;

  return clean === iso || clean === ddmmyyyy || clean === ddmmyyyyDash;
}
