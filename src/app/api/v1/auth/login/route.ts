import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { reserveAttempt, refundAttempt, checkRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSessionByToken, setSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

/**
 * POST /api/v1/auth/login
 * Hand-rolled — see docs/development-history/domain-implementation-plan.md
 * §0.5.1.5 for why Auth.js isn't used at all here. Guard order: CSRF, then
 * rate limit (three layers — per-IP, per-ip+email, per-email soft), then
 * validate, then constant-time credential check.
 */
export async function POST(req: NextRequest) {
  if (!validateCSRF(req)) {
    return fail("Cross-origin request blocked", 403, "CSRF");
  }

  const clientIp = getClientIp(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400, "INVALID_BODY");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    if (!reserveAttempt(`login:ip:${clientIp}`)) {
      return fail("Too many login attempts. Please try again later.", 429, "RATE_LIMITED");
    }
    return fail("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const { email, password } = parsed.data;

  // Reserved synchronously (no `await` before this point since the CSRF/JSON
  // parse above), before any of the slow async work below — this is what
  // closes the check-then-record race: nothing can interleave between the
  // reservation and the work it's gating.
  const ipKey = `login:ip:${clientIp}`;
  const pairKey = `login:pair:${clientIp}:${email}`;
  const accountKey = `login:account:${email}`;

  if (!reserveAttempt(ipKey) || !reserveAttempt(pairKey)) {
    return fail("Too many login attempts. Please try again later.", 429, "RATE_LIMITED");
  }
  // Account-level limit is soft (per design) — checked, not reserved as a
  // hard gate, so an attacker can't weaponize it to lock out the real user.
  // Still logged via the pair/IP buckets above, which are hard gates.
  const accountThrottled = !checkRateLimit(accountKey, 10);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? null);

  if (!user?.passwordHash || !valid) {
    reserveAttempt(accountKey, 10);
    // Same message for "no such user" and "wrong password" — enumeration
    // can't distinguish them from content OR timing (verifyPassword always
    // runs bcrypt.compare, even when user is null).
    return fail("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  // Success: refund the reservations this request made, rotate any session
  // already presented (delete-before-create, not both-valid), and mint a
  // fresh one.
  refundAttempt(ipKey);
  refundAttempt(pairKey);

  const presentedToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (presentedToken) await deleteSessionByToken(presentedToken);

  const { token, expires } = await createSession(user.id, req.headers.get("user-agent"));

  const response = ok({
    user: { id: user.id, name: user.name, email: user.email },
    accountThrottled, // surfaced so the UI can show a soft warning, not a hard block
  });
  return setSessionCookie(response, token, expires);
}
