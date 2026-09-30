import { NextRequest } from "next/server";
import { ok } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { deleteSessionByToken, clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * POST /api/v1/auth/logout
 * Deletes the Session row (not just the cookie) — a session is over when
 * its row is gone, that's the whole point of the database strategy.
 */
export async function POST(req: NextRequest) {
  if (!validateCSRF(req)) {
    return ok({ loggedOut: false }, {}, 403);
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) await deleteSessionByToken(token);

  return clearSessionCookie(ok({ loggedOut: true }));
}
