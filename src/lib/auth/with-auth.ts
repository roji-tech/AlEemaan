import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fail, noStore } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { getSessionFromRequest, type ResolvedSession } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/branch-access";
import { hasUnusablePathParam } from "@/lib/api/ids";

// The shared route guard: same name, file and call shape as Octalve Edu's
// (domain-implementation-plan.md §0.5.1.6). It REPLACES `requireAdmin()`.
// Authorization stays in route handlers, never in Next.js middleware —
// CVE-2025-29927 was a critical middleware-bypass, and this design already
// put every check in handlers; it's now a stated rule.

export type AuthContext = ResolvedSession;

export type WithAuthOptions = {
  /// The user must hold a membership with ANY of these roles — in ANY branch ("a role somewhere"). It is a coarse gate: a handler that acts
  /// on a branch must also check the role held THERE (`resolveBranchRole`, `canAdminister`; ADR 0012). `ADMIN` means "administers at least
  /// one branch"; a superadmin satisfies it without holding an ADMIN membership. This is the one place the two repos deliberately differ:
  /// in Octalve Edu the same rule would be a cross-tenant privilege escalation, so there `roles` is unavailable until tenant resolution exists.
  roles?: readonly Role[];
  /// The user must be a superadmin (`User.isSuperAdmin`, holding at least one active membership): school-wide authority — branches, school
  /// settings, other administrators. Combine with nothing else: it is the strictest gate this wrapper offers.
  superAdmin?: true;
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
    throw new Error("withAuth: `permissions` is not available until the lightweight-permissions design (§1.7) is built.");
  }
  if (options.superAdmin !== undefined && options.superAdmin !== true) {
    throw new Error("withAuth: `superAdmin` can only be `true`.");
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
        where: { userId: session.userId, role: { in: [...roles] }, deactivatedAt: null }, // a deactivated membership grants nothing
        select: { id: true },
      });
      // 403, not 401: the person IS signed in; signing in again won't help.
      if (!permitted && !(roles.includes("ADMIN") && (await isSuperAdmin(session.userId)))) {
        return noStore(fail("You don't have permission to do that", 403, "FORBIDDEN"));
      }
    }
    if (options.superAdmin && !(await isSuperAdmin(session.userId))) {
      return noStore(fail("You don't have permission to do that", 403, "FORBIDDEN"));
    }

    // An id in the URL path that can only be a mistake or an attack (a NUL byte, a control character, 5 KB of text) is "not found": left alone it reaches a query and
    // Postgres rejects it, which is a 500. Checked here once, after the authorization above (so who may do what is unchanged), for every route with a dynamic segment.
    const params = await (routeContext as { params?: Promise<unknown> } | undefined)?.params;
    if (hasUnusablePathParam(params)) return noStore(fail("Not found", 404, "NOT_FOUND"));

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
