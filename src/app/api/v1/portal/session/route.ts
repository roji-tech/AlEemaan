import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { getClientIp, refundAttempt, reserveAttempt } from "@/lib/auth/rate-limit";
import { PORTAL_COOKIE_NAME, setPortalCookie, clearPortalCookie } from "@/lib/portal/auth";
import { authenticatePortalViaToken, authenticatePortalViaAdmission, resolvePortalSessionData } from "@/lib/portal/service";
import { readJsonBody } from "@/lib/api/validate";

// Input is bounded and clean BEFORE anything reaches the database. Found by the bug hunt of 2026-10-19: there was no length limit (a 5 MB admission number went to
// the query) and a null byte made Postgres throw, which surfaced as a 500. Control characters, bidirectional overrides and lone surrogates are never part of an
// admission number, a phone, an email or a link token.
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const clean = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !FORBIDDEN.test(value), "invalid characters")
    .refine((value) => (value as string & { isWellFormed?: () => boolean }).isWellFormed?.() ?? true, "invalid characters");

const loginSchema = z.union([
  z.object({ token: clean(512) }),
  z.object({ admissionNo: clean(64), secret: clean(254) }), // 254: the longest email address
]);

// Guessing limits (the portal had none). Reserve-then-refund like the staff sign-in (lib/auth/rate-limit.ts, one window of 5 minutes):
//   per client           a school gate or a mobile network shares one address, so this is generous;
//   per client + pupil   one person's typos;
//   per pupil, any client  a guess spread over many clients still has a ceiling. It can briefly lock a family out of the portal if someone is hammering their
//                        pupil; the other way in (the emailed link) is unaffected, and this is the price of a secret that can be the last 4 digits of a phone.
// A limit slows guessing, it cannot make a 4-digit secret safe: what the secret should be is the maintainer's open decision (open-items 1b).
const PORTAL_IP_LIMIT = 30;
const PORTAL_PAIR_LIMIT = 5;
const PORTAL_PUPIL_LIMIT = 10;
const RATE_LIMITED = "Too many sign-in attempts. Please try again in a few minutes.";
/// Admission numbers match case-insensitively, so the limit's key must too (and ignore surrounding spaces), or changing the case would reset it.
const keyOf = (admissionNo: string) => admissionNo.trim().toLowerCase();

/**
 * POST /api/v1/portal/session
 * Authenticates a guardian/student via magic link token OR admission number + secret.
 */
export async function POST(req: NextRequest) {
  if (!validateCSRF(req)) {
    return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  }

  // Reserved at the very start, before any slow work, so concurrent requests cannot all pass a check before any of them records anything.
  const ipKey = `portal:ip:${getClientIp(req)}`;
  if (!(await reserveAttempt(ipKey, PORTAL_IP_LIMIT))) {
    return noStore(fail(RATE_LIMITED, 429, "RATE_LIMITED"));
  }

  const read = await readJsonBody(req);
  if (!read.ok) return noStore(read.response);
  const body = read.json;

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return noStore(fail("Please provide a valid token or admission number with secret", 400));
  }

  const reserved = [ipKey];
  let result;
  if ("token" in parsed.data) {
    result = await authenticatePortalViaToken(parsed.data.token);
  } else {
    const pupil = keyOf(parsed.data.admissionNo);
    const pairKey = `${ipKey}:${pupil}`;
    if (!(await reserveAttempt(pairKey, PORTAL_PAIR_LIMIT))) {
      return noStore(fail(RATE_LIMITED, 429, "RATE_LIMITED"));
    }
    reserved.push(pairKey);
    const pupilKey = `portal:pupil:${pupil}`;
    if (!(await reserveAttempt(pupilKey, PORTAL_PUPIL_LIMIT))) {
      return noStore(fail(RATE_LIMITED, 429, "RATE_LIMITED"));
    }
    reserved.push(pupilKey);
    result = await authenticatePortalViaAdmission(parsed.data.admissionNo, parsed.data.secret);
  }

  if (!result.success || !result.sessionToken) {
    return noStore(fail(result.error || "Authentication failed", 401));
  }

  // A correct sign-in hands its reservations back, so it never counts against the family's own future attempts.
  for (const key of reserved) await refundAttempt(key);

  const response = ok({
    student: result.student,
    siblingStudents: result.siblingStudents,
  });

  return noStore(setPortalCookie(response, result.sessionToken));
}

/**
 * GET /api/v1/portal/session
 * Retrieves current verified portal session and list of authorized students.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PORTAL_COOKIE_NAME)?.value;
  const data = await resolvePortalSessionData(token);

  if (!data) {
    return noStore(fail("Portal session expired or invalid", 401));
  }

  return noStore(
    ok({
      session: data.session,
      students: data.students,
    }),
  );
}

/**
 * DELETE /api/v1/portal/session
 * Signs out of the parent/student portal by clearing the portal session cookie.
 */
export async function DELETE(req: NextRequest) {
  if (!validateCSRF(req)) {
    return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
  }

  return noStore(clearPortalCookie(ok({ loggedOut: true })));
}
