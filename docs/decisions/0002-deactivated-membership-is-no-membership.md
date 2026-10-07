# 0002 — A deactivated membership is no membership; the last one also signs the person out
Status: accepted (design committed `1f2ab1e`; its tests are pending in the users branch) · Decided: Users/invitations port design · Recorded: 2026-10-07

## Context
Users can be deactivated, never deleted (audit history must survive). If any reader forgets to ignore a deactivated membership, that person keeps access. Octalve's design lets a deactivated person's sessions run until they expire.

## Decision
`Membership.deactivatedAt` set means **no membership in every reader**: `getUserMemberships`, `withAuth` roles, `completeSignIn`, dashboard and branch counts, last-admin counting. Deactivating a person's *last active* membership also deletes their sessions in the same transaction (**a deliberate divergence from Octalve**, logged in both shared-names tables). Accepting an invitation for a deactivated person is `INVALID`; reactivation is the only way back.

## Consequences
Every new query on `Membership` must filter `deactivatedAt: null`. The migration is additive and leaves all existing memberships active.

## Enforced by
Intended: `tests/integration/` deactivated-readers and session-revocation tests, API tests for the members routes — **not yet written**; this ADR's status line changes when they are. Code: `src/lib/members/service.ts`, `src/lib/auth/memberships.ts`, `with-auth.ts`.

## Related
Plan "Build design — Users pages and invitations", decisions 1–10 · open question for the maintainer: is "deactivated = signed out" wanted?
