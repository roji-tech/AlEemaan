import type { NextRequest } from "next/server";
import { fail, noStore } from "@/lib/api/envelope";
import { withAuth, type AuthContext, type WithAuthOptions } from "@/lib/auth/with-auth";
import { branchGrant } from "@/lib/auth/with-branch";
import { heldRoleIn } from "@/lib/auth/branch-access";

// `withAuth` plus "and the branch this request names is the caller's" - for the routes whose handler passes a `branchId` from the query string or the body straight
// to a service (coursework, announcements, timetable, communication, promotion). Found by the browser security run (2026-10-19): `withAuth({ roles })` only says
// "a role in SOME branch", and those handlers never asked about THIS one, so any signed-in teacher could read or change another branch's data by changing the id.
//
//   export const GET = withAuthGated("read-any", async (req, auth) => { ... }, { roles: [...] });
//
// The level is the caller's authority needed over that branch:
//   "administer"   a superadmin, or an ADMIN of that very branch
//   "staff-write"  ADMIN or TEACHING_STAFF held in that branch (the roles that record or change things)
//   "staff-read"   any staff role held in that branch
//   "read-any"     any membership in that branch, including a student's or a parent's (content they may read)
// The branch is read from `?branchId=` or, failing that, from a JSON body's `branchId`. A request naming no branch goes on to the handler, which answers its own
// 400. A branch that is not the caller's is "not found" when it came from the URL (it never confirms that something exists there) and a 403 when it was named in a
// body (ADR 0014: a branch in a body is not secret) - the same words withBranch uses.

export type GateLevel = "administer" | "staff-write" | "staff-read" | "read-any";

async function branchOf(req: NextRequest): Promise<{ id: string; from: "query" | "body" } | null> {
  const fromQuery = new URL(req.url).searchParams.get("branchId");
  if (fromQuery) return { id: fromQuery, from: "query" };
  if (req.method === "GET" || req.method === "HEAD" || !req.headers.get("content-type")?.includes("json")) return null;
  try {
    const body: unknown = await req.clone().json();
    const id = body && typeof body === "object" ? (body as { branchId?: unknown }).branchId : undefined;
    return typeof id === "string" && id ? { id, from: "body" } : null;
  } catch {
    return null;
  }
}

export function withAuthGated<C = unknown>(
  level: GateLevel,
  handler: (req: NextRequest, auth: AuthContext, routeContext: C) => Promise<Response> | Response,
  options: WithAuthOptions = {},
) {
  return withAuth<C>(async (req, auth, routeContext) => {
    const named = await branchOf(req);
    if (named) {
      const allowed =
        level === "read-any"
          ? (await heldRoleIn(auth.userId, named.id)) !== null
          : (
              await branchGrant(
                auth.userId,
                named.id,
                level === "staff-read" ? "staff-read" : level === "staff-write" ? "staff-write" : "administer",
              )
            ).ok;
      if (!allowed) {
        return noStore(
          named.from === "body" ? fail("You don't have access to that branch.", 403, "FORBIDDEN") : fail("Not found", 404, "NOT_FOUND"),
        );
      }
    }
    return handler(req, auth, routeContext);
  }, options);
}
