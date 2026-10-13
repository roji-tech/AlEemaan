# 0015 — A route that acts on a branch is wrapped by a combinator that says where the branch comes from and what the caller must be there

Status: Proposed
Decided by: <the maintainer — to accept or modify> · Date: —
Recorded: 2026-10-13 (drafted by an agent; this is the follow-up ADRs 0012 and 0014 name as `withAuth({ roles, branch })`)

## Context

`withAuth({ roles })` means "a role in ANY branch" (ADR 0012): a coarse gate. Whether the caller may act on THIS branch is answered by helpers the handler calls itself (`canAdminister`, `resolveBranchRole`, `branchOutOfScope`, `studentOutOfScope`). A forgotten call is a cross-branch privilege hole; ISS-0001, ISS-0002, ISS-0004 and ISS-0011 were exactly that. Today a source-level test (`tests/unit/route-role-guard.spec.ts`) finds a handler that names a branch and calls no helper, but it cannot tell a right check from a wrong one, and the helpers are called in many places in slightly different ways (404 vs 403, which role list, where in the handler).

## Decision

- **Add one combinator, composed INSIDE `withAuth` and AFTER `validate()`, that resolves and enforces the branch**, so a handler receives a branch it has already been allowed to act on:
  `withAuth(validate({ body }, withBranch({ of: (input) => input.body.branchId, as: "administer" }, async (req, auth, ctx, input, { branchId, role }) => …)), { roles })`
  `as` is one of `administer` (superadmin, or an ADMIN of that branch), `staff-read`, `staff-write` (a staff role held IN that branch; the role returned is the one held there). `of` may read the body, the query, or (for an entity route) look up the entity's branch (`student`, `membership`), and an unknown entity gives the same answer as one in another branch.
- **Refusals are the ones already decided, in one place:** a branch or entity the caller cannot act on in the URL or looked up from an id is `404`; a branch named in a request body that is not theirs is `403` (ADR 0014); no membership at all is the same as an unknown branch.
- **`withAuth` itself does not change.** It runs before the body is parsed, so it cannot know the branch; the roles gate stays where it is. (The name `withAuth({ roles, branch })` in earlier ADRs is retired in favour of this composition.)
- **The source-level guard becomes stricter:** a handler that names a branch must be wrapped by `withBranch` (or be on the allowlist with a reason); calling a helper directly is no longer accepted for new routes. Existing routes are moved over one family at a time (students, attendance, academics, members), each with its existing API tests unchanged as the proof of "no behaviour change".

## Alternatives Considered

- **A `branch` option on `withAuth`:** the branch is usually in the body, which `validate()` parses later; resolving it in `withAuth` would mean parsing twice or hard-coding where each route keeps it.
- **Leave the helpers and the source test:** works today, but "a helper was called" is not "the right check was applied"; the combinator makes the check structural.
- **Postgres row-level security per branch (as in Octalve per tenant):** a bigger change to a live system for a school with four branches; ADR 0001 chose branches-are-not-tenants.

## Consequences

- A migration of existing routes, with no change to any response: the existing API specs are the check.
- The guard test asserts structure (wrapped or allowlisted); the API specs still prove the answers.
- **Revisit if:** a route needs the branch from more than one place, or a second kind of branch-scoped authority (a head of a branch who cannot be demoted by other branch administrators, ADR 0014) arrives.

## Enforced by

(planned, task 0009) unit: `tests/unit/with-branch.spec.ts` (each `as`, each source of the branch, the 404/403 rules, a deactivated membership); `tests/unit/route-role-guard.spec.ts` (every handler that names a branch is wrapped or allowlisted); the existing API specs unchanged.

## Binds

- (planned) `src/lib/auth/with-branch.ts`, `src/lib/auth/branch-access.ts`, `src/lib/students/scope.ts`, `tests/unit/route-role-guard.spec.ts`
