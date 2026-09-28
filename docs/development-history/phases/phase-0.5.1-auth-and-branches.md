# Phase 0.5.1 — Minimal Auth & Branch Management: Completion Record

**Status: Done.** Verified live, not assumed from the plan. Designed first in
`domain-implementation-plan.md` §0.5.1, including the mid-implementation correction (Auth.js's
Credentials provider is incompatible with database sessions) recorded there rather than only fixed
silently in code.

## What was built

- `src/auth.ts`: Auth.js v5 (`PrismaAdapter`, `session.strategy: "database"`, `providers: []`) —
  used only for its adapter/session-reading (`auth()`), never its own sign-in flow. Explicit
  `cookies.sessionToken.name` (`aleemaan.session-token`) so the hand-rolled login route and `auth()`
  agree on the exact cookie.
- `src/app/api/v1/auth/login/route.ts` — hand-rolled: CSRF → rate limit → Zod → `bcrypt.compare` →
  `prisma.session.create()` (random 32-byte token, 30-day expiry) → sets the cookie directly. Wrong
  email and wrong password both return an identical `401`.
- `src/app/api/v1/auth/logout/route.ts` — deletes the `Session` row, not just the cookie.
- `src/lib/auth/require-admin.ts` — any `Membership` with `role: ADMIN` grants access regardless of
  which branch it's anchored to (resolves the open question left in `prisma/schema.prisma`'s
  `Membership` comment since Phase 0.5.0).
- `src/app/api/v1/branches/route.ts` — `GET` (admin-only, lists branches) and `POST` (admin-only,
  Zod-validated, unique-name-guarded, audit-logged `BRANCH_CREATED`). No `PATCH`/`DELETE` — see the
  plan doc for why that's deliberately out of scope this phase.

## The one real correction (see domain-implementation-plan.md §0.5.1.1 for the full record)

Auth.js v5 refuses `Credentials` + `session.strategy: "database"` outright — a hard design
constraint, not a local bug. Rather than switch to JWT (abandoning the deliberate
revocable-by-deleting-the-row decision), removed the Credentials provider entirely and hand-rolled
login/logout against the same `Session` table Auth.js's adapter reads from.

## How it was verified

Live, with a real cookie jar, same standard as every previous phase:

1. `pnpm build` → clean, all 4 new routes listed.
2. Fresh setup wizard run → first `ADMIN` created.
3. `POST /api/v1/auth/login` → `200`, `Set-Cookie: aleemaan.session-token=...`.
4. `GET /api/v1/branches` with that cookie → all 4 seeded branches. Without the cookie → `401`.
5. `POST /api/v1/branches` → `201`, new branch created. Same name again → `409 DUPLICATE_NAME`.
   Branch confirmed present on a follow-up `GET`.
6. `POST /api/v1/auth/logout` → `200`; `GET /api/v1/branches` with the same (now-dead) cookie → `401`
   — confirms the session row was actually deleted, not just the client-side cookie cleared.
7. Test data cleaned from the local dev database afterward.

## What's explicitly not here yet

`PATCH`/`DELETE` on branches, a login UI (API-only, verified via `curl`, same as the setup wizard),
password-reset/forgot-password, TOTP MFA, session-revocation UI. The Settings design (School Info,
active session/term, per-branch class lists, `AssessmentConfig`) is being planned next, not built in
this phase.
