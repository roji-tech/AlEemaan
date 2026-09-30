import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { getSessionFromRequest, type ResolvedSession } from "@/lib/auth/session";

// The shared route guard: same name, file and call shape as Octalve Edu's
// (domain-implementation-plan.md §0.5.1.6). It REPLACES `requireAdmin()`.
// Authorization stays in route handlers, never in Next.js middleware —
// CVE-2025-29927 was a critical middleware-bypass, and this design already
// put every check in handlers; it's now a stated rule.

export type AuthContext = ResolvedSession;

export type WithAuthOptions = {
  /// The user must hold a membership with ANY of these roles. AlEemaan is
  /// single-tenant, so a role held in any branch applies school-wide — in
  /// particular an ADMIN membership crosses every branch, the branch on the
  /// row being bookkeeping (§0.5.1.2). This is the one place the two repos
  /// deliberately differ: in Octalve Edu the same rule would be a cross-tenant
  /// privilege escalation, so there `roles` is unavailable until tenant
  /// resolution (§0.5.2) exists.
  roles?: readonly Role[];
  /// Typed `never` (and refused at module load) in BOTH repos until §1.7's
  /// permission design is built in both together — nothing consumes it yet, and
  /// untested speculative gating helps neither.
  permissions?: never;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function withAuth<C = unknown>(
  handler: (req: NextRequest, auth: AuthContext, routeContext: C) => Promise<Response> | Response,
  options: WithAuthOptions = {},
) {
  // Misconfiguration fails at module load (=> `next build` fails), never as a
  // route that quietly lets everyone through.
  if ("permissions" in options) {
    throw new Error(
      "withAuth: `permissions` is not available until the lightweight-permissions design (§1.7) is built.",
    );
  }
  if (options.roles !== undefined && options.roles.length === 0) {
    throw new Error("withAuth: `roles` must list at least one role (an empty list would refuse everyone).");
  }
  const roles = options.roles;

  return async (req: NextRequest, routeContext: C): Promise<Response> => {
    // CSRF is enforced HERE for every state-changing method, not left as a
    // per-route opt-in call — one forgotten validateCSRF() in one route is a
    // real gap. The refusals are uncacheable too: every response this wrapper
    // emits is, not only the handler's success path.
    if (!SAFE_METHODS.has(req.method) && !validateCSRF(req)) {
      return noStore(fail("Cross-origin request blocked", 403, "CSRF"));
    }

    const session = await getSessionFromRequest(req);
    if (!session) {
      return noStore(fail("Authentication required", 401, "UNAUTHENTICATED"));
    }

    if (roles) {
      const permitted = await prisma.membership.findFirst({
        where: { userId: session.userId, role: { in: [...roles] } },
        select: { id: true },
      });
      // 403, not 401: the person IS signed in; signing in again won't help.
      if (!permitted) {
        return noStore(fail("You don't have permission to do that", 403, "FORBIDDEN"));
      }
    }

    const response = await handler(req, session, routeContext);
    // Responses to an authenticated request are user-specific: never cache.
    try {
      if (!response.headers.has("Cache-Control")) {
        response.headers.set("Cache-Control", "private, no-store");
      }
    } catch {
      // Immutable headers (e.g. Response.redirect) — handlers should return a NextResponse.
    }
    return response;
  };
}
