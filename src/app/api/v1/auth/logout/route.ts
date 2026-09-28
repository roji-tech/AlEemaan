import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { SESSION_COOKIE_NAME } from "@/auth";

/**
 * POST /api/v1/auth/logout
 * Deletes the Session row (not just the cookie) — the whole point of
 * database sessions is that a session ends when its row is gone, not just
 * when the client stops sending the cookie.
 */
export async function POST(req: NextRequest) {
  if (!validateCSRF(req)) {
    return ok({ loggedOut: false }, {}, 403);
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { sessionToken: token } });
  }

  const response = ok({ loggedOut: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
