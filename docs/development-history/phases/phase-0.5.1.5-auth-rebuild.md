# Phase 0.5.1.5 — Auth Rebuilt Against the Hardened Design

**Status: Done, verified live.** 2026-09-30.

## Why this exists as its own record, not a patch to phase-0.5.1's

Phase 0.5.1's auth (Auth.js adapter + hand-rolled login/logout against a plaintext `sessionToken`)
was deleted outright and rebuilt from scratch, rather than patched in place, once
`domain-implementation-plan.md` §0.5.1.5 made Octalve Edu's post-security-review design canonical for
both projects (see that section, and `octalve-edu/docs/auth-review-2026-09-29.md` for the full
two-AI review this traces back to). Patching in place wasn't viable for one specific reason: the
hardened design requires storing a *hash* of the session token while the client's cookie holds the
plaintext, and Auth.js's `PrismaAdapter` looks sessions up by the raw cookie value — there's no clean
way to keep using it once tokens are hashed. So this phase also makes a decision the plan doc had left
open: **Auth.js is dropped entirely**, not just unmounted. `next-auth` and `@auth/prisma-adapter` are
removed from `package.json`; a ~90-line `src/lib/auth/session.ts` replaces `src/auth.ts` and
Auth.js's `auth()` helper.

## What was deleted

- `src/auth.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/v1/auth/login/route.ts` (old version)
- `src/app/api/v1/auth/logout/route.ts` (old version)
- `src/app/api/v1/branches/route.ts` (depended on the old `requireAdmin()`, rebuilt alongside it)
- `next-auth`, `@auth/prisma-adapter` from `package.json`
- `Account` model from `prisma/schema/auth.prisma` (existed only for Auth.js's OAuth flow, never used)

## What was built, against `domain-implementation-plan.md` §0.5.1.5's 8-item list

1. **`src/lib/auth/password.ts`** — `hashPassword`/`verifyPassword`, bcrypt cost 12. A `DUMMY_HASH`
   generated once at module load (a real bcrypt hash of a random UUID, not a malformed placeholder)
   closes the timing side-channel: `verifyPassword` always calls `bcrypt.compare`, even when no user
   matches or `passwordHash` is null.
2. **`src/lib/auth/session.ts`** — the Auth.js replacement. `createSession()` mints a 256-bit
   `crypto.randomBytes` token, stores only its SHA-256 hash (`Session.tokenHash`), returns the
   plaintext for the caller to set as the cookie. Enforces a 10-session-per-user cap (evicts oldest).
   `getSessionFromRequest()`/`getSession()` hash the incoming cookie before querying.
   `deleteSessionByToken()` and `revokeUserSessions()` (not called anywhere yet — no
   password-change/role-change flow exists yet to call it from, but it exists so that flow doesn't
   have to reinvent it). Cookie: `__Host-` prefix and `secure: true` when `APP_URL` starts with
   `https://`, plain `aleemaan.session-token` and `secure: false` otherwise — derived from the actual
   configured scheme, not `NODE_ENV`, per the design's Solo-install-over-HTTP concern.
   `clearSessionCookie()` deletes with the exact same attributes the cookie was set with.
3. **`src/lib/auth/rate-limit.ts`** — rewritten. `getClientIp()` now only trusts `X-Real-IP` (a
   header only a reverse proxy sets, never the client), not the client-suppliable
   `X-Forwarded-For` the old version read. `reserveAttempt()`/`refundAttempt()` replace the old
   check-then-record pair — reservation happens synchronously, before any `await`, closing the race
   where concurrent requests could all pass a check before any of them recorded anything. A hard
   `MAX_TRACKED_IDENTIFIERS` cap with an eviction sweep replaces the old unbounded `Map`.
4. **Login route** (`src/app/api/v1/auth/login/route.ts`) — three-layer rate limiting (per-IP,
   per-`ip+email` as hard gates; per-account as a soft signal returned in the response, not a hard
   block, so it can't be weaponized to lock out the real user), password max length 128, email
   normalization (already present, kept), session rotation (deletes any session already presented
   before minting a new one).
5. **Logout route** — deletes by hash, clears the cookie with matching attributes.
6. **`src/lib/auth/require-admin.ts`** — now takes `req` explicitly (reads via
   `getSessionFromRequest`, not a global `auth()` call) — same authorization rule as before (any
   `ADMIN` membership grants cross-branch access), same rule Octalve Edu's plan adopted for
   `campusId`, unchanged.
7. **`prisma/schema/auth.prisma`** — `Session.tokenHash` (renamed from `sessionToken`), plus
   `createdAt`/`lastUsedAt`/`userAgent` columns for the eventual active-devices UI (not built).
   Migration `20260930065007_rebuild_auth_hashed_sessions`.
8. **`.env.example`/`.env`** — `AUTH_SECRET` removed (nothing reads it anymore), `APP_URL` added.

## Verified live (not just built)

Full request sequence against a running `pnpm dev`, cookie jar, real Postgres:
1. `POST /api/v1/setup` → `201`, seeds 4 branches + first ADMIN.
2. Wrong password and non-existent email both → `401 INVALID_CREDENTIALS`, identical body, and
   comparable response time (both now execute `bcrypt.compare` — the old version's missing-user path
   returned near-instantly, skipping it entirely).
3. Correct login with a mixed-case email (`ADMIN@AlEemaan.TEST`) → `200`, confirming normalization
   still matches the lowercase-stored record.
4. `GET /branches` with no cookie → `401`; with the session cookie → `200`, 4 branches.
5. `POST /branches` new name → `201`; same name again → `409 DUPLICATE_NAME`.
6. `POST /auth/logout` → `200`; the *same* now-stale cookie against `GET /branches` → `401` —
   confirms the session row, not just the cookie, is what logout actually destroys.
7. **Rate limiter**: 6 rapid failed logins from one spoofed `X-Real-IP` → the 6th returns `429`,
   confirming the reserve-then-refund fix actually gates concurrent-ish requests correctly (the old
   version's check-then-record ordering would have let more through).
8. **Session hashing**: cookie value and the `Session.tokenHash` row inspected directly via `psql`
   side by side — confirmed different values (the DB never holds the plaintext token).

Test data truncated afterward (`TRUNCATE ... CASCADE` on `Session`/`Membership`/`AuditLog`/`User`/
`Branch`/`SystemSettings`), dev server stopped.

## Explicitly not done in this pass

- Session lifecycle items beyond rotation-at-login and the per-user cap: no absolute-timeout layer,
  no nightly purge job, `revokeUserSessions()` exists but isn't called from anywhere (no
  password-change/role-change flow exists yet to call it from).
- Active-devices revocation UI — the `Session` schema now has the columns for it, no page built.
- Database-level email case-insensitivity (`citext`/`CHECK` constraint) — app-layer `toLowerCase()`
  only, per the plan's item 5, not yet applied.
- MFA — not in scope for AlEemaan at all currently (Octalve Edu's plan has it; AlEemaan's doesn't).
- The Better Auth question — explicitly deferred per the plan's item 8; not revisited here.
