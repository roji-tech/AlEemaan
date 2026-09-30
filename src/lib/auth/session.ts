import crypto from "crypto";
import { cookies as nextCookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // one shared constant — never duplicated
const MAX_SESSIONS_PER_USER = 10;

// __Host- (not __Secure-) in production: additionally forces Path=/ and
// forbids a Domain attribute, closing a sibling-subdomain cookie-planting
// risk __Secure- alone doesn't. `secure` is derived from APP_URL's actual
// scheme, not NODE_ENV — a Solo/LAN install genuinely served over plain
// HTTP in "production" mode would otherwise get a 200 from login with no
// cookie ever set, since browsers silently refuse a Secure cookie over HTTP.
const isHttps = (process.env.APP_URL ?? "").startsWith("https://");
export const SESSION_COOKIE_NAME = isHttps ? "__Host-aleemaan.session-token" : "aleemaan.session-token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: isHttps,
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/// Creates a session for `userId`, enforcing the per-user cap (evicts the
/// oldest beyond MAX_SESSIONS_PER_USER) — returns the PLAINTEXT token, which
/// the caller sets as the cookie value. Only the hash is ever persisted.
export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString("hex"); // 256-bit, server-generated, never client-supplied
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.session.create({
      data: { tokenHash, userId, expires, userAgent: userAgent ?? null },
    });

    const sessions = await tx.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const overflow = sessions.slice(MAX_SESSIONS_PER_USER);
    if (overflow.length > 0) {
      await tx.session.deleteMany({ where: { id: { in: overflow.map((s) => s.id) } } });
    }
  });

  return { token, expires };
}

/// Deletes the session matching a plaintext token (login-rotation, logout).
/// Idempotent — deleteMany doesn't throw if the row's already gone.
export async function deleteSessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/// Deletes every session for a user, optionally keeping one (the session
/// that just changed the password, e.g.) — call on password change, role
/// change, or deactivation. Not called anywhere yet (no such flows exist
/// yet); exists so those flows don't have to reinvent it.
export async function revokeUserSessions(userId: string, exceptToken?: string): Promise<void> {
  const exceptHash = exceptToken ? hashToken(exceptToken) : undefined;
  await prisma.session.deleteMany({
    where: { userId, ...(exceptHash ? { tokenHash: { not: exceptHash } } : {}) },
  });
}

/// Reads the session cookie from an incoming request, hashes it, and looks
/// up the (session, user) pair — null if no cookie, no matching row, or
/// expired. Does not touch lastUsedAt (call touchSession separately) so a
/// plain read-only check doesn't cost a write.
export async function getSessionFromRequest(
  req: NextRequest,
): Promise<{ userId: string; user: { id: string; name: string | null; email: string | null } } | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? resolveToken(token) : null;
}

/// Same as getSessionFromRequest, for Server Components / route handlers
/// that only have the cookies() API, not a NextRequest.
export async function getSession(): Promise<{
  userId: string;
  user: { id: string; name: string | null; email: string | null };
} | null> {
  const store = await nextCookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return token ? resolveToken(token) : null;
}

async function resolveToken(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!session || session.expires < new Date()) return null;
  return { userId: session.userId, user: session.user };
}

export function setSessionCookie(response: NextResponse, token: string, expires: Date): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, token, { ...COOKIE_OPTIONS, expires });
  return response;
}

/// Deletes the cookie with the EXACT attributes it was set with — a bare
/// `cookies.delete(name)` can silently fail to clear a __Host-/__Secure-
/// prefixed cookie in a real HTTPS deployment even though it appears to work
/// in dev against the unprefixed cookie, since browsers reject a Set-Cookie
/// clearing a secure-prefixed cookie that doesn't itself carry the matching
/// attributes.
export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
