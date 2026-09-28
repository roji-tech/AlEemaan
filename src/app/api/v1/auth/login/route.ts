import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { checkRateLimit, recordAttempt, getClientIp } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE_NAME } from "@/auth";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

/**
 * POST /api/v1/auth/login
 * Hand-rolled against the same Session table Auth.js's PrismaAdapter uses —
 * see src/auth.ts for why (Credentials + database sessions aren't
 * compatible in Auth.js v5). Same guard order as every other mutating route
 * in this codebase: CSRF, then rate limit, then validate.
 */
export async function POST(req: NextRequest) {
  if (!validateCSRF(req)) {
    return fail("Cross-origin request blocked", 403, "CSRF");
  }

  const clientIp = getClientIp(req);
  if (!checkRateLimit(`login:${clientIp}`)) {
    return fail("Too many login attempts. Please try again later.", 429, "RATE_LIMITED");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400, "INVALID_BODY");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    recordAttempt(`login:${clientIp}`);
    return fail("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    recordAttempt(`login:${clientIp}`);
    // Same message as a wrong password — an enumeration attempt can't tell
    // "no such user" from "wrong password" apart.
    return fail("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordAttempt(`login:${clientIp}`);
    return fail("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  const response = ok({ user: { id: user.id, name: user.name, email: user.email } });
  return withSessionCookie(response, sessionToken, expires);
}

function withSessionCookie(response: NextResponse, token: string, expires: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires,
  });
  return response;
}
