# Phase 0.5.H — Users pages and invitations (a port of Octalve Edu's 0.5.4)

**Status: BUILT (2026-10-07); the full-suite result is under "Verification"; the mutation pass is PENDING — all mutation passes after 0.5.G are deferred to the end of Phase 2 by the maintainer's decision** (see `docs/decisions/0006-…`).
Branch `claude/aleemaan-users-invitations`, **stacked on `claude/aleemaan-0.5.G` (PR #10, still open)**. Design of record: plan §"Build design — Users pages and invitations", committed alone before any code (`1f2ab1e`); "As built" follows it in the plan. Source of behaviour: Octalve Edu's 0.5.4, read from the raw diff, not copied.
Decisions this phase made that someone might reverse by mistake have ADRs: `docs/decisions/0002` (a deactivated membership is no membership; the last one signs the person out), `0003` (live-data safety), `0005` (last administrator counted by person under a row lock).

> **Update 2026-10-07 (same branch, after the maintainer answered the open question): a person may now belong to several branches.** Wherever this record says "one active membership per person", read "one membership per person per branch" — see plan "Design change — a person may belong to several branches", ADR `0007`, and migration `20261008090000_invitation_per_branch`. Test counts below were taken before the change; the final numbers are under "Final run".

## What this delivers
An administrator can **see the school's people** (filters: role, branch, status, search; paged), **invite** someone (email + role + branch → a hashed, single-use, seven-day link in the URL fragment, mailed after the response), **change a person's role or branch**, **deactivate** and **reactivate** a membership, and **resend or revoke** a pending invitation. The invitee opens `/accept-invite`: a person with no account chooses a name and password; a person with an account must be signed in as it; anyone else is refused. Everything is audited in the same transaction as the change.

| Piece | Where |
|---|---|
| Migration (**additive, live-safe**) | `prisma/migrations/20261007090000_users_invitations` — `Membership.deactivatedAt` (nullable, no default: every existing membership reads as active), table `Invitation`, a partial unique index (one open invitation per address) and a lower-case CHECK |
| Libraries | `lib/invitations/{token,status,service}.ts`, `lib/members/{service,http}.ts`, `invitationEmail` in `lib/email/messages.ts` |
| Readers that now ignore a deactivated membership | `getUserMemberships`, `withAuth({ roles })`, `completeSignIn`'s admin check, the dashboard and Branches member counts |
| API (9 routes, all `ADMIN` only except the two public ones) | `GET /members`, `PATCH /members/[id]`, `POST …/deactivate`, `POST …/reactivate`; `GET`/`POST /invitations`, `DELETE /invitations/[id]`, `POST …/resend`; public `POST /invitations/preview`, `POST /invitations/accept` |
| Screens | `/users` (nav "Users" is a link now; anyone but an administrator gets the access-denied view); `/accept-invite` |
| Primitives ported with their users | `Dialog`, `SelectField`, `Alert` (with `announce`), `postJson` (PATCH/DELETE) — code-identical with Octalve's |

`[id]` in the member routes is the **membership's** id, not the user's (a person may hold several memberships; the id keeps every action unambiguous).

## Verification
Gate order: `pnpm typecheck` → `pnpm lint` → `pnpm format:check` → `pnpm build` → tests. All four static steps clean on the final tree.
New tests (counts are the runner's, per project): unit `users-model` 8 · integration `invitations` 31, `members` 20, `deactivated-members` 3, `users-migration` 2 · api `members` 20, `invitations` 25 · e2e (desktop **and** phone) `users` 14, `accept-invite` 8 · a11y/layout `Users and invitation screens` 7 (≈ 25 states, axe WCAG 2.2 A/AA in both themes, no horizontal scroll, ≥ 44 px tap targets on the phone).
What they pin: the lifecycle with the hash at rest and no secret in any audit row; **deterministic lost races** (a held row in a second connection — the link claimed, revoked, or an account appearing after it was read); atomic accept (a failure leaves no user, no membership and an unspent link); two simultaneous accepts → one account; an existing account attached only by its owner; a deactivated person cannot come back through an old link; **administrators counted by person under a row lock, incl. two administrators deactivating or demoting each other at the same instant (integration and over HTTP)**; deactivation deletes sessions only when it removes the person's last active membership; a deactivated administrator is a 403 on every administrator route and gets an ordinary (not 7-day) session at sign-in; **the migration, stepped back inside a rolled-back transaction onto a database with existing people, changes no existing row**; the partial unique index and lower-case CHECK hold whatever the application does.
**Full suite:** see "Final run" at the end of this file.

## Findings and decisions (read these)
1. **Defect found by the browser test, fixed:** the Invite dialog marked the branch as optional (copied from Octalve, where a campus is optional) and sent `branchId: null`, so choosing no branch produced a raw schema message. A membership always has a branch here: the dialog now says "Choose a branch." next to the field, and the hint "Everyone else sees only their own branch" (a promise nothing here keeps yet) became "The branch this person belongs to."
2. **`LAST_ADMIN` is unreachable over HTTP except by a race** — any administrator who can ask is themselves a second administrator. The rule is therefore pinned in-process (`members.spec`), and the HTTP test is the race (two administrators deactivating each other: exactly one 200).
3. **The invitation can name any branch; the role is school-wide** (plan Decision 1). The list shows an administrator's branch as "All branches".
4. **The breach check runs only on the server wired to the stand-in for the range API** (`BREACH_PORT`); the accept tests for a breached password go to that server (same database, same link), and the accept-invite browser spec runs against it entirely.
5. **Testing the migration:** DDL is transactional in Postgres, so the test steps the test database back to "before the migration" inside a transaction, applies the migration's own SQL file, compares, and rolls back. Prisma reuses a prepared statement per query text, so a `SELECT *` run before and after the column change failed with "cached plan must not change result type" — the second query is worded differently on purpose.
6. **Not built from the design:** the per-token limit on the public routes (the design listed one; only the per-IP limit exists, as in Octalve — an unguessable 256-bit token makes it moot, and a per-IP failure limit with refund covers the rest). The relative-expiry wording ("Expires in 6 days") is tested in the unit spec and the browser.
7. **Divergences from Octalve** (logged in both plans' shared-names tables): `members/[membershipId]`; `branchId` for `campusId`; no RLS / invitation context; **deactivating a person's last active membership signs them out** (Octalve lets the session live on with no school); an ADMIN's branch shown as "All branches".

## Not done (and why)
- **Mutation pass: NOT RUN — pending, end of Phase 2.** The list is in the plan ("Mutation plan", Decision 9). First targets: the last-admin lock and per-person count, the accept claim's conditions, `deactivatedAt: null` in each reader, session deletion on the last membership only.
- Permissions (`withAuth` `permissions` and the grant UI — Octalve's 1.0), admin-initiated email change (Octalve 0.5.4-F is still open there), School Settings — **not part of this port, and not started**.
- **Deploy notes:** run the migration first, then the code (the old code runs unchanged against the migrated database); the reverse proxy must pass `Host` through (or `TRUST_FORWARDED_HOST=true`) — that is 0.5.G's note, and this stacks on it; invitation mail needs `RESEND_API_KEY` + `EMAIL_FROM`.
- Open questions for the maintainer: one person in two branches? Should `CAN_MANAGE_USERS` ever manage people? Is "deactivated = signed out" wanted? Invitation wording and sender.

## Final run
One lane, the whole suite, on the final tree (`b32b976` plus docs): `pnpm typecheck` → `pnpm lint` → `pnpm format:check` → `pnpm build` clean, then `npx playwright test --timeout=120000` against `aleemaan_test`: **1042 passed, 0 failed, 18 skipped, 56.6 minutes** (1060 tests in all). The 18 skips are the viewport-specific tests that skip themselves on the other project (phone-only tests on the desktop project, and the reverse — `test.skip(({ isMobile }) => …)`). Nothing was re-run, loosened or retried. Mutation pass: **not run** (pending, end of Phase 2).
