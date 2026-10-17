import type { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { fail } from "@/lib/api/envelope";
import { canAdminister, resolveBranchRole } from "@/lib/auth/branch-access";

// The branch combinator (ADR 0015). `withAuth({ roles })` says "a role in SOME branch"; whether the caller may act on THIS branch is a second question that
// used to be asked by helpers each handler had to remember to call. `withBranch` makes it structural: the handler is only run once the branch it acts on has
// been resolved and the caller's authority THERE checked, and it receives the branch and the role held in it.
//
//   withAuth(
//     validate({ body }, withBranch({ of: (input) => input.body.branchId, as: "administer" }, async (req, auth, ctx, input, { branchId, role }) => …)),
//     { roles: [Role.ADMIN] },
//   )
//
// It is composed INSIDE `withAuth` (who you are comes first) and AFTER `validate()` (the branch is usually in the parsed body). A route whose branch comes
// from an id in the URL passes `of` that looks the entity up. `withAuth` itself does not change.
//
//   as: "administer"   a superadmin, or an ADMIN of that very branch                                             (role: ADMIN)
//       "staff-read"   any ACTIVE staff role held in that branch (a superadmin is ADMIN everywhere)                (role: the one held THERE)
//       "staff-write"  ADMIN or TEACHING_STAFF held in that branch - the roles that may record or change things   (role: the one held THERE)
//
// Refusals are the ones the app already gave, in one place: a branch (or an entity) that is unknown or not the caller's is the SAME answer - 404 - when it
// comes from the URL or a lookup, so a response never confirms that something exists in another branch; a branch NAMED IN A BODY that the caller does not
// administer is a 403 (ADR 0014: a branch in a body is not secret). A staff member of the branch who lacks the role for `staff-write` gets "FORBIDDEN".
// A route that must answer in its own envelope (attendance) passes `refuse`.

export type BranchAs = "administer" | "staff-read" | "staff-write";
export type BranchRefusal = "NOT_FOUND" | "FORBIDDEN";
export type BranchGrant = { branchId: string; role: Role };

const STAFF_WRITE: readonly Role[] = [Role.ADMIN, Role.TEACHING_STAFF];

/// The caller's authority over one branch for `as`: the branch and the role held there, or why not. `null` branch = nothing to act on (an unknown entity).
export async function branchGrant(
  userId: string,
  branchId: string | null,
  as: BranchAs,
): Promise<{ ok: true; grant: BranchGrant } | { ok: false; why: BranchRefusal }> {
  if (!branchId) return { ok: false, why: "NOT_FOUND" };
  if (as === "administer") {
    return (await canAdminister(userId, branchId)) ? { ok: true, grant: { branchId, role: Role.ADMIN } } : { ok: false, why: "NOT_FOUND" };
  }
  const role = await resolveBranchRole(userId, branchId);
  if (!role) return { ok: false, why: "NOT_FOUND" };
  if (as === "staff-write" && !STAFF_WRITE.includes(role)) return { ok: false, why: "FORBIDDEN" };
  return { ok: true, grant: { branchId, role } };
}

export type WithBranchOptions<I, C> = {
  /// Where the branch comes from: the parsed input (`validate()`'s `{ body, query }`), the request, or - for an entity - a lookup of the entity's branch
  /// (return `null` when there is no such entity). Never trusted: it is only the thing the caller's authority is checked against.
  of: (input: I, req: NextRequest, routeContext: C) => string | null | Promise<string | null>;
  as: BranchAs;
  /// `body`: the branch was named by the caller in a request body, so "not yours" is a 403 for `administer` (default `entity`: 404, the same as unknown).
  where?: "body" | "entity";
  /// For a route that answers in its own envelope (or words). Receives the reason, the route context and the input; must return the Response.
  refuse?: (why: BranchRefusal, routeContext: C, input: I) => Response | Promise<Response>;
};

export function withBranch<I, A extends { userId: string }, C>(
  options: WithBranchOptions<I, C>,
  handler: (req: NextRequest, auth: A, routeContext: C, input: I, branch: BranchGrant) => Promise<Response> | Response,
) {
  const refuseDefault = (why: BranchRefusal): Response => {
    if (why === "FORBIDDEN" || (options.where === "body" && options.as === "administer")) {
      return options.as === "administer"
        ? fail("You don't administer that branch.", 403, "FORBIDDEN")
        : fail("You don't have access to that.", 403, "FORBIDDEN");
    }
    return fail("Not found", 404, "NOT_FOUND");
  };
  // `input` is `validate()`'s parsed input when composed inside it; a route with nothing to parse (an id in the URL) uses it directly inside `withAuth`, with none.
  return async (req: NextRequest, auth: A, routeContext: C, input?: I): Promise<Response> => {
    const branchId = await options.of(input as I, req, routeContext);
    const result = await branchGrant(auth.userId, branchId, options.as);
    if (!result.ok) return options.refuse ? options.refuse(result.why, routeContext, input as I) : refuseDefault(result.why);
    return handler(req, auth, routeContext, input as I, result.grant);
  };
}
