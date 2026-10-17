import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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
  primaryStudentId: string;
  allowedStudentIds: string[];
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  issuedAt: number;
  expiresAt: number;
}

function getPortalSecret(): string {
  return process.env.SESSION_SECRET || process.env.AUTH_SECRET || "aleemaan-portal-secure-hmac-secret-salt-2026";
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
    const payload = JSON.parse(rawJson) as PortalSessionPayload;

    if (!payload.primaryStudentId || !Array.isArray(payload.allowedStudentIds) || !payload.expiresAt) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
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
 * Checks whether an input matches a target phone (full match, national significant digits match, or last 4+ digits match).
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

  // Match suffix if at least 4 digits provided
  const digitsInput = cleanInput.replace(/\D/g, "");
  const digitsTarget = cleanTarget.replace(/\D/g, "");
  if (digitsInput.length >= 4 && digitsTarget.endsWith(digitsInput)) return true;
  if (digitsTarget.length >= 4 && digitsInput.endsWith(digitsTarget)) return true;
  return false;
}

/**
 * Checks whether an input matches a date of birth (accepting YYYY-MM-DD or DD/MM/YYYY).
 */
export function matchesDateOfBirth(input: string, dob: Date): boolean {
  const clean = input.trim();
  const year = dob.getUTCFullYear();
  const month = String(dob.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dob.getUTCDate()).padStart(2, "0");

  const iso = `${year}-${month}-${day}`;
  const ddmmyyyy = `${day}/${month}/${year}`;
  const ddmmyyyyDash = `${day}-${month}-${year}`;

  return clean === iso || clean === ddmmyyyy || clean === ddmmyyyyDash;
}

/**
 * Resolves all sibling students that share the same guardian contact details.
 */
export async function findSiblingStudentIds(student: {
  id: string;
  branchId: string;
  guardianPhone: string | null;
  guardianEmail: string | null;
}): Promise<string[]> {
  const orConditions: Prisma.StudentRecordWhereInput[] = [{ id: student.id }];

  if (student.guardianPhone && student.guardianPhone.trim().length >= 7) {
    orConditions.push({ guardianPhone: student.guardianPhone.trim() });
  }

  if (student.guardianEmail && student.guardianEmail.trim().length >= 5) {
    orConditions.push({ guardianEmail: student.guardianEmail.trim().toLowerCase() });
  }

  const siblings = await prisma.studentRecord.findMany({
    where: {
      archivedAt: null,
      OR: orConditions,
    },
    select: { id: true },
  });

  const ids = Array.from(new Set(siblings.map((s) => s.id)));
  return ids.length > 0 ? ids : [student.id];
}
