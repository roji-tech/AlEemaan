# Phase 0.5.1.6 — Synced to Octalve Edu's built-and-verified auth

**Status: BUILT AND VERIFIED (2026-09-30) — awaiting the maintainer's review and merge.** The work is
on branch `claude/octalve-auth-sync` of `roji-tech/AlEemaan` (opened as a PR only when the maintainer
asks; nothing here is merged by the assistant). This file is a live work log until that merge; after
it, treat it as append-only like every other file in this folder.

Design of record: `docs/development-history/domain-implementation-plan.md` §0.5.1.6 (written before
any code). Reference implementation and the full defect list: Octalve Edu's
`docs/development-history/phases/phase-0.5.1-auth.md` (branch `claude/auth-0.5.1-port` of
`roji-tech/octalve-edu-fork`). Test guide: `tests/README.md`. The status of every finding in the
2026-09-29 two-AI review — for **both** repos, including P0 #4 (the `__Host-` cookie set and cleared in
real Chromium over TLS, now verified here too) — and the six new defect classes the running suite found
are in Octalve Edu's `docs/auth-review-2026-09-30-verification.md`.

## Why this exists

Phase 0.5.1.5 rebuilt this repo's auth against the shared hardened *design*. Octalve Edu then *built*
that design (porting this repo's code, and going further), verified it with a repeatable suite this
repo did not have, and that verification found defects — several of which were sitting in this code.
Keeping two copies of one mechanism honest means bringing them back to a single implementation with a
short, documented list of differences. That is this phase.

It also closes the two items 0.5.1.5 deferred (database-level email case-insensitivity; absolute
session expiry + purge) and fixes a dead end: the setup wizard redirected to `/login`, which did not
exist.

## Work log

### 1. Design first
Plan §0.5.1.6 (what is ported, what deliberately differs, why) and the shared-names table (also added
to Octalve Edu's plan). §0.5.1.5's closing line, "None of the above is applied to the live code yet",
was true when written and stale by the end of that day — corrected in place with a note, not silently.

### 2. Migration `20260930100000_two_level_sessions_and_email_check` — safe on live data
- `Session.absoluteExpires` added and **backfilled from each row's existing `expires`**, so an existing
  session ends exactly when it always would have: nobody is signed out early, nobody's session is
  lengthened. (Octalve Edu's version deletes sessions first because none existed there; this repo has a
  real school behind it, so it does not.)
- `CHECK ("email" = lower("email"))` on `User`, after normalising existing emails. If two accounts differ
  only by case the migration **aborts before touching a row**, naming the address, instead of guessing
  which account survives.
- **Verified against a database in the pre-migration shape with legacy rows** (mixed-case admin email;
  three sessions, one already expired):

  | Check | Result |
  | :-- | :-- |
  | `Admin@School.COM` | became `admin@school.com` |
  | 3 sessions (2 live, 1 dead) | all 3 kept; `absoluteExpires = expires` on each |
  | mixed-case `INSERT` afterwards | rejected by Postgres (`User_email_lowercase_check`) |
  | lowercase / `NULL`-email `INSERT` | accepted |
  | second database with `Dup@School.com` **and** `dup@school.com` | `P3018`, message: *Cannot enforce lowercase emails: more than one account exists for "dup@school.com"…*; afterwards both rows unchanged, no `absoluteExpires` column, no constraint (transactional rollback) |

### 3. Code brought to parity
- `lib/auth/session.ts` — two-level expiry (idle 30 d sliding, at most one write per 5 min; absolute
  90 d, **7 d for anyone with an ADMIN membership**), cookie lives to the absolute expiry,
  `purgeExpiredSessions()`, expired-row cleanup at login. Cookie names stay
  `aleemaan.session-token` / `__Host-aleemaan.session-token`, so nobody is signed out by the deploy.
- `lib/auth/rate-limit.ts` — configurable trusted client-IP header (`CLIENT_IP_HEADER`,
  `TRUSTED_PROXY_HOPS`), a one-time production warning on the shared-bucket fallback, true LRU eviction,
  async signatures. **Per-IP login limit 30 (was 5)**; per-`ip+email` 5; per-account soft 10.
- `lib/auth/password.ts` + `password-policy.ts` — **72 bytes at every set path** (rejected, never
  truncated); login stays at 128 characters because this repo has live accounts.
- `lib/auth/with-auth.ts` **replaces `lib/auth/require-admin.ts`** (deleted); `branches/route.ts`
  migrated. `withAuth(handler, { roles: [Role.ADMIN] })`: CSRF for every non-GET method is enforced by
  the wrapper (no more per-route `validateCSRF()` to forget), **401 for "not signed in", 403 `FORBIDDEN`
  for "signed in but not an admin"** (the old guard returned 401 for both), every response the wrapper
  emits is `no-store`. `permissions` stays typed `never` and throws at module load — in both repos —
  until §1.7's permission design is built in both together.
- Routes: login (`no-store`, the ADMIN 7-day cap, schema-invalid path consumes only the IP budget),
  logout (its CSRF refusal was `ok({loggedOut:false}, {}, 403)` — an error status in a *success*
  envelope with `error: null` — now a proper `fail(… 403 CSRF)`), new `GET /api/v1/auth/me`, setup route
  on the new limiter/hasher/policy.
- `next.config.ts` — `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` (the setup form was
  frameable), `nosniff`, `Referrer-Policy`, no `X-Powered-By`. HSTS is left to the reverse proxy.
- `.env.example` — `CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS`, `TEST_DATABASE_URL`.

**A porting hazard worth recording.** Octalve Edu's limiter functions are `async` (so a Redis backend
stays a drop-in); this repo's were synchronous. Every call site must now `await` — and
`if (!reserveAttempt(key))` *without* `await` is `!Promise`, which is always `false`: the limit would be
silently disabled, and TypeScript and the default ESLint config accept it. Both call sites here were
audited by hand (grep of every `reserveAttempt`/`refundAttempt`/`checkRateLimit`), and the mutation
table below shows the API suite goes red if either is left un-awaited.

### 4. Screens (AlEemaan had none for signing in)
`/login`, `/dashboard` (who is signed in, which branches), `/` as a pure router, and the setup wizard
retrofitted onto the shared accessible primitives (`components/ui`, `components/auth`), with the
findings Octalve Edu's verification produced applied here too: `method="post"` on the forms (a native /
pre-hydration `GET` submit would put the administrator's password in the URL), an explicit "Continue to
sign in" instead of a timed redirect (WCAG 2.2.1), live 72-byte feedback, contrast ≥ 4.5:1 in every
state, 44 px tap targets, focus returned to the password field after a rejected sign-in, cross-tab
sign-out, back/forward-cache revalidation. The unused create-next-app assets were removed.
**Palette and identity are Octalve Edu's for now** — AlEemaan's own visual identity (the Figma-like
artifact) is a re-skin of these primitives, tracked, not decided here.

### 5. Test suite
The whole `tests/` tree and `playwright.config.ts` from Octalve Edu, adapted: own ports (3200 / 3201 /
3543) and database (`aleemaan_test`), `Branch`/`Membership` instead of `Tenant`/`TenantMembership`, and
three additions for what is specific to this repo — `tests/api/branches.spec.ts` (the one real consumer
of `withAuth`'s `roles`: 401 vs 403, every non-admin role, an admin whose row is anchored to another
branch, demotion taking effect on the next request, audit trail, CSRF, validation, duplicates),
`withAuth` `roles` tests in `tests/integration/with-auth.spec.ts` (ordering CSRF → authentication →
authorization), and `unit/with-auth.*` adapted to the roles semantics. Port constants live in
`tests/support/env.ts` — no literal ports in specs.

## Verification results

`pnpm test` = production build, then every project, against `aleemaan_test`. Playwright, Chromium 141,
Node 22, Postgres 16, one worker, no retries.

| Project | Covers | Tests | Result |
| :-- | :-- | --: | :-- |
| `setup` | test database created, migrated with `migrate deploy`, emptied | 1 | pass |
| `unit` | rate limiter, password hashing/limits, `withAuth` misconfiguration refusals | 23 | pass |
| `integration` | session lifecycle, and `withAuth` (CSRF ordering, cache headers, `roles`) against Postgres | 42 | pass |
| `api` | login, logout, `me`, setup, **branches (admin-only)**, all rate-limit layers, timing parity, CSRF, cookies, security headers — real HTTP against `next start` | 97 | pass |
| `e2e-desktop` | real Chromium, 1280×720: sign-in flows, setup → sign-in → dashboard, axe WCAG 2.2 A/AA on every screen and state | 41 | pass |
| `e2e-mobile` | the same on a Pixel 7 profile, plus ≥ 44 px tap targets and no horizontal scroll | 39 (+2 desktop-only keyboard tests skipped by design) | pass |
| `https` | real Chromium over real TLS: `__Host-` cookie set on login and removed on logout | 7 | pass |
| **Total** | | **250 passed, 2 skipped, 0 failed** — 3.9 min | |

Static checks on the same tree: `tsc --noEmit` clean (including the compile-time `@ts-expect-error`
checks on `withAuth`'s options), ESLint 0 errors / 0 warnings, `next build` clean.

The earlier live checks (phase 0.5.1.5, "Verified live") are now automated and repeatable: setup `201`,
identical wrong-password / unknown-account responses and matching timing, mixed-case sign-in, branches
`401` → `200`, create `201` → duplicate `409`, logout then the *stale cookie* `401`, the `429` on the
6th failure with a spoofed header, and the cookie value vs `Session.tokenHash` inspected in the real
database.

### Mutation testing — the port was shown to be able to fail

The unit- and integration-level assertions are byte-identical to Octalve Edu's, whose 40 injected bugs
were all caught (see its phase record). Here the port itself is attacked — the wiring, the
AlEemaan-specific rules, and the sync→async hazard above:

For each row a deliberate bug was injected, the named suite ran, and the file was restored. Every
mutation was caught (13 of 13), and each run started from a green, unmutated suite — so a failure is
attributable to the injected bug.

| Layer | Bug injected | Caught by |
| :-- | :-- | :-- |
| api | `withAuth`: role check removed | `branches.spec` (non-admins get through) |
| api | "signed in, not an admin" reported as 401 again (the old conflation) | `branches.spec` (3 failures) |
| api | branch-creation audit action renamed | the audit-trail test |
| api | **setup: `reserveAttempt` not `await`ed (the sync→async hazard)** | the setup rate-limit test |
| api | **login: per-pair `reserveAttempt` not `await`ed** | the rate-limit suite (5 failures) |
| api | ADMIN sessions no longer get the 7-day cap | the login cookie-expiry test |
| api | setup without the 72-byte rule | the setup validation test |
| api | security-headers config removed | 8 failures |
| integration | session cookie always `Secure` (breaks plain-HTTP installs) | the cookie-attribute test |
| https | **logout clears with a bare `cookies.delete()` — the real P0 #4 bug** | "logout actually removes the cookie" (2 failures) |
| e2e | setup form back to a native `GET` | the `method=post` assertion |
| e2e | sign-in form back to a native `GET` | the JS-disabled test |
| e2e | no focus restore after a failed sign-in | 3 failures |

### Cross-verification against Octalve Edu, file by file

A normalised comparison (full-line comments dropped; brand, cookie and port names mapped onto one
spelling) of the 59 source and test files the two repos share:

- **36 are code-identical** — the whole session / password (+ policy) / limiter / CSRF / envelope / db /
  roles core, every UI primitive, the sign-out, header, revalidator and channel components, the sign-in
  form, the logout and `me` routes, `next.config.ts`, `playwright.config.ts`, and every test support file
  and spec that doesn't touch the data model.
- **23 differ, each on purpose:** `with-auth.ts` (roles), `memberships.ts` (`Branch`), `login/route.ts`
  (two lines: `membership` vs `tenantMembership`), `setup/*` and `dashboard` (branches vs a school),
  `page.tsx`, `login/page.tsx`, `status.ts` (no Solo/SaaS switch here), `AuthShell` and `layout` (brand
  copy), and the data-model-specific specs.
- Only here: `branches/route.ts`, `branches.spec.ts`. Only there: `tenant/validate-code.ts`.

The comparison was an ad-hoc script; making it a committed drift check (`--sibling ../octalve-edu`,
non-zero exit if a must-match file drifts) is a tracked idea, not built.

## Cross-repo status after this phase

| | Octalve Edu | AlEemaan |
| :-- | :-- | :-- |
| Hashed-token sessions, two-level expiry, purge | built, verified | built, verified |
| Limiter (config IP header, LRU, async) | built, verified | built, verified |
| Password: 72 bytes at set, 128 at login | built, verified | built, verified |
| `withAuth` | session + CSRF; `roles`/`permissions` refused until §0.5.2 | session + CSRF + `roles`; `permissions` refused until §1.7 |
| Security headers | built, verified | built, verified |
| `/login`, `/dashboard`, `/setup` | built, verified | built, verified |
| Test suite, mutation-checked | 234 tests, 40 mutations caught | 250 tests, 13 mutations caught (+ the shared assertions above) |
| Real-HTTPS `__Host-` cookie set **and cleared** | verified | verified |

Differences that remain **on purpose**: tenancy (`Tenant`/`Campus`/RLS/tenant resolution in Octalve
Edu only), `withAuth`'s `roles`, the `FORBIDDEN` code, the Redis-backed limiter (Octalve Edu's SaaS mode
only), the cookie prefix, the wizard's fields (no school name here; it seeds four branches), and the
brand/palette question above.

## Explicitly not done
TOTP MFA, password reset, breached-password check, the active-devices page, a nonce-based script CSP,
Firefox/WebKit runs, AlEemaan's own visual identity, Phase 0.5.2 (School Settings — still waiting on a
go-ahead).
