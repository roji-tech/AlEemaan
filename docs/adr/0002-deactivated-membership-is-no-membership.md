# 0002 — A deactivated membership is no membership; the last one also signs the person out
Status: accepted (built in 0.5.H; tests written) · Decided: Users/invitations port design · Recorded: 2026-10-07

## Context
Users can be deactivated, never deleted (audit history must survive). If any reader forgets to ignore a deactivated membership, that person keeps access. Octalve's design lets a deactivated person's sessions run until they expire.

## Decision
`Membership.deactivatedAt` set means **no membership in every reader**: `getUserMemberships`, `withAuth` roles, `completeSignIn`, dashboard and branch counts, last-admin counting. Deactivating a person's *last active* membership also deletes their sessions in the same transaction (**a deliberate divergence from Octalve**, logged in both shared-names tables). Accepting an invitation for a deactivated person is `INVALID`; reactivation is the only way back.

## Consequences
Every new query on `Membership` must filter `deactivatedAt: null`. The migration is additive and leaves all existing memberships active.

## Enforced by
`tests/integration/deactivated-members.spec.ts` (each reader, incl. the sign-in admin policy), `tests/integration/members.spec.ts` (sessions deleted only with the last membership; a refused deactivation deletes none), `tests/api/members.spec.ts` (signed out over HTTP; a deactivated administrator is a 403 on every administrator route). Code: `src/lib/members/service.ts`, `src/lib/auth/memberships.ts`, `with-auth.ts`, `complete-sign-in.ts`.

## Related
Plan "Build design — Users pages and invitations", decisions 1–10 · `phases/phase-0.5.H-users-and-invitations.md` · open question for the maintainer: is "deactivated = signed out" wanted?
