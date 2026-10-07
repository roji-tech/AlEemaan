# AlEemaan — Domain Implementation: Step-by-Step Plan

> Companion to `docs/development-history/aleemaan_progress.md` (what's actually built, verified
> against the real repo) and `docs/development-history/phases/*.md` (one completion record per
> finished phase). Mirrors Octalve Edu's own `domain-implementation-plan.md` process: design each
> phase here first, then implement against it — not the other way around. Every model and rule below
> traces to a PRD section (the Claude Doc — see `aleemaan_progress.md` for its sync status) or to
> `docs/feature-reconciliation-audit.md`'s findings.

## Context

Phase 0 (scaffold) and Phase 0.5.0 (first-run setup wizard) are done — see their own completion
records in `docs/development-history/phases/`. Both were built before this plan document existed,
which is itself the gap this file starts closing: from here on, a phase gets designed here first.

---

## Phase 0.5.1 — Minimal Auth (Credentials + Database Sessions) & Branch Management

> **HISTORICAL — read §0.5.1.5 and §0.5.1.6 below for what exists now.** §0.5.1.1–0.5.1.4 describe the *first* build, which used
> Auth.js (`next-auth`, `@auth/prisma-adapter`, `src/auth.ts`, `src/app/api/auth/[...nextauth]`). All of that was **deleted** on
> 2026-09-30: auth is hand-rolled (`src/lib/auth/session.ts`, hashed session tokens). Nothing in this repo imports Auth.js any more. The
> text is kept because it records *why* (Auth.js v5 refuses `Credentials` + database sessions), not because it describes the code.

Two things forced together into one phase: branch management needs *some* way to know "is this
caller an admin," and nothing beyond the setup wizard's one-time bootstrap currently authenticates
anyone at all. Building a real login is the smallest correct prerequisite — not a throwaway stand-in,
since Octalve Edu's own Phase 0.5.1 plans the identical mechanism (Auth.js, database sessions,
credentials provider against `passwordHash`); doing it the same way here avoids redoing it later.

**Deliberately out of scope for this phase** (separately planned, not needed for branch management):
TOTP MFA, password-reset/forgot-password flow (flagged as a real gap to fix in
`feature-reconciliation-audit.md`, but its own piece of work), session-revocation UI, any dashboard
page — this phase is API-only, verified the same way the setup wizard was (`curl` with a cookie jar),
since no UI exists yet for anything beyond `/setup`.

### 0.5.1.1 — Auth.js wiring

**Correction, found at implementation time, recorded here rather than only in the code:** Auth.js
v5 refuses a `Credentials` provider combined with `session.strategy: "database"` outright —
`UnsupportedStrategy: Signing in with credentials only supported if JWT strategy is enabled`, thrown
by its own `assertConfig` on every request under `/api/auth/*`, not just sign-in. This is a hard
design constraint in Auth.js itself, not a bug to work around locally. Since database sessions were
a deliberate choice (revocable by deleting the row — same reasoning as Octalve Edu's Phase 0.5.1
plan), switching to JWT to satisfy Auth.js was rejected; instead:

- `next-auth@beta` (v5) + `@auth/prisma-adapter`, both added to `package.json`.
- `src/auth.ts`: `PrismaAdapter`, `session.strategy: "database"`, **no providers configured at
  all** (`providers: []`) — Auth.js is used only for its adapter/session-reading machinery (the
  exported `auth()` helper), never for its own sign-in orchestration. An explicit
  `cookies.sessionToken.name` (`aleemaan.session-token` / `__Secure-...` in production) is set so
  the hand-rolled login route below and `auth()`'s reads agree on the exact cookie.
- `src/app/api/v1/auth/login/route.ts` (hand-rolled, not Auth.js's Credentials flow): same guard
  order as every other mutating route (CSRF → rate limit → Zod) → `bcrypt.compare` against
  `passwordHash` → on success, directly `prisma.session.create()` (a random 32-byte hex token, 30-day
  expiry) and sets the session cookie itself. Wrong email and wrong password return the identical
  `401 INVALID_CREDENTIALS` — enumeration can't distinguish "no such user" from "wrong password."
- `src/app/api/v1/auth/logout/route.ts`: deletes the `Session` row matching the cookie (not just the
  cookie) — a session is over when its row is gone, that's the whole point of the database strategy.
- `src/app/api/auth/[...nextauth]/route.ts` still exports Auth.js's own `GET`/`POST` handlers — kept
  for future OAuth providers (Google sign-in etc., not requested yet) rather than deleted, since
  `providers: []` doesn't error on its own; only the Credentials+database combination did.

### 0.5.1.2 — `requireAdmin()` and the branch-authorization question this resolves

`prisma/schema.prisma`'s `Membership` model has carried an open comment since Phase 0.5.0: how does
`ADMIN` reach across every branch when its own membership row only anchors to one? Resolved here,
the simplest correct answer: **presence of any `Membership` with `role: ADMIN` grants access to every
branch**, regardless of which branch that row's `branchId` points to. `branchId` on an admin's
membership is bookkeeping (which branch onboarded them), never a restriction.

`src/lib/auth/require-admin.ts`: reads the Auth.js session (`auth()`), loads the user's memberships,
returns the user if any membership has `role: ADMIN`, otherwise `null`. Every admin-only route calls
this first and returns `401`/`403` before touching anything else — same shape as the setup wizard's
own guard-first structure.

> **Superseded 2026-09-30 (§0.5.1.6):** `requireAdmin()` and `require-admin.ts` no longer exist. The
> *rule* above is unchanged and is now `withAuth(handler, { roles: [Role.ADMIN] })`
> (`src/lib/auth/with-auth.ts`, the same guard Octalve Edu uses): any ADMIN membership crosses every
> branch. What changed is the mechanics — the wrapper also enforces CSRF for non-GET methods and
> `no-store`, and reports "not signed in" as `401` but "signed in, not an admin" as `403 FORBIDDEN`
> (this section's guard returned `401` for both).

### 0.5.1.3 — Branch management API

`src/app/api/v1/branches/route.ts`:
- `GET` — admin-only (branches aren't public data; nothing today needs them to be), lists all
  branches.
- `POST` — admin-only. Zod-validated `{ name }`, unique (schema already enforces `Branch.name
  @unique` — a duplicate is a `409`, not a `500`). Writes an `AuditLog` row (`action:
  "BRANCH_CREATED"`) in the same transaction, same pattern as every other sensitive write in this
  codebase so far. CSRF-checked the same way `/api/v1/setup` is (`validateCSRF`) — this route is a
  real mutation, not just gated by "you need a session," since a cross-site request riding a valid
  admin's cookies would otherwise still succeed.

No `PATCH`/`DELETE` in this phase — renaming or removing a branch isn't requested and has real
downstream consequences (`Membership`, and eventually `Student`/`Class`, all reference `branchId`)
that deserve their own design pass, not a same-day addition.

### 0.5.1.4 — How this will be verified

Same standard as every previous phase — actually run, not claimed:
1. `pnpm prisma migrate dev` for Auth.js's `Account`/`Session` tables being actually used for the
   first time (they've existed since Phase 0 but nothing wrote to them until now).
2. `pnpm build` clean.
3. Live: run the setup wizard fresh (creates the first ADMIN), log in via
   `POST /api/auth/callback/credentials` with a cookie jar, confirm `GET /api/v1/branches` returns
   the four seeded branches, `POST /api/v1/branches` creates a fifth, a second `POST` with the same
   name returns `409`, and both routes return `401` with no session cookie at all.
4. Test data truncated afterward, same as every previous phase.

### 0.5.1.5 — Auth realigned to Octalve Edu's design (2026-09-30): what changes and why

**Decision: Octalve Edu's `domain-implementation-plan.md` §0.5.1–0.5.3 is now the canonical auth
design for both projects — not two independently-maintained descriptions that happen to agree.**
This section replaces AlEemaan's own descriptions with pointers, plus the concrete delta between
what's already shipped here and what the canonical design now specifies. It reverses the direction
0.5.1.1 was originally written in: that section is AlEemaan-first, with Octalve Edu's plan following
along ("Octalve Edu's own Phase 0.5.1 plans the identical mechanism... doing it the same way here
avoids redoing it later"). Octalve Edu's plan has since had a full two-AI security review applied to
it (`octalve-edu/docs/auth-review-2026-09-29.md`) that AlEemaan's shipped code has not — so Octalve
Edu's plan is now the more-hardened of the two, and the sensible direction is AlEemaan adopting *its*
fixes, not the reverse.

**What carries over unchanged — the mechanism itself.** Both projects share the identical
justification for hand-rolling login/logout (Auth.js v5's `Credentials`+database-session
incompatibility — AlEemaan discovered this first; Octalve Edu's plan cites AlEemaan's fix by name).
Nothing about *that* decision changes here.

**What AlEemaan explicitly does not adopt from Octalve Edu's design — the tenant-trust-boundary
layer (§0.5.2 there in full: `resolve-tenant.ts`, `forTenant()`, `set_config`/RLS, the `app_user`
database role, the branded `VerifiedTenantId` type).** That entire layer exists because Octalve Edu
holds many schools' data in one database; AlEemaan has exactly one school and nothing to isolate.
Importing RLS/tenant-context machinery here would be real complexity defending against a threat that
structurally cannot occur in a single-tenant schema. `requireAdmin()`'s existing rule (§0.5.1.2 above
— any `ADMIN` membership grants cross-branch access, `branchId` is bookkeeping only) is already the
exact same rule Octalve Edu's plan adopted for its own `campusId` (stated there explicitly, citing
this file) — no change needed on this point, the two are already aligned by construction.

**What AlEemaan's shipped code needs to change to match the canonical design** (written as a to-do
on 2026-09-30, per this project's design-first rule; items 1–4, 6 and 8 were applied later that same
day, and 5 and 7 in §0.5.1.6 — see the update at the end of this section):

1. **Rate limiter**: `getClientIp()` currently trusts client-suppliable `X-Forwarded-For` as-is —
   needs to read only a header the reverse proxy itself sets (`X-Real-IP`, or the Nth-from-the-right
   entry for N trusted hops), never the raw client-controlled header. The check-then-record ordering
   needs to become reserve-then-refund, moved before the first `await` in the login handler — for
   AlEemaan's confirmed single-process deployment this is a pure in-process fix (reorder the existing
   `Map` operations), **no Redis needed**, unlike Octalve Edu's SaaS mode where Redis is the right
   call. Add a hard size cap on the `attempts` Map (unbounded growth from spoofed one-off
   identifiers otherwise). Key on all three layers Octalve Edu's plan now specifies (per-IP,
   per-`ip+email`, per-account with a soft response), not `ip+email` alone.
2. **Session tokens**: hash before storing (`Session.sessionToken` currently stores the plaintext
   cookie value) — `auth()`'s adapter-based lookup needs either a wrapper that hashes the incoming
   cookie before querying, or replacing with a small hand-written `getSession()` (see point 6).
3. **Timing side-channel**: dummy-hash `bcrypt.compare` on every login failure path, including when
   `passwordHash` is null, using a hash generated at boot at the real cost factor — not a malformed
   placeholder.
4. **Cookie**: upgrade from `__Secure-` to `__Host-` in production; derive `secure` from the actual
   configured scheme, not `NODE_ENV`; delete the cookie on logout with the exact same attributes it
   was set with (current bare `cookies.delete(name)` may silently fail against a real
   `__Host-`/`__Secure-` cookie in production — needs an HTTPS end-to-end test, not just the
   dev-mode check this route was originally verified against); add `Cache-Control: no-store` to auth
   responses.
5. **Email**: enforce case-insensitivity at the database level (Postgres `citext` or a `CHECK`
   constraint), not just the existing `toLowerCase()` in the login route's Zod schema.
6. **Password max length**: add a 128-character cap to the login/setup-wizard Zod schemas (72-byte
   bcrypt truncation currently has no guard).
7. **Session lifecycle**: none of this exists yet — rotate-at-login, cap sessions per user,
   `revokeUserSessions()` called on password change, absolute expiry, a purge job, and the
   `createdAt`/`lastUsedAt`/`userAgent` columns an eventual "active devices" page would need. Lower
   priority than 1–6 (no session-revocation UI exists yet to need the columns), but the schema
   columns are cheap to add now rather than retrofitted later.
8. **Auth.js's role** — Octalve Edu's plan now has an open, unresolved question about evaluating
   Better Auth instead of hand-rolling around Auth.js, given Auth.js's confirmed maintenance-mode
   status (see that project's §0.5.1). AlEemaan is further ahead (already shipped) so switching
   frameworks now is a bigger lift than it is for Octalve Edu — not recommended to chase that switch
   here just because it's under discussion there. If Octalve Edu's spike concludes Better Auth is the
   right call, revisit AlEemaan's own Auth.js dependency then, as a deliberate follow-up, not a
   same-week change.

**Update 2026-09-30 (same day):** items 1–4, 6 and 8 above *were* applied — see
`phases/phase-0.5.1.5-auth-rebuild.md` (Auth.js dropped entirely, hashed session tokens, the fixed
limiter, `__Host-` cookies). Items 5 (database-level email case-insensitivity) and 7 (absolute expiry,
purge) were deferred then and are closed in §0.5.1.6 below. (This paragraph replaces the original
closing line, "None of the above is applied to the live code yet", which was true when written and
stale by the end of the day.)

### 0.5.1.6 — Synced to Octalve Edu's built-and-verified implementation (2026-09-30)

Octalve Edu's §0.5.1 is now *built* (branch `claude/auth-0.5.1-port` on
`roji-tech/octalve-edu-fork`, awaiting merge) and verified by a repeatable suite that AlEemaan does
not have. That verification found defects — several of which apply here — and built things beyond what
AlEemaan shipped. This section is the design for closing the gap **so the two repos hold one
implementation of the shared mechanism, with the smallest possible list of documented differences**.
Written before any code, per this document's rule.

**Shared names (identical in both repos, on purpose).** Octalve Edu's plan holds the same table; a
fix or review finding in one maps 1:1 onto the other.

| Concern | Name (both repos) | AlEemaan-specific |
| :--- | :--- | :--- |
| Session helpers | `lib/auth/session.ts` — `createSession`, `getSession`, `getSessionFromRequest`, `deleteSessionByToken`, `revokeUserSessions`, `purgeExpiredSessions`, `setSessionCookie`, `clearSessionCookie`, `SESSION_COOKIE_NAME` | cookie `aleemaan.session-token` / `__Host-aleemaan.session-token` |
| Passwords | `lib/auth/password.ts` (`hashPassword`, `verifyPassword`, `BCRYPT_COST`), `lib/auth/password-policy.ts` (`PASSWORD_MAX_LENGTH`, `PASSWORD_MAX_BYTES`, `passwordByteLength`) | — |
| Rate limiting | `lib/auth/rate-limit.ts` — `reserveAttempt`, `refundAttempt`, `checkRateLimit`, `getClientIp` (all `async`) | in-memory is *sufficient* here (one process, ever) |
| Route guard | `lib/auth/with-auth.ts` — `withAuth(handler, options)` | **replaces `requireAdmin()`**; `roles` is real here (see below) |
| CSRF / envelope / db | `lib/auth/csrf.ts`, `lib/api/envelope.ts` (`ok`, `fail`, `noStore`), `lib/db.ts` | — |
| Routes | `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` | `me` is new here |
| Error codes | `INVALID_CREDENTIALS`, `RATE_LIMITED`, `CSRF`, `INVALID_BODY`, `UNAUTHENTICATED` | adds `FORBIDDEN` (403) |
| Screens | `/login`, `/dashboard`, `/` (router), `/setup`; `components/ui/*`, `components/auth/*` | brand text only |
| Tests | `tests/{setup,unit,integration,api,e2e,https}`, `playwright.config.ts`, `pnpm test` | own ports (3200 / 3201 / 3543), DB `aleemaan_test` |
| Users and invitations (0.5.4 here: **0.5.H**) | `lib/invitations/{token,status,service}.ts`, `lib/members/{service,http}.ts`, `POST /api/v1/invitations/{preview,accept}`, `/accept-invite`, `/users`, `components/users/*`, audit actions `INVITATION_*`, `MEMBER_*` | **divergences:** `/members/[membershipId]` (a membership's id, not a user's); `branchId` where Octalve has `campusId`; no RLS / invitation context; **deactivating a person's last active membership deletes their sessions** (Octalve keeps the session); an ADMIN's branch is shown as "All branches" (ADR 0002) |

Deliberately **not** synced (different concepts, not drift): `Branch`/`Membership` here vs
`Campus`/`TenantMembership` there (no tenant above a branch here), and the cookie's product prefix.

**What changes in AlEemaan, and why** (every item is something Octalve Edu built or found; the
Octalve plan's "Decisions made during implementation" #1–#15 has the full reasoning):

1. **`requireAdmin()` → `withAuth(handler, { roles: [Role.ADMIN] })`.** Same call shape as Octalve
   Edu. The wrapper owns session + CSRF (for every non-GET method — no more per-route
   `validateCSRF()` to forget) + `Cache-Control: no-store` on *every* response it emits. `roles` means
   "the user holds a membership with any of these roles", and because AlEemaan is single-tenant that
   is exactly the existing rule ("any `ADMIN` membership crosses every branch") — the very thing that
   would be a cross-tenant escalation in Octalve Edu is correct here. `permissions` stays typed
   `never` (and throws at module load) **in both repos** until §1.7's permission design is built
   there and here together — nothing consumes it yet, and shipping untested speculative code helps
   neither. *Behaviour change worth naming:* `requireAdmin()` returned `401` both for "not signed in"
   and "signed in but not an admin"; `withAuth` returns `401 UNAUTHENTICATED` for the first and
   `403 FORBIDDEN` for the second (no client depends on the old conflation — there is no UI yet).
   `branches/route.ts` migrates; `require-admin.ts` is deleted.
2. **Two-level session expiry.** New `Session.absoluteExpires` (hard cap, never extended: 90 days;
   **7 days for anyone holding an ADMIN membership**); `Session.expires` becomes a *sliding* idle
   expiry (30 days, at most one write per 5 minutes); `purgeExpiredSessions()`; the cookie lives to
   the absolute expiry. Closes deferred item 7.
3. **`CHECK ("email" = lower("email"))`** on `User`. Closes deferred item 5.
   *Live-data safety:* existing sessions are **kept** (`absoluteExpires` is backfilled from each row's
   existing `expires`, so nobody is signed out and nobody's session is lengthened); emails are
   normalised first and the migration **aborts loudly** if two accounts differ only by case rather than
   silently merging or failing half-way. Verified against a database seeded with legacy-shaped rows.
4. **Limiter parity:** configurable trusted client-IP header (`CLIENT_IP_HEADER`, default `x-real-ip`,
   or the Nth-from-the-right `x-forwarded-for` via `TRUSTED_PROXY_HOPS` — Caddy, the planned proxy,
   appends to `X-Forwarded-For` but does not set `X-Real-IP` unless told to), a warning once in
   production when no header arrives (the per-IP limit would silently become school-wide), true LRU
   eviction, async signatures. **Per-IP login limit 30 (was 5)**; per-`ip+email` stays 5; per-account
   soft 10. A hard 5-per-IP gate lets one person's typos lock out everyone sharing an address — and a
   school's single egress IP is exactly that case.
5. **Password policy, corrected.** Verified empirically that bcrypt silently ignores everything after
   byte 72, so the 128-*character* cap did not protect against truncation. New passwords (setup now;
   change/reset later) are limited to **72 bytes and rejected past it**, never truncated. **Login keeps
   accepting up to 128**: this repo has live accounts whose passwords were set under the old rule, and
   bcrypt truncates identically at verify time — tightening login could lock a real person out.
6. **Auth responses:** `noStore()` on every auth response (login/logout/me and `withAuth`'s own
   refusals); logout's CSRF refusal becomes a proper `fail(… 403 CSRF)` (it was `ok({loggedOut:false},
   {}, 403)` — an *error* status wrapped in a *success* envelope with `error: null`); login's
   schema-invalid path stays enumeration-safe and consumes only the IP budget.
7. **Baseline security headers** (`next.config.ts`): `X-Frame-Options: DENY` + CSP
   `frame-ancestors 'none'` (the setup form is frameable today), `nosniff`, `Referrer-Policy`,
   `poweredByHeader: false`. HSTS is the reverse proxy's job (build-time config vs runtime scheme).
8. **New `GET /api/v1/auth/me`** — session introspection (user + branch memberships), and the route
   that makes `withAuth` testable over HTTP.
9. **Screens.** AlEemaan has *no sign-in screen at all*, and its setup wizard redirects to `/login`,
   which does not exist — the same dead end Octalve Edu had. Ported: `/login`, `/dashboard`, `/` as a
   pure router, the setup wizard retrofitted onto the shared accessible primitives — including the
   findings from Octalve's verification that apply to the wizard as it stands: **a native (no-JS /
   pre-hydration) submit is a `GET`, which would put the administrator's password in the URL**
   (`method="post"` fixes it), no timed auto-redirect (WCAG 2.2.1), 72-byte feedback, ≥ 4.5:1 contrast.
   Brand text is "AlEemaan"; the palette is Octalve's for now — **AlEemaan's own visual identity
   (from its design artifact) is a re-skin of the shared primitives, tracked, not decided here.**
   *(Update 2026-09-30: decided and built — see the Phase 0.5 addenda, §0.5.A.)*
10. **The test suite** (`pnpm test`): unit, integration, API, browser (desktop + phone, axe WCAG 2.2),
    and the real-HTTPS `__Host-` cookie run (auth-review P0 #4 — verified for Octalve Edu, *never
    verified here* until now). Every security assertion is mutation-checked, as in Octalve Edu; the
    port itself is attacked too (including the sync→async hazard: `if (!reserveAttempt(k))` without
    `await` is `!Promise`, always false, and would silently disable a limit). Because item 9 ports
    the real sign-in screens, the HTTPS run drives them exactly as Octalve Edu's does — Chromium's own
    cookie rules decide whether the `__Host-` cookie sticks and whether logout removes it.

**Deferred, unchanged:** TOTP MFA (needs the Settings UI), password reset, active-devices page,
breached-password check, a nonce-based script CSP *(MFA, reset and the CSP are now designed as §0.5.B–D
below)*. **Not applicable here:** Redis-backed limiter (single process), everything in Octalve Edu's §0.5.2
(RLS / tenant trust boundary).

---

## Phase 0.5 addenda (2026-09-30, after the auth sync)

Four pieces of work between "auth works" and "Phase 1 can start", designed here first and built in
**both** repos (Octalve Edu's plan has the same sections, in the same order): **A** the shared UI design
language, **B** a nonce-based script CSP, **C** password reset and change, **D** TOTP MFA. They are
lettered rather than numbered because §0.5.2 / §0.5.3 already mean different things in each repo.
This closes the "deferred, unchanged" list above.

### 0.5.A — Shared UI design language, and AlEemaan's own look (from the design artifact)

Source: the private design canvas "Octalve Edu & AlEemaan — UI Design"
(`https://claude.ai/artifact/8wGBA2trirEDaTQq1sUf74`) — *"Admin app — same shell, one brand tweak"* and
*"Public marketing sites — bespoke per brand"*. This section covers the admin app; the marketing sites
are Phase 5. 0.5.1.6 shipped AlEemaan's new screens in Octalve Edu's palette as a stand-in and said the
re-skin was "tracked, not decided"; **decided now: do it**, together with the shell the artifact draws,
because the screens have somewhere real to live (branches).

**What the artifact fixes for AlEemaan.** Sea green — `#2E8B57`, deep `#0b3d24`, light `#6ee7b7`, tint
`#052e22` — on the shared dark-by-default theme (`#020617` canvas / `#0f172a` surface / `#1e293b` line /
`#f8fafc` text) with a light theme toggle (`#f8fafc` / `#ffffff` / `#e2e8f0` / `#0f172a`). Login: a 46 %
brand panel in the deep green with a faint pattern, headline **"One school, four branches, one
login."**, blurb *"Secondary & Primary, English & Arabic — every branch's records in one place."*, three
check-mark points, and the form on the right. Admin shell: a 248 px sidebar (brand mark; **Overview,
Branches, Settings, Users — "soon"**; user card), a 60 px top bar (breadcrumb `Admin / Branches`, theme
toggle, profile menu with *Profile / Settings / Sign out*), and on phones a floating **bottom tab bar**
(*Overview, Branches, Settings, More*) whose *More* sheet holds *Users* and *Sign out* — no hamburger
drawer. The Branches page: title + one-line subtitle, a **New branch** button opening an inline
*Branch name* form (*Create / Cancel*), and a list of branches each showing a member count.

**Mechanism** — identical to Octalve Edu's, so the shared components stay code-identical and **only
`app/brand.css` and `lib/brand.ts` differ**:
1. *Semantic tokens, not palette classes* (`bg-canvas`, `bg-surface`, `text-fg`, `text-fg-muted`,
   `border-line`, `bg-brand`, `text-brand-fg`, status sets …) defined once for both themes in
   `globals.css` and exposed via Tailwind's `@theme inline`; no component names a colour.
2. *Per-repo brand*: `brand.css` (green tokens) and `brand.ts` (name "AlEemaan", the headline/blurb/points
   above, tagline "Secondary & Primary • English & Arabic", `place` = branch/branches).
3. *Theme without an inline script*: a `theme` cookie read by the root layout, rendering
   `<html data-theme>` — correct on first paint, and nothing for the nonce-based CSP (0.5.B) to forbid.

**Deliberate deviations from the artifact** (each checked numerically, and the same reasons as in Octalve
Edu's plan):
- **Filled buttons are `#2A7F4F`**, not `#2E8B57`: white on `#2E8B57` is **4.25 : 1**, under WCAG AA's
  4.5 : 1 for 14 px text; `#2A7F4F` is 4.94 : 1 (hover `#267349`, 5.78 : 1). `#2E8B57` stays for the
  logo mark and non-text accents.
- **Muted text `#94a3b8` (dark) / `#5b6b82` (light)**, not `#64748b` (3.75 : 1 on the dark surface).
- **Dead controls omitted**: the top-bar search box and the notification bell with its hard-coded "3"
  badge have nothing behind them. *Settings* and *Users* render as **"soon"** (visibly disabled, not
  links) until Phase 0.5.2 / 1.7 build them; the profile menu's *Settings* is the same disabled entry, and
  *Profile* leads to an account page that later hosts change-password and MFA (0.5.C / 0.5.D).
- **"Keep me signed in on this device" is real** (exact semantics in Octalve Edu's plan §0.5.A, and the
  same here): unchecked → browser-session cookie + 12-hour absolute server cap; checked → the existing
  30-day idle / 90-day absolute (7-day for admins) policy. *Behaviour change for this live school:* the
  default becomes shorter than before, deliberately — a teacher on a shared staff-room computer should
  not stay signed in for a month by accident; ticking the box restores today's behaviour.
- "First time on this instance? Run the setup wizard" is omitted (the wizard disables itself and
  `/login` already redirects to it while it is needed). The artifact's Geist-less system font stack is
  the canvas tool's default, not a brand decision — Geist stays. Arabic/RTL is out of scope until the
  school asks for it.

**Pages built with the shell.**
- `/dashboard` (Overview): who is signed in, and **real** figures — the number of branches, and members per
  branch — from the database. No fabricated numbers, no placeholder charts.
- `/branches`: the list with live member counts, and *New branch* wired to the existing, tested
  `POST /api/v1/branches` (name validation, uniqueness and CSRF are already enforced there); the page
  refreshes and focuses the new row. Empty state included.
- *Settings* / *Users*: "soon", per above.

**Responsive shell behaviour.** ≥ 1024 px: sidebar + top bar. Below: the bottom tab bar (each tab ≥ 44 px
tall, `aria-current="page"` on the active one, the bar never covers page content — the page reserves its
height) and the *More* sheet, built on the native `<dialog>` (focus trap, `Esc`, and focus return come
from the platform rather than hand-rolled code). Skip-to-content link first in the tab order. The
profile menu is a real disclosure (button + `aria-expanded`), closes on `Esc` / outside click, and its
items are ordinary links/buttons.

**Verification.** axe-core WCAG 2.2 AA on every screen and state **in both themes**; theme persistence
across reloads (cookie, no flash); toggle keyboard/aria; tab bar and More sheet behaviour (open, `Esc`,
focus return); create-branch flow end to end (form → API → refreshed list, and the failure paths);
brand-specific colour assertions (primary button is `rgb(42, 127, 79)`); no horizontal scroll from 320 px
up; and screenshots of the real flow at desktop and phone sizes, read by a human.

**As built (2026-09-30)** — record: `phases/phase-0.5.A-design-language.md`. Refinements and departures:
`requirePageSession()` is the page guard and every page calls it (a layout isn't re-run on client-side
navigation — pinned by a test and a mutation); the profile menu is a disclosure, not an ARIA menu, and does
not close on a `relatedTarget`-less blur (Safari); the More sheet is a native modal `<dialog>`; a
non-administrator's `/branches` is a "no access" page that fetches no branch data; remember-me is exactly as
in Octalve Edu's §0.5.A (default false at both layers). **Lesson:** a wholesale copy of a "shared" file
carried Octalve's cookie name here — product-specific constants are not shared, and a normalised diff hides
them; read the raw diff after a port.

#### 0.5.B — Nonce-based script CSP (designed 2026-09-30, before any code)

**Why.** The baseline headers (0.5.1) stop framing, sniffing and referrer leaks but say nothing about *script*:
if an XSS bug ever ships, injected inline script runs with the session. A strict CSP makes that class of bug
inert — the browser refuses any script that doesn't carry this response's secret nonce. Same design in both
repos (Octalve Edu's plan has the identical section); both are already prepared for it (no inline `<script>`, theme via cookie, every page dynamic).

**Mechanism** (Next.js 16: `proxy.ts`, the renamed middleware).
1. A `proxy.ts` runs on every request except static assets (`/_next/static`, `/_next/image`, `favicon.ico`),
   mints a **128-bit random nonce** (`crypto.getRandomValues`, base64), builds the policy, and sets it on
   the **request** headers (so Next applies the nonce to its own bootstrap scripts) and on the **response**.
   Prefetch requests are skipped, as Next's guide does.
2. Policy (production):
   `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'nonce-<n>';
   img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self';
   form-action 'self'; frame-ancestors 'none'` — and `upgrade-insecure-requests` **only when `APP_URL` is
   https** (on a plain-HTTP LAN install it would break every request). `'strict-dynamic'` lets the nonced
   bootstrap load Next's chunks without a host allow-list. **No `'unsafe-inline'`, no `'unsafe-eval'`** in
   `script-src`; development alone adds `'unsafe-eval'` (React's dev tooling needs it).
3. `frame-ancestors 'none'` moves from `next.config.ts` into the proxy so the policy has a single source;
   `X-Frame-Options`, `nosniff`, `Referrer-Policy` stay where they are. HSTS stays the reverse proxy's job.
4. **Rollout valve for a live school:** `CSP_REPORT_ONLY=true` sends the same policy as
   `Content-Security-Policy-Report-Only` (violations show in the browser console, nothing is blocked). The
   default is enforcing; the flag exists so an unforeseen violation in production can be diagnosed without
   an outage. There is deliberately **no report-collection endpoint** (extra unauthenticated surface).
5. **Styles.** Start strict (`style-src 'self' 'nonce-<n>'`, and no `style=""` attributes in our own markup —
   audited by grep and by the zero-violation test below). If Next's own output turns out to need inline style
   *attributes*, the fallback is `style-src-attr 'unsafe-inline'` alone (an attribute can't execute script) —
   recorded in the as-built note with the reason, never a blanket `'unsafe-inline'` on `style-src`.

**Verification.**
- *Shape:* every page and API response carries the policy; the directive set is exactly the above; the nonce
  is 128-bit base64, **different on every request**, present in the header and on every inline `<script>` in
  the HTML (and every inline script *has* it); no `unsafe-inline`/`unsafe-eval` in `script-src`;
  `upgrade-insecure-requests` present on the https deployment and absent on http; `frame-ancestors 'none'`
  survives; `CSP_REPORT_ONLY` flips the header name and nothing else.
- *It actually blocks:* in real Chromium, an injected inline `<script>` and an injected `onclick=` attribute
  do **not** run and raise a `securitypolicyviolation`; the page's own scripts do.
- *Zero violations everywhere:* the shared `page` fixture records `securitypolicyviolation` events and fails
  **any** test in which one occurred — so every existing flow (sign-in, setup, theme toggle, shell, …) is a
  CSP test for free, in both themes and on the https deployment.
- *Mutations (each must go red):* nonce dropped from the policy; `'unsafe-inline'` added; a constant nonce;
  nonce not forwarded on the request headers (Next's own scripts blocked); `upgrade-insecure-requests`
  unconditional; the https-only rule inverted.

**Not in scope:** a CSP report endpoint, Trusted Types, SRI (no third-party scripts exist), and the public
marketing sites (Phase 5 decides their own policy).

**As built (2026-09-30/10-01)** — record: `phases/phase-0.5.B-csp.md`. `src/proxy.ts` mints the nonce and sets
the policy on request and response; `lib/security/csp.ts` builds it (pure, unit-tested). Where the build refined
the design: **(1)** the proxy's matcher excludes `/api` (Next's own guidance), so JSON responses get a *static*
`default-src 'none'; frame-ancestors 'none'` from `next.config.ts` instead — same effect, no per-request work;
static assets carry neither. **(2)** The strict style policy worked first time: Next emits no inline `<style>` and
no `style=""` attributes, so `style-src 'self' 'nonce-…'` needed no fallback. **(3)** Nothing reads an `x-nonce`
header, so none is set. **(4) A property worth knowing:** `'strict-dynamic'` trusts script *created by* trusted
script, and DevTools-evaluated code is exempt — so the protection is against **markup injection** (a
parser-inserted `<script>`, `onerror=`, `javascript:` link, injected `<base>`), which is what an XSS bug is; the
first draft of the injection tests used `page.evaluate(createElement("script"))`, the "attack" ran, and the test
was rewritten to splice the payload into the real server response instead. **(5) The auto-fixture works:** the
whole browser suite (≈250 tests, both themes, desktop and phone, https) passes with **zero** policy violations —
every flow is a CSP test.

#### 0.5.C — Password reset and change (designed 2026-09-30, before any code)

**Scope.** Forgotten-password recovery by email, and change-password for a signed-in person. Built in both
repos, same design. Nothing here can weaken 0.5.1: no new way to obtain a session, and every path that sets a
password uses the one 72-byte policy.

**Email transport** (`lib/email/`): one interface, three implementations chosen by `EMAIL_TRANSPORT` —
`resend` (uses `RESEND_API_KEY`, already in `.env.example`; `EMAIL_FROM` names the sender), `console` (prints the
message, link included, to the server log — development), and `file` (appends JSON lines to a path — what the
tests read as "the inbox"). Default: `resend` when a key is set, otherwise `console` **with a loud
production warning**. A send failure is logged, never shown to the requester (it would be an oracle).
Messages are plain text (accessible, nothing to track), branded from `lib/brand.ts`.

**Tokens.** 256-bit random, URL-safe; only the **SHA-256 hash** is stored (`PasswordResetToken`: `id`,
`userId` cascade, `tokenHash` unique, `createdAt`, `expiresAt` = 30 minutes, `usedAt`). One live token per
person: requesting a new one deletes the previous unused ones. Expired rows are removed on the next request
for that person and by the same purge that clears sessions (bounded growth). Additive migration only.

**Flow.**
1. `POST /api/v1/auth/forgot-password` `{ email }` — CSRF; rate-limited **per IP and per email, counting every
   request** (each can send mail — unlike login, success is not refunded); answers **200 with the same body
   whether or not the account exists**. To leave no timing oracle the lookup, token insert and email send run
   in Next's `after()` — the response is sent first, so its time doesn't depend on the account.
2. The email links to `/reset-password#token=…`. The token is in the **URL fragment**: never sent to the
   server, so it isn't in access logs or a `Referer`. The page (client) reads it, **removes it from the
   address bar** (`history.replaceState`), and asks for the new password (live policy feedback, as in setup).
3. `POST /api/v1/auth/reset-password` `{ token, password }` — CSRF; per-IP limit on failures; policy check;
   then **one transaction**: an `updateMany where usedAt is null and expiresAt > now` on the token's hash
   (count must be 1 — so the token is single-use even under concurrent requests), set the new hash, delete
   **every session** of that user (`revokeUserSessions`), delete their other reset tokens, write an audit row.
   Any invalid / expired / already-used token gets the same 400 message ("This link is invalid or has expired").
   Success does **not** sign the person in — they sign in with the new password (and, once 0.5.D exists,
   their second factor: a reset never bypasses or disables MFA). A "your password was changed" notice is emailed.
4. **Change password** — `POST /api/v1/auth/change-password` behind `withAuth`: `{ currentPassword,
   newPassword }`; the current password is verified in constant time and its failures are rate-limited per
   account; the new one must pass the policy and differ from the old; then the hash is replaced, **every
   other session is revoked (this one kept)**, an audit row is written and the notice emailed. UI: a
   "Password" card on the account page. The sign-in screen's "Forgot password?" link (drawn in the artifact,
   deliberately absent until now) appears with `/forgot-password`.

**Shared code.** The password rules currently inline in the setup route move to `lib/auth/password-policy.ts`
(`checkNewPassword`) so setup, reset and change cannot drift; screens use the shared `AuthShell` and
components, in both themes.

**Verification.** Unit: token generation/hash, policy. Integration: create/consume — only the hash stored,
expiry, single use, **20 concurrent consumes → exactly one wins**, sessions revoked, other tokens dropped. API:
identical response and status for known/unknown emails, the mail sent only for a known one (read from the
`file` transport), every rate limit, CSRF, the reset outcomes (success, bad/expired/used/replayed token, weak
or over-72-byte password with the reason), old password stops working and the new one works, change-password's
wrong-current / same-password / other-sessions-revoked-this-one-kept, statistical timing parity of
`forgot-password`. Browser: the whole journey (forgot → "inbox" → link → new password → sign in), the token
gone from the address bar, keyboard use, axe in both themes for the three new screens and their error states,
phone tap targets. **Mutations (each must go red):** store the raw token; drop the single-use condition; drop
the expiry check; don't revoke sessions; respond differently for unknown emails; drop each rate limit; put the
token in the query string; let change-password skip the current-password check.

**Not in scope:** SMS or security-question recovery (weaker than email), admin-initiated resets (with
Users/Settings), breached-password checking, and "active devices" (needs its own page).

**As built (2026-10-04)** — record: `phases/phase-0.5.C-password-reset.md`. As designed, with these refinements:
the password rule now lives in one function, `checkNewPassword()` (client-safe; setup, reset, change and the
live form feedback all call it); the limiter's window is its fixed 5 minutes, so limits are *per 5 minutes*
(forgot: 10 per IP, 3 per address; reset: 10 failures per IP, successes and typos refunded; change: 5 wrong
current passwords per account); the new `lib/email/` is plain `fetch` to Resend (no SDK dependency) with
`console` and `file` transports; `sendEmailQuietly()` never throws, because a send failure shown to the
requester would be an oracle; the notice and audit work runs in `after()` too; a reset also clears the browser's
session cookie. The never-used Auth.js `VerificationToken` table was dropped in the migration (replaced by
`PasswordResetToken`). The sign-in screen's "Forgot password?" link — drawn in the artifact — is now real.
Octalve Edu has no app shell until §0.5.2, so its Account page (profile + Password card) is a plain page
with an "Account" link in the header; AlEemaan's lives in the shell. Audit: Octalve Edu writes one row per
school the person belongs to; AlEemaan one row.

#### 0.5.D — TOTP two-step verification (designed 2026-09-30, before any code)

**Scope.** Optional per person for now: enrol an authenticator app, be challenged at sign-in, use recovery
codes, disable. (Requiring it for administrators, and step-up re-verification before sensitive Settings edits,
are policy layers that build on this and arrive with the Settings work.) Same design in both repos. Nothing
in `withAuth` changes — the second factor is enforced **at sign-in**, so a request either carries a full
session or none.

**The algorithm is implemented here, not imported:** RFC 6238 TOTP over HMAC-SHA1 (`node:crypto`), 6 digits,
30 s step, accepting the current step ±1 for clock drift, constant-time comparison, base32 (RFC 4648) secrets
of 160 bits — checked against the RFC's own published test vectors. (Security code is worth the ~60 lines to
own; the QR image is not — see below.)

**Storage.**
- `MfaCredential { userId (unique, cascade), secretEnc, confirmedAt?, lastUsedStep?, createdAt }`. The secret
  must be recoverable (unlike a password), so it is **AES-256-GCM encrypted at rest** with `MFA_ENCRYPTION_KEY`
  (32 bytes, base64) — a database leak alone yields no usable secrets. Enrolment **fails closed (503)** in
  production when the key is missing. An unconfirmed credential is not an active factor.
- `MfaRecoveryCode { userId, codeHash, usedAt }` — ten single-use codes (`xxxxx-xxxxx`, 50 random bits each
  from an unambiguous alphabet), stored as SHA-256 hashes, shown **once** at generation.
- `MfaChallenge { tokenHash, userId, remember, expiresAt, attempts }` — the *pending-MFA state* promised since
  §0.5.1. It is **not a session**: no cookie, invisible to `withAuth`. A 256-bit random token is returned in the
  JSON of sign-in step 1 (held in memory by the sign-in page only), stored hashed, valid 5 minutes, five
  attempts, single-use.

**Sign-in.** Step 1 (`POST /api/v1/auth/login`) is unchanged up to "password verified"; for a person with a
confirmed credential it then creates **no session** and returns `{ mfaRequired: true, challenge }` (the same
generic 401 as ever for a wrong password — MFA status is only revealed after the password is proven). Step 2
(`POST /api/v1/auth/login/mfa` `{ challenge, code }` or `{ challenge, recoveryCode }`): CSRF, rate limits (per
IP, per account, per challenge), verify, then — and only then — the shared "complete sign-in" routine used by
both steps rotates any presented session and creates the session **with the `remember` choice made in step 1**
(carried in the challenge; see 0.5.A), setting the cookie. **Replay protection:** a code for a step ≤
`lastUsedStep` is refused, and the step is recorded with a conditional `updateMany` so two simultaneous
submissions of the same code can't both win.

**Enrolment** (account page, "Two-step verification" card; every action needs a fresh password, and none needs
a second factor until one exists): `POST …/mfa/enroll` `{ password }` → generates and stores an unconfirmed
secret and returns the `otpauth://` URL plus the base32 key for manual entry; the page renders a **QR code
in the browser** (the `qrcode` package, dynamically imported, pinned — **never an online QR service; the secret
never leaves the device**) beside the manual key; `POST …/mfa/confirm` `{ code }` marks it confirmed, issues the
recovery codes, revokes the person's *other* sessions and emails a notice. `POST …/mfa/disable` `{ password,
code | recoveryCode }` removes everything, revokes other sessions, emails a notice. `POST …/mfa/recovery-codes`
`{ code }` replaces all recovery codes. The UI warns when two or fewer remain.

**Interplay.** Password reset (0.5.C) never touches MFA — after a reset the person still needs their second
factor. A person who has lost both authenticator and recovery codes is recovered by an operator: `pnpm
mfa:reset -- <email>` (a small, tested script; an admin UI comes with Users), which also writes an audit row.

**Screens.** Step 2 appears in place on the sign-in card: a numeric, `autocomplete="one-time-code"` field, a
"Use a recovery code instead" toggle, "Back", the same error/pause treatment as step 1. Enrolment and
management states on the account page. All in both themes, ≥ 44 px targets.

**Verification.** Unit: the RFC 6238 vectors, base32, ±1 window edges, encryption round-trip and tamper
detection (GCM auth failure), recovery-code format. Integration: challenge lifecycle (expiry, five attempts
then dead, single use, **no session exists until step 2 succeeds**), replay under concurrency, recovery-code
single use, disable. API: the two-step sign-in end to end (no `Set-Cookie` after step 1; wrong / reused / stale
codes; lock-out; `remember` honoured through the challenge; MFA users can't sidestep by presenting an old
cookie), enrol/confirm/disable/regenerate and their re-auth requirements, 503 without the key. Browser: enrol
with a code computed by the test, sign in with it, sign in with a recovery code, disable; axe in both themes
for every new state; keyboard use. **Mutations (each must go red):** accept ± several steps; skip the replay
check; store the secret in plaintext; create the session at step 1; let a challenge be reused or attempted
without limit; let a recovery code be reused; disable without the password; let password reset clear MFA; drop
the per-IP limit on step 2.

**Not in scope:** WebAuthn/passkeys and SMS codes (a later, separate design), trusted-device "remember for 30
days" (it would quietly weaken the factor), mandatory-MFA policy and step-up (Settings work), an active-devices
page.

**As built (2026-10-05)** — record: `phases/phase-0.5.D-totp-mfa.md`. As designed, with these refinements:
- **No key, no MFA — in every environment, not only production.** `MFA_ENCRYPTION_KEY` (32 bytes, base64) is
  required; without a valid one the account page says two-step verification isn't available, enrolment answers
  503 `MFA_UNAVAILABLE`, and sign-in step 2 answers the same *before* spending anything. There is deliberately
  no development fallback key — a baked-in default is the kind of thing that ships to production by accident.
- **Recovery codes are stored as keyed hashes (HMAC-SHA256), not plain SHA-256.** A code has 50 bits, so a
  stolen table of plain hashes could be ground through offline; the key lives in the environment, not the
  database. Both the AES key and the HMAC key are *derived* from the root key with HKDF (one root secret is never
  used raw for two purposes). The AES-GCM box carries the owner's user id as AAD, so a ciphertext copied onto
  another person's row fails to decrypt. Recovery codes are Crockford base32 (`XXXXX-XXXXX`, exactly 50 random
  bits); typing `o`/`i`/`l` still works.
- **The challenge spends an attempt *before* the code is checked**, atomically (a conditional increment), so
  twenty simultaneous guesses on one challenge get five checks, not twenty; a person holds at most five live
  challenges; and a password **reset or change deletes pending challenges** (a challenge is proof of the old
  password). A reset still never touches the second factor itself.
- **Limits on step 2:** per challenge 5 attempts; per **account 10 failures / 5 minutes across all challenges**
  (hard — the real bound for someone who knows the password and can mint challenges at will); per IP 30. A
  correct code is refunded; a malformed one (not 6 digits / not a recovery code) is a typo and is refunded too.
- **Confirming records the step it used**, so the very code that turned two-step verification on can't also sign
  in — the next code can (an authenticator shows it within 30 s). Confirming and turning off both sign the person
  out of their *other* devices and send a notice; so does a recovery-code sign-in and a recovery-code
  regeneration. Audit actions: `MFA_ENABLED`, `MFA_DISABLED`, `MFA_RECOVERY_CODE_USED`,
  `MFA_RECOVERY_CODES_REPLACED`, `MFA_RESET`.
- **One `completeSignIn()` creates every session from a sign-in** (rotate a presented session, admin cap,
  `remember`); step 1 and step 2 both call it. The browser-safe half of the code rules (`lib/auth/mfa/codes.ts`)
  has no `node:crypto`, so the screens check a code's *shape* with the same function the server uses.
- **The QR code is drawn in the browser** by the pinned `qrcode` package (dynamic import, `data:` PNG, always
  dark-on-white in both themes); the tests decode it with `jsqr` and check it encodes the key shown beside it.
  The secret is held in component state only — never storage, URL or cookie.
- **Operator recovery:** `pnpm mfa:reset -- <email>` (`scripts/mfa-reset.mjs`, plain Node + Prisma, tested as a
  child process) removes the factor, signs the person out everywhere and audits it.
- Small fix on the way: the signed-in header's "Sign out" button wrapped onto two lines on narrow phones; it is
  now icon-only below `sm` (the accessible name is unchanged).

#### 0.5.E — Account lifecycle extras (planned 2026-10-04; self-service half BUILT 2026-10-05 — invite/activate and deactivation wait for the Users pages)

Prompted by the question "what else would a Django/Djoser-style auth give us?". Mapping and decisions:
- **Built or designed already:** login/logout/current-user (0.5.1), password reset and change (0.5.C), two-step
  verification (0.5.D). **Deliberately not used:** token/JWT endpoints (revocable database sessions are a design
  decision), social login.
- **Invite & activate** (Djoser's activation flow, adapted): schools invite people; the email carries a
  single-use, hashed, short-lived link built on exactly the 0.5.C token machinery to set a first password.
  Arrives with the Users pages (self-signup for Octalve Edu's SaaS mode is a later, separate design).
- **Change email with confirmation:** the new address must prove it is reachable (a link to the NEW address),
  the old address is told, other sessions are revoked; reuses the token table with a `purpose` column.
- **Edit profile** (name) — trivial once the above exist; audited.
- **Active devices:** list sessions (user agent, last used — the columns already exist), revoke one or all
  others. Needs its own page.
- **Account deletion:** for a school this is an administrator *deactivation* (history must survive), not
  self-service; designed with the Users pages.

**Design for the self-service half (2026-10-05, written before any code).** Built now: *edit profile*, *change email
with confirmation* and *active devices*. **Deferred, deliberately:** *invite & activate* and *deactivation* — both are
administrator actions on other people and belong with the Users pages (they need a way to say who may invite whom,
which is §0.5.2's tenant-scoped roles). Same design in both repos.
- **Edit profile.** `PATCH /api/v1/account/profile { name }` behind `withAuth`: trimmed, inner whitespace collapsed,
  1–100 characters, no control characters; 10 changes per account per 5 minutes; audit `PROFILE_UPDATED` with
  before/after. The Profile card gets an Edit → Save/Cancel; the header and shell show the new name on refresh.
- **Active devices.** `GET /api/v1/auth/sessions` (this person's unexpired sessions: when created, last used, a short
  device description parsed from the stored user agent, `current`, and whether it was "kept signed in"), `POST
  …/sessions/revoke { sessionId }` (only the caller's own; the current one is refused — that is sign-out; a session
  that isn't theirs answers exactly like one that doesn't exist) and `POST …/sessions/revoke-others`. Rows are
  fetched by the page after it loads (so relative times use the viewer's clock and zone — no hydration mismatch). A
  revoked device finds out on its next request (the existing session revalidation sends it to sign-in). **No IP
  address is stored or shown** — no column exists and none is added for this (it is personal data; "last used 5
  minutes ago on Chrome / Windows" is enough to spot a stranger). Audit `SESSION_REVOKED` / `SESSIONS_REVOKED`.
- **Change email with confirmation.** `POST /api/v1/auth/email-change/request { newEmail, password }`: the current
  password is re-verified (5 wrong per account per 5 minutes, refunded on success), then — *whatever the address* —
  the answer is the same generic "we've sent a link to the new address" (an authenticated user must not be able to
  probe which addresses have accounts). If the address is free, a **single-use, hashed, 1-hour link in the URL
  fragment** goes to the NEW address and a notice (masked new address) to the OLD one; if it is already in use, that
  address gets a different notice ("someone asked to use this address; you already have an account here") and no
  link. Limits: per account and per target address, so it can't be used to mail-bomb. One live request per person.
  `POST …/email-change/confirm { token }` (public — the link is opened from a mail client, signed in or not):
  claims the token with a conditional update and, **in one transaction**, sets the new email (lower-cased,
  `emailVerified` now), deletes **every session** of the person, their pending password-reset links, MFA
  challenges and other email-change requests (the email is the recovery channel — nothing issued for the old one
  survives it); if the address was taken in the meantime the unique index refuses it and the answer is the same
  generic "link can't be used". The OLD address is told it happened; audit `EMAIL_CHANGE_REQUESTED` /
  `EMAIL_CHANGED` (before/after). New page `/confirm-email` (token read from the fragment and scrubbed,
  `referrer: no-referrer`, like `/reset-password`).
  *Deviation from the first sketch:* a **separate `EmailChangeToken` table** (it must carry the new address)
  rather than a `purpose` column on `PasswordResetToken`; same hash-only / single-use / conditional-claim machinery.
- **Tests (before the code).** unit: user-agent description, address masking. integration: the token lifecycle
  (hash at rest, 1 hour, one live per person, **20 simultaneous confirms → exactly one**, single use, expiry), the
  confirm transaction (email changed, all sessions / reset links / challenges / other requests gone, address taken
  meanwhile → refused and nothing changed), sessions listing/revoking scoped to the owner. api: every route's auth,
  CSRF and limits; generic answers for free / taken / own / malformed addresses (**identical bodies**); the right
  mail to the right inbox (new: link; old: notice; taken: notice, no link); the old address can no longer sign in
  and the new one can; revoking another person's session id answers like an unknown one. e2e: edit name; the whole
  email change (request → "inbox" → link → signed out → sign in with the new address); two devices, revoke one and
  watch it get signed out; revoke all others; axe in both themes on every state, phone tap targets.
  Mutations: link not single-use / not expiring / not hashed; sessions kept after the change; reset links kept;
  password not re-checked; the taken-address answer differing; notice to the old address missing; revoking someone
  else's session; revoking the current session; listing expired sessions; no limits; the IP-free promise (no new
  column).


**As built — self-service half (2026-10-05).** Built as designed, in both repos, with the deviations and findings below
(each was found by a test or a screenshot, not by inspection). Record: `phases/phase-0.5.E-account-self-service.md`.
- **What exists.** Migration `20261006090000_email_change_tokens` (one new table, purely additive). `lib/auth/`:
  `email-change.ts` (token + the confirm transaction), `session-devices.ts` (list / revoke one / revoke others),
  `profile-policy.ts` (`checkName` — the one name rule, client-safe), `user-agent.ts` (`describeUserAgent` — "Chrome on
  Windows" from a fixed list of patterns, only ever rendered as text), `mask-email.ts` (`a***@school.example` for the
  notices). Routes: `PATCH /api/v1/account/profile`, `GET /api/v1/auth/sessions`, `POST …/sessions/revoke`,
  `POST …/sessions/revoke-others`, `POST …/email-change/request`, `POST …/email-change/confirm`. UI: the account page now
  has **Profile** (name editable in place), **Email address**, Password, Two-step verification and **Active sessions**
  cards; a new public page `/confirm-email`. Four emails: the link (to the new address), a "change requested" notice and a
  "changed" notice (both to the old address, new address masked), and a "someone tried to use your address" notice (to an
  address that already has an account).
- **The confirm page never acts on arrival.** The link opens a page that says what will happen and waits for a click:
  mail clients and security scanners open links (some run scripts) to preview them, and a page that spent the
  single-use token on load would be consumed before the person saw it. (Tested: no request is made until the button is
  pressed.) Like `/reset-password`, the token comes from the URL fragment, is removed from the address bar at once, and
  the page sends `referrer: no-referrer`.
- **Deviation 1 — where the per-account request limit sits.** The design said "limits per account and per target
  address". Written first, the account limit (3) was spent *before* the password was checked, so three typos locked the
  person out and the 5-wrong-passwords limit could never trigger. Now: the password limit (5, refunded for anything but a
  wrong password) comes first; the request limit (3 per 5 minutes) is counted only for a *verified* request, so it bounds
  the mail one signed-in person can cause without being spent by guesses. Found while writing the API tests.
- **Deviation 2 — the password field is labelled "Your password"**, not "Current password": the Password card on the same
  page already has a field with that label, and two identically-labelled fields on one page confuse screen-reader users
  and password managers. Found by a strict-mode locator clash in the first browser test.
- **Finding — a second link in the same tab was ignored** (here and, since 0.5.C, on `/reset-password`): pasting a
  link whose URL differs only in the `#fragment` is a same-document navigation, so the page kept the first link's state
  (including "done"). The fragment reading is now one hook, `components/auth/useFragmentToken.ts`, that also listens
  for `hashchange` and returns a `version`; both pages key their state on it, so every link starts clean (even the same
  link opened again). Tested on both pages.
- **Finding — focus after an awaited save.** Returning focus with a 0 ms timer loses to React's commit after an `await`
  (it worked on Cancel, a click handler, and failed on Save). Focus now moves in an effect that runs after the commit;
  the email panel does the same when it returns to its first state.
- **Notes.** "Active" times are approximate — `lastUsedAt` is only written when it is more than 5 minutes stale
  (existing behaviour, `TOUCH_INTERVAL_MS`). The change-email notice goes to the old address *before* the audit and the
  token (all in `after()`), so a failure later still tells the person. This repo's audit writes one row per event (no tenant column — a divergence kept on purpose since 0.5.C); Octalve Edu writes one per school. `withAuth` routes answer
  `Cache-Control: private, no-store`, the public confirm route `no-store` (the tests assert both exactly).
- **Not done, deliberately:** *invite & activate* and administrator *deactivation* (they act on other people and need the
  Users pages / tenant-scoped roles of §0.5.2); a "new sign-in from an unrecognised device" notice; showing a device's IP
  or location (none is stored); an administrator changing someone else's email; self-service account deletion (a school
  deactivates, history must survive).
- **Verification.** `pnpm test`: 833 passed, 18 skipped by design, 0 failed (it was 715); `tsc`, ESLint and `next build` clean; a 25-bug subset of Octalve Edu's 78 re-run here, all caught. Differences from Octalve Edu: one audit row per event (no tenant column), the account page is inside the app shell, the post-rename check is on the shell's account menu. Details in the phase record.

---

#### 0.5.F — Dev tooling: a dev email inbox now, a mock Paystack with Finance (planned 2026-10-05; inbox half BUILT 2026-10-05 — the Paystack half waits for Finance)

**Source.** The maintainer's guide *"Development Email System & Dual-Mode Paystack Integration"* (a pattern already
used locally and on a staging deploy of another project). It has two halves: (1) an in-app **dev email inbox** —
when no real mail key is set, outgoing mail is captured in a 50-message ring buffer bound to `globalThis` (so HMR
doesn't wipe it) and shown in a floating widget; (2) a **dual-mode Paystack engine** — a `PaymentTransaction` table, a
REST client (Naira ↔ kobo only at the HTTP boundary, HMAC-SHA512 over the *raw* body with `timingSafeEqual`), a
**mock checkout** that fires genuinely signed webhooks at our own handler (no tunnels, no test cards), and one atomic
`fulfillPayment(reference)` — `updateMany({ where: { reference, status: 'PENDING' } })` as the lock — called by both
the webhook and the browser's return page, so the redirect-beats-webhook race resolves to exactly one fulfilment;
the amount is re-checked against Paystack's verify call (< ₦0.01 tolerance). The architecture is adopted; the
details below are what had to change to fit *these* repos.

**Where each half lands.**
- **The dev inbox → a fourth email transport, `inbox`,** in `lib/email/transport.ts` (beside `resend` / `console` /
  `file`), plus `GET`/`DELETE /api/v1/dev/email-inbox` and a floating widget on the layout. It is the natural next
  small step: reset links and the 0.5.D notices become visible locally *and* on a staging deploy with no mail
  provider. Our messages are plain text, so the widget shows text — it never injects HTML.
- **The Paystack engine → the Finance phase (M2).** It needs the fee/invoice models it fulfils (`PaymentTransaction`
  gains a `tenantId` in Octalve Edu — RLS, §0.5.2 — or a branch in AlEemaan), so it is *designed* here and *built*
  there, with the guide as the reference.

**Changes the guide needs before it is safe here** (each becomes a test):
1. **The gate must fail closed.** The guide's `devToolsEnabled()` is `VERCEL_ENV !== 'production'`. On any host that
   is not Vercel — our self-hosted Solo installs and AlEemaan's live school — `VERCEL_ENV` is unset, so the gate is
   **open in production**, and (with the mock) a missing `PAYSTACK_SECRET_KEY` would silently turn the system into
   one that accepts free "payments". Replace it with an explicit opt-in: dev tools are on only when `DEV_TOOLS=true`
   **and** `APP_ENV` is `development` or `staging`; an unset `APP_ENV` under `NODE_ENV=production` is production.
   Production **never** enables them, and a missing `PAYSTACK_SECRET_KEY` in production is a hard `PAYSTACK_NOT_CONFIGURED`,
   never a fallback to the mock. A unit test walks the whole environment matrix.
2. **The inbox must not be public on a reachable staging URL.** It is unauthenticated in the guide — but a reset link
   or a recovery-code notice in it is an account takeover for anyone who finds the URL. It cannot just require a
   session (password reset happens signed out). On `development` (localhost) it stays open; on `staging` it requires
   `DEV_TOOLS_TOKEN`, entered once in the widget. Both routes answer 404 when tools are off.
3. **No `dangerouslySetInnerHTML`.** Plain text only here; if HTML mail is ever added, render it in a
   `sandbox`ed `srcdoc` iframe. The widget must also pass our nonce CSP (no inline script/style) and axe, in both themes.
4. **CSRF uses our `validateCSRF()`.** The guide's `origin.includes(host)` is a substring test (`evil-localhost:3000.com`
   passes it).
5. **The webhook keeps the guide's discipline** — raw body first, constant-time signature check, 200 even when
   fulfilment throws — and gains our limiter. `GET …/status` runs `fulfillPayment` (a side effect behind an
   unauthenticated GET that makes an outbound Paystack call per request), so it is rate-limited per IP and per reference.
6. **Money stays `Decimal` Naira everywhere**; kobo exists only inside `lib/paystack.ts`.

**Tests this implies (written before the code, like every phase):** the gate matrix; inbox ring buffer (50 cap,
survives a simulated reload, newest first); routes 404 when off and token-gated on staging; an email containing
`<script>`/`<img onerror>` renders inert; the `inbox` transport selected by default only when tools are on;
and, with Finance: a signature computed over a *re-stringified* body is refused, 20 simultaneous `fulfillPayment`
calls produce exactly one fulfilment, an amount mismatch throws, the mock cannot be reached or used in production,
and the mock's self-webhook goes through the real handler.

**Build order:** the `inbox` transport + widget first (small; both repos; after 0.5.D); the Paystack engine with Finance.

**Design for the inbox half (2026-10-05, written before any code; approved to build next, ahead of §0.5.E).**
- **The gate** — `lib/dev-tools.ts`, pure and unit-tested over the whole environment matrix. `appEnv()` is
  `APP_ENV` if it is exactly `development` / `staging` / `production` (case-insensitive), else `production` when
  `NODE_ENV=production` **or `VERCEL_ENV=production`**, else `development`; **any unrecognised value is production**
  (fail closed — `prod`, a typo, an empty string under `next start`). `devToolsEnabled()` is false in production
  always (even with `DEV_TOOLS=true` and a token); in `staging` it needs `DEV_TOOLS=true` **and** a non-empty
  `DEV_TOOLS_TOKEN` (no token → off, not open); in `development` it is on unless `DEV_TOOLS=false`. `next start`
  forces `NODE_ENV=production`, so a deployed server is production unless `APP_ENV` says otherwise on purpose.
- **The store** — `lib/dev/email-inbox.ts`: newest-first ring buffer of 50 on `globalThis.__devEmailInbox` (survives
  HMR), each message `{ id, to, subject, text, sentAt }`, text capped at 20 KB. Per process, so it works for a
  long-lived server (local, Solo, single-instance staging) and **not** across serverless instances — said so in the docs.
- **The transport** — `inbox`, a fourth `EmailTransport`. `EMAIL_TRANSPORT` always wins; unset → `resend` if
  `RESEND_API_KEY`, else `inbox` if dev tools are on, else `console` (with the existing production warning).
  Choosing `inbox` explicitly while dev tools are off is an error (the send fails loudly in the log, never
  silently into a buffer nobody can read). It also prints one line (`[EMAIL → to] subject — captured in the dev
  inbox`) — never the body, so a reset link doesn't land in the log.
- **The routes** — `GET`/`DELETE /api/v1/dev/email-inbox`: **404** when tools are off (a plain 404 in the standard envelope); in `staging`, header `x-dev-tools-token` compared in constant time (hash-then-`timingSafeEqual`),
  wrong/missing → 401, five wrong in 5 minutes per IP → 429; `DELETE` also needs `validateCSRF()`; every response
  `no-store`. `development` is open (it is your own machine).
- **The widget** — `components/dev/DevEmailInbox.tsx` (client), mounted from the root layout only when the gate is
  on: a launcher bottom-right with an unread count, a dialog (list → message), live refresh every 4 s while
  authorised, a token form on 401 (kept in `sessionStorage`, best-effort), a "DEV" badge so it is never mistaken
  for product UI. The body is rendered as **text** (`white-space: pre-wrap`); every `http(s)` URL in it is also
  offered as a real link (so a reset link is one click). Escape closes and returns focus to the launcher; ≥ 44 px
  targets; both themes; no inline script or style (nonce CSP).
- **Tests (before the code).** unit: the gate matrix; the buffer (cap, order, cap on text, lives on `globalThis`).
  integration: transport selection matrix; the routes in-process (404 when off — including `DEV_TOOLS=true` in
  production; open in development; token + rate limit + CSRF in staging; prefix-of-token fails). api + e2e against a
  **third server in staging mode** (`:3102`, token set, `EMAIL_TRANSPORT` unset): forgot-password → the mail is in
  the inbox → the link works; the main servers 404 and show no launcher; a message containing `<script>` /
  `<img onerror>` renders inert; axe in both themes for the launcher, token form, list and message; focus return.
  Mutations: gate open in production; token unchecked / prefix-compared; DELETE without CSRF; no 404 when off;
  `inbox` as the production default; body rendered as HTML; buffer uncapped; log line printing the body.

**As built — inbox half (2026-10-05)** — record: `phases/phase-0.5.F-dev-email-inbox.md`. As designed, with these
refinements the build itself forced:
- **One decision, not two functions.** The first draft had `devToolsEnabled()` and a separate `devToolsToken()`
  that returned `null` for *both* "no token needed" and "staging with no token configured" — a caller reading
  `null` as "open" would have failed open. A sweep over all 1,344 combinations of `APP_ENV` / `NODE_ENV` /
  `VERCEL_ENV` / `DEV_TOOLS` / `DEV_TOOLS_TOKEN` found it. There is now one `devToolsAccess()` returning `off`,
  `open` or `{ token }` (and `devToolsEnabled()` is just "not off"); the route switches on it.
- **A fourth test server.** The same build in `APP_ENV=staging` with the tools on, a token and *no*
  `EMAIL_TRANSPORT`; the other three servers pin `APP_ENV=production` regardless of a developer's own `.env` and
  the specs assert they 404 the route and render no launcher.
- **The launcher is bottom-right**, not bottom-left: AlEemaan's admin shell has a left sidebar and Next's own dev
  indicator lives bottom-left. On phones it sits above the tab bar.
- **Two UX bugs the browser tests caught.** Clicking "Back to the list" unmounted the focused button, focus fell
  to `<body>`, and Escape then did nothing — focus now goes to the dialog heading (to the Back button when a
  message opens), and Escape listens on the document while the dialog is open. The "unread" memory lived in
  component state and reset on every full page load (the widget remounts per navigation); it is now kept in
  `sessionStorage` for the tab.
- Message bodies are text (`white-space: pre-wrap`); every `http(s)` URL in a body is also offered as a link,
  and a `javascript:` URL can never become one. The route answers a plain 404 in the standard envelope when the
  tools are off (not byte-identical to an unmatched path — the route's existence isn't a secret).
- **Not built, by design:** HTML rendering, persistence across restarts or instances (it is process memory), and
  the Paystack half — that waits for Finance.

#### 0.5.G — Shared API infrastructure: ported from Octalve Edu §0.5.3 (designed 2026-10-06, before any code)

**Why now.** The Users pages (invite, change role/branch, deactivate) need paginated lists, validated bodies and a breached-password check on the
invitee's new password — all built, mutation-tested and merged in Octalve Edu's §0.5.3 — and a cross-repo review (see "Cross-repo review") found that
AlEemaan has none of it, and that its CSRF check is weaker than Octalve Edu's. Porting is read from the **raw diff**, never by copying files (a
"shared" file once carried Octalve's cookie name here — 58 tests failed).

**Build design (numbered, as the other phases):**
1. **Verbatim (nothing in them is product-specific):** `fail(message, status, code, details?)` + `ErrorDetail` in `lib/api/envelope.ts` (a 400 can name each
   bad field); `lib/api/pagination.ts` (offset + cursor, strict: a malformed, repeated or out-of-range parameter is a 400 naming the field — never clamped,
   never first-wins); `lib/api/validate.ts` (`validate({ body?, query? }, handler)` composed INSIDE `withAuth`: non-JSON → 400 `INVALID_BODY`, > 1 MiB → 413,
   schema failure → 400 `VALIDATION` with `details`, unknown keys stripped). Their unit tests are ported with them.
2. **Breached-password check (`lib/auth/pwned-password.ts`).** k-anonymity (only the first 5 hex characters of the SHA-1 leave the server; `Add-Padding: true`), **fail
   open** (a down breach service never blocks choosing a password; the shape rules still apply), `PWNED_PASSWORD_CHECK=off` / `PWNED_PASSWORD_URL` overrides.
   *Brand constant that is NOT copied:* the `User-Agent` becomes `aleemaan-password-check`. Wired into every place a NEW password is chosen: the setup wizard,
   password reset, password change (and, later, invitation accept). **Live-data note:** it runs only when a password is *set*; no existing account is touched or
   locked out. Default **on**; documented in `.env.example`.
3. **CSRF hardening (a security fix, not a port of a feature).** `lib/auth/csrf.ts` today compares `Origin` with `X-Forwarded-Host || Host` — a header any non-browser
   client can set. Change to Octalve Edu's: (a) `Sec-Fetch-Site` as a second, independent signal (`same-origin` / `none` pass; `cross-site` / `same-site` refused;
   absent falls through); (b) `X-Forwarded-Host` is read **only** when `TRUST_FORWARDED_HOST=true` (the operator says a proxy sets *and overwrites* it). **Rollout risk,
   named:** a reverse proxy that rewrites `Host` would make every write fail the Origin check — nginx needs `proxy_set_header Host $host;` (Caddy passes it through);
   otherwise set `TRUST_FORWARDED_HOST=true` and make the proxy overwrite `X-Forwarded-Host`. Documented in `.env.example` and the phase record.
4. **NOT ported, and why.** The Redis rate-limit store (one process, in-memory is sufficient — §0.5.1.6); everything tenant-shaped (campus routes, `resolveTenant`, RLS);
   the auth-event audit (AlEemaan already has `lib/auth/audit.ts`). **`Dialog` / `SelectField` are NOT ported here**: with no consumer yet they would be untested code
   (Octalve Edu's own rule); they move with the Users pages that use them, together with their e2e and axe tests.
5. **Test servers.** The existing servers keep `PWNED_PASSWORD_CHECK=off` (nothing in the suite may call the public service). One new **breach-check server**
   (`BREACH_PORT`, plain HTTP, check ON) points at a local stand-in (`tests/support/pwned-stub.mjs`, ported) so the routes are exercised end to end, including that
   only the 5-character prefix is ever sent. The HTTPS server gets `TRUST_FORWARDED_HOST=true` (the TLS proxy sets it), as in Octalve Edu.
6. **Tests (written with the code).** *unit:* pagination (every boundary, repeated/signed/decimal/padded/non-numeric, cursor round trip and tampering), `validate`
   (non-JSON, size, schema, strip, details cap), pwned (k-anonymity, padding, fail-open on network/timeout/odd answer, off switch), CSRF (each `Sec-Fetch-Site` value,
   Origin/Referer fallbacks, forwarded host honoured only when trusted). *integration:* the breached-password rule inside setup/reset/change. *api (breach server):*
   each route refuses a breached password with the reason, leaves the reset link usable, accepts a fresh one; a spoofed `X-Forwarded-Host` is ignored.
7. **Mutations (≥ 25).** pagination clamps instead of refusing; first-wins on repeats; `limit` cap off; cursor accepts a forged value; `validate` passes unknown keys /
   skips the size check / parses after the handler; breach check sends the full hash / not padded / fails closed / skipped in one route; CSRF trusts `X-Forwarded-Host`
   unconditionally / ignores `Sec-Fetch-Site` / accepts `same-site`; `PWNED_PASSWORD_CHECK=off` ignored.
8. **Order and done.** Design (this section, committed alone) → envelope + pagination + validate (+ unit tests) → CSRF → pwned + wiring + stub/server (+ tests) → typecheck,
   lint, build, one-lane `pnpm test` green → mutation pass → docs (phase record `phases/phase-0.5.G-api-infrastructure.md`, plan "As built", `CLAUDE.md`, `tests/README.md`,
   trackers, and the divergence logged in **both** plans) → push the branch. No PR unless asked.

**As built — 0.5.G (2026-10-06)** — record: `phases/phase-0.5.G-api-infrastructure.md`, branch `claude/aleemaan-0.5.G`. Items 1–8 are built as designed, with: (a) the setup route's breach check sits **after** the setup-token check (an unauthenticated
request with a wrong token must not make this server call out) — Octalve Edu checks before; (b) the test TLS proxy now **rewrites `Host`** (found by mutation C10: passing it through made `TRUST_FORWARDED_HOST` dead weight in the HTTPS test); (c) the breach-check test
server uses fixed ports (`BREACH_PORT` 3203, `PWNED_STUB_PORT` 3204) — no lanes here. 51 mutations: 48 caught first time, 3 survivors (P15, V8, C10) fixed with tests, then all caught. **Rollout risk on the live school, named in the record and `.env.example`:**
a proxy that rewrites `Host` makes every write fail the Origin check until it passes `Host` through or `TRUST_FORWARDED_HOST=true` is set. **Divergence log:** the matching entry is in Octalve Edu's plan (§0.5.3 "As built"), including that *its* HTTPS test proxy still passes `Host` through.

## Phase 0.5.2 — School Settings (design only — not implemented yet)

Design pass for the legacy admin panel's "Settings" area (`legacy-feature-inventory.md` §4.7), before
any code, per the rule this document exists to enforce. This pass's main finding: "Settings" isn't
one feature — the legacy panel bundled a genuine global setting together with core academic-structure
data that just happened to live under the same sidebar tab. Splitting that apart now, before schema
gets written, is the actual design work here.

### What's really a Setting (global, one row, this phase's actual scope)

Only the legacy "School Info" tab qualifies — name, principal/head-teacher name, phone, motto,
address. One school, one row. Proposed model, matching Octalve Edu's own `SchoolSettings` naming
(PRD §14) for consistency, even though AlEemaan's version is far smaller (no per-tenant toggles —
there's only one tenant):

```prisma
model SchoolSettings {
  id        String   @id @default("global")
  name      String
  principal String?
  phone     String?
  motto     String?
  address   String?
  updatedAt DateTime @updatedAt
}
```

Auto-created (all-defaults-or-blank) the same way Octalve Edu's plan describes for its own
`SchoolSettings` — never a nullable "not configured yet" state. A `SettingsChangeAudit`-equivalent
(Octalve Edu PRD §14) is worth carrying forward too, once there's an admin UI to actually change
these fields through (not yet — no dashboard exists beyond the setup wizard).

### What's NOT a Setting — real academic-structure data, not modeled here

The rest of the legacy Settings tab (Session/active-term, Classes, Assessment, Subjects) is core SIS
domain data that `Result`/`Enrollment`/future models will reference directly, not a toggle a school
occasionally flips. Each needs its own Phase 1 design pass (mirroring Octalve Edu's own `sis.prisma`,
adapted), **not** invented here as an afterthought to "Settings":

- **Academic session/term, per branch** — the audit already flagged this as branch-level, not
  global: both Arabic branches run two terms, both English branches run three. A `Branch` needs its
  own active-session/term state, not a shared global one.
- **Classes, per branch** — the legacy inconsistency (only primary branches got a configurable class
  list; secondary had it hardcoded) is being fixed by making every branch's class list
  admin-configurable uniformly (already decided in `feature-reconciliation-audit.md`) — but the
  `ClassGroup`/`Arm` shape itself belongs in Phase 1's schema, not sketched ad hoc here.
- **Subjects, per branch** — same reasoning; a `Subject` model tied to a branch (and eventually a
  class group), not a `Settings` field.
- **`AssessmentConfig`, per branch** — already flagged in the audit as needing its own model (CA test
  components + max scores, the `assessmentConfig` snapshot pattern worth keeping on each `Result`).
  Belongs beside `Subject`/`ClassGroup` in the same Phase 1 pass, not here.

### What's dropped, not carried forward at all

`settings/subjectPasswords` and `settings/remarkPasswords` (the plaintext shared-password unlock
scheme) have no schema equivalent — already fully replaced by the `Permission` model
(`CAN_APPROVE_RESULTS` etc., built in Phase 0.5.0/0.5.1). Nothing to design here; this is a
confirmation that the replacement is already complete, not an open item.

---

## Roadmap: Phase 1 → 7 (+ 0.5.3)

"Phase 1 (Core SIS + Finance)" was a placeholder label, not a real scope — it would have bundled at
least four independent, differently-dependent pieces of work under one name. Broken out below into
phases that each ship something real, ordered by actual dependency (not by PRD section number).
`docs/feature-reconciliation-audit.md`'s own "Sequencing note" observation is the reason this split
exists at all — it caught forgot-password and the admissions/CMS forms being about to get lumped into
a single "Core SIS" phase where neither belongs. Each phase still gets its *own* full design pass
(models, API shape, verification plan) written here immediately before it's built — this section is
the map, not the design; writing full schemas for phases 3–7 now would be designing ahead of a need,
same mistake this document exists to prevent.

**Dependency shape, and a correction to how this was first ordered:** schema comes first. Phase 1
(Academic Structure) is the actual dependency root — `ClassGroup`/`Subject`/`AssessmentConfig`/
session-term are what Phase 2's `Student`, Phase 3's `Result`, and Phase 4's `Invoice` all reference by
name; nothing past this document's Phase 0.5 work can be built without it. An earlier draft of this
roadmap put "0.5.3 — Auth completion" first, reasoning it was cheap and independent — true, but
independence cuts both ways: nothing here depends on 0.5.3 either, so being cheap and unblocking
nothing is exactly the profile of work that shouldn't sit on the critical path. It's moved below, right
before Phase 6, which is where its urgency actually comes from (forgot-password and rate-limiting start
mattering once family/student self-service accounts exist at real scale — not before schema does).
Phase 5 (Public Site/CMS) depends only on Phase 1 data and could in principle build in parallel with
Phases 2–4; kept sequential here since one person is doing the building. Phase 7 (migration) depends on
everything above being schema-stable, for obvious reasons.

- **Phase 1 — Academic Structure (the shared foundation every later phase reads — build this
  first).** Pure configuration, no student data yet: `AcademicSession`/`Term` (per-branch — the
  audit's finding that Arabic branches run two terms and English branches run three means this is
  branch-scoped, not global), `ClassGroup` (admin-configurable uniformly on every branch — fixing the
  legacy primary-only-had-this inconsistency), `Subject` (per branch, tied to a class group),
  `AssessmentConfig` (per-branch CA test components + max scores + exam max, with the
  `assessmentConfig` snapshot pattern captured onto each `Result` at save time — one of the few things
  the legacy system got right, per the audit, worth carrying forward exactly), and `GradeScale`
  (band → letter grade → remark, e.g. 75–100 → A1 → "Excellent" — see the research note below for why
  this is a model here and not a hardcoded legend like the legacy system had it). Adapted from Octalve
  Edu's own Phase 1 `sis.prisma` where the shape overlaps, single-tenant simplified where AlEemaan
  doesn't need Octalve's multi-campus version.

  **Research note (2026-09-28):** before finalizing this phase's actual schema, compared our shape
  against [1EdTech's OneRoster](https://www.1edtech.org/standards/oneroster) — the standard schema
  vendors like PowerSchool and Google Classroom use to exchange SIS/LMS data — not to adopt it
  wholesale (it's built for cross-vendor interop between separate systems, which doesn't apply to one
  in-house app), but to sanity-check our model boundaries against a schema that's absorbed a lot of
  real-world SIS edge cases already. Two things worth taking from it, one thing worth deliberately not
  taking:
  - **Take: `Enrollment` as its own model, not a field on `Student`.** OneRoster never lets a `class`
    membership be a bare foreign key on `user` — it's always a separate `enrollment` row
    (user + class + session + role + status). Applied here, that means Phase 2's `Student` shouldn't
    carry a single `classGroupId` field the way the legacy system's `students.class` did; a separate
    `Enrollment` (studentId, classGroupId, academicSessionId, status) gives a real per-session
    enrollment history natively. This directly replaces the legacy's `promotionHistory` array-append
    hack (§4.6) with a queryable table instead of an opaque JSON blob on the student doc — cleaner than
    what either the legacy system or the original Phase 2 draft above had.
  - **Take: grade bands as data, not a hardcoded legend.** OneRoster's gradebook service models score
    scales as actual records, not a UI constant. The legacy system's WAEC-style A1–F9 scale (§2.1) was
    a static legend baked into the report-card template. Since `AssessmentConfig` already makes CA/exam
    structure admin-editable data, leaving the grade bands as a hardcoded constant would be an
    inconsistency in the same schema — `GradeScale` fixes that, and happens to also make the "A1–F9"
    scale swappable per branch later if the Arabic branches ever wanted a different one (they don't
    today, per the inventory — just no longer a code change if that ever comes up).
  - **Deliberately not taking: OneRoster's `course`/`class` split.** OneRoster separates a `course`
    (shared curriculum) from a `class` (one taught instance/section of it, with its own teacher and
    roster) because a real course catalog can have multiple sections of the same course. Nothing in
    the legacy inventory or the audit shows AlEemaan ever having more than one section per class per
    branch — adding that split now would be modeling a scenario that doesn't exist, the same mistake
    this document's design-first rule exists to prevent. `ClassGroup` + `Subject` (already planned)
    cover the real shape; revisit only if a real multi-section need shows up.

- **Phase 2 — Student & Staff Records.** Depends on Phase 1's `ClassGroup` and `Enrollment` existing.
  `Student` (name, gender, admission number — **not** reusing Firebase UID as the human-facing ID, a
  real gap the legacy system had — guardian contact; current class comes from the student's active
  `Enrollment` row, not a field on `Student` itself, per the research note above), staff profile fields
  beyond what `Membership` already carries (subjects taught). Carries forward the legacy
  class-consistency guard (§2.1) and CSV export (§4.4/§4.5) as real, used features, not nice-to-haves.

- **Phase 3 — Results & Assessment Workflow.** Depends on Phases 1 and 2 both being real. Teacher
  score-entry API, replacing the legacy shared-password subject/remark unlock scheme with the
  `Permission` model already built (`CAN_APPROVE_RESULTS` etc. — one fix for three legacy findings, per
  the audit's observations). Class position/ranking computed server-side (the legacy client-side
  "count who's strictly higher, +1" doesn't handle ties correctly). Server-rendered report-card PDF
  export, not client-side rasterization. Bulk promotion carrying forward the *exact* legacy rule the
  audit's correction preserved: Third-Term-only, average-of-per-term-averages ≥ 50%, idempotent — but
  implemented as closing the student's current `Enrollment` row and opening a new one in the next
  `ClassGroup`/session (Phase 1's research note), not the legacy's `promotionHistory` array-append,
  since idempotency ("already-promoted students are no longer in the source class query") falls out
  naturally from querying active enrollments rather than needing a separate history field to check
  against.

- **Phase 4 — Finance & Payments.** Depends on Phase 2 (`Student` must exist to have a payment
  status). `Invoice`/`Payment` records replacing the legacy bare `hasPaid` boolean the result-checker
  gates on, manual/no-gateway confirmed as the right MVP scope (PRD §7) — no payment-gateway
  integration invented here that wasn't asked for. Bulk "reset payment per class" carried forward as a
  real, used admin action.

- **Phase 5 — Public Site & CMS.** Depends only on Phase 1 data (branches, session dates) being
  queryable for display; independent of Phases 3–4. This is where the admissions inquiry form finally
  gets a real backend (currently 100% cosmetic — the legacy system's single biggest missed
  opportunity, per the audit), the fee-structure browser becomes CMS-editable content instead of a
  hardcoded `fees-data.js`, and the contact/tour/vacancy-application forms (already fully built
  client-side in the legacy system, just commented out) get wired to something real. Explicitly not
  Core SIS work, despite touching "admissions" — the audit's sequencing note exists specifically to
  keep this out of Phase 1–3.

- **0.5.3 — Auth completion (forgot-password, admin force-delete, persistent rate limiting).**
  Repositioned here, right before Phase 6, from an earlier draft that put it first — see the
  dependency-shape note above for why. The audit flagged all three as real, currently-missing gaps in
  the legacy system (`§2.1/§4.3/§6.7`), not cosmetic ones, but their urgency tracks user count, and
  admin-only usage (Phases 1–5) stays small: a handful of admin/staff accounts, manageable by hand if
  one gets locked out. That changes the moment Phase 6 opens login to every family. Reset-token email
  flow against `passwordHash`; `CAN_MANAGE_USERS`-gated delete that doesn't require re-authenticating as
  the account being removed (the legacy system's actual undeletable-account bug); a
  `LoginAttempt`-backed limiter replacing the legacy client-side-only 30-second lockout (trivially
  bypassable — it's just a disabled button). No new domain models besides `LoginAttempt`; everything
  else touches existing `User`/`Membership`.

- **Phase 6 — Family/Student Self-Service Portal.** Depends on Phases 1–3 (needs sessions, students,
  and results to exist) and on 0.5.3 landing first (see above). Unifies the legacy system's 4 separate,
  per-branch result-checker logins into one `PARENT`/`STUDENT` login against the single `Membership`
  model — fixing the "family with children in two branches has two unrelated logins" problem the
  audit's observations called out as a consequence of the 4-Firebase-project split, not just a UX
  inconvenience.

- **Phase 7 — Data Migration & Cutover.** Depends on every schema above being stable. Maps the 4
  separate Firestore projects' data into one Postgres database. Blocked on a real answer to the
  audit's open question first: what's actually populating the two Arabic branches' data today, since
  no admin/teacher portal exists for them in any of the 5 repos read — that changes how much of this
  phase is "migrate real records" versus "start those two branches from zero." Ask the school before
  this phase's design pass gets written, not during it.

## Next action

**State (2026-10-05):** everything through **0.5.F is merged to `master`** — the auth sync (0.5.1.6), 0.5.A–0.5.D, 0.5.E
(account self-service, PR #8) and 0.5.F (dev inbox). Nothing is awaiting merge. `aleemaan_progress.md` is the live tracker.

**Remaining in Phase 0.5, in this order:**
1. **0.5.G — Shared API infrastructure, ported from Octalve Edu** (new — see "Cross-repo review" below): pagination helpers, the `validate()`
   wrapper, the breached-password check, and a CSRF hardening fix (designed in full at "0.5.G" above; the `Dialog` / `SelectField` primitives move with the
   Users pages that use them). A prerequisite of the next item, not a feature.
2. **Users pages and invitations** (finishes 0.5.E: invite & activate, change role / branch / permissions, deactivate) — a port of
   Octalve Edu's 0.5.4, read from the raw diff, **after** that phase has had its mutation pass there.
3. **0.5.2 School Settings** — designed above, **not implemented, waiting on the maintainer's go-ahead** (do not start it unprompted).

Then **Phase 1 (Academic Structure)**, the dependency root every later phase reads from. Any new `withAuth` route ships with API tests
(401 / 403 / CSRF) — `tests/README.md` says how. `permissions` gating (§1.7): AlEemaan already has the `Permission` enum and
`Membership.permissions`; Octalve Edu wires `withAuth` to them first (its Phase 1.0), and this repo ports that straight after — the earlier
"built in both repos together" promise (§0.5.1.6 item 1) is honoured by porting immediately, not by waiting.

### Cross-repo review (2026-10-05) — what is shared, what is not, and open points

**The rule behind every divergence:** Octalve Edu is a *product* (generic, multi-tenant, many kinds of school: configurable models,
tenant isolation is the core risk). AlEemaan is *one live school replacing a real legacy system* (four branches, Arabic two-term and
English three-term calendars, the WAEC scale, real records to migrate; the core risk is live data and legacy behaviour staff rely on).
**Share mechanisms** (auth, session, shell, CSRF, validation, pagination, the Users/invitation flow). **Do not share domain models**
(`SchoolType`, billing-cycle toggles, per-tenant settings) — AlEemaan's come from `legacy-feature-inventory.md`.

| Piece | Octalve Edu | AlEemaan | Why |
| :-- | :-- | :-- | :-- |
| Tenant boundary, RLS, `app_user` role, SaaS server | yes | **no** | one school; an optional later hardening is a restricted runtime DB role and an append-only `AuditLog` |
| Redis rate-limit store | yes (multi-instance) | **no** — in-memory is sufficient (one process) | "persistent" limiting here means *surviving a restart*, a different need (see below) |
| Finance | gateway + mock Paystack | **manual**, no gateway (PRD §7) | legacy gates results on a bare `hasPaid` boolean |
| `SchoolSettings` | per tenant, with toggles, `tenantId` PK | one row `id = "global"`, school info only | one school |
| Phase / sub-phase numbers | "Phase 1" = Core SIS + Finance (1.0–1.8) | "Phase 1" = Academic Structure only (1.1–1.6) | **the same label means different things — always say which repo** |

**Open design points** (to settle in the relevant phase's design pass, before its code):
- **0.5.2 seed has no source.** The roadmap says the migration "seeds the row from the setup wizard's school name", but the wizard stores no
  school name (`SystemSettings` holds only `setupComplete`; it seeds four `Branch` rows). `SchoolSettings.name` is non-null, so the design
  must name the seed value explicitly — confirm the school's official name with the school rather than invent one.
- **The roadmap's "0.5.3 — Auth completion" is partly done and partly contradictory.** Forgot-password shipped as 0.5.C. Its `LoginAttempt`
  DB-backed limiter conflicts with §0.5.1.6 ("in-memory is sufficient"); decide whether *surviving a restart* matters before building it.
  "Admin force-delete" overlaps the Users pages' *deactivate*: reconcile the two, with the legacy bug (accounts that could not be removed)
  as the tiebreaker. Who may manage users (`ADMIN` only, as in Octalve Edu, or `CAN_MANAGE_USERS`) is also open.

---

### Build design — Users pages and invitations (a port of Octalve Edu's 0.5.4) — written 2026-10-07, before any code

**Scope.** Octalve Edu's 0.5.4 only: the members list, invite → accept, change role / branch, deactivate / reactivate, and the pending-invitations list (resend / revoke). **Not in this port:** granting permissions (Octalve's 1.0 — a separate port straight after, once `withAuth` here accepts `permissions`), admin-initiated email change (Octalve 0.5.4-F, still open there), and School Settings (still awaiting the maintainer's go-ahead). Source of truth for behaviour: Octalve's plan §"Build design — Users and invitations (0.5.4)" and its record `phases/phase-0.5.4-users-invitations.md`, read from the raw diff, not copied. Stacked on `claude/aleemaan-0.5.G` (PR #10), which provides `validate()`, pagination, the breached-password check and the CSRF hardening this needs.
**The rule behind every divergence** (see "Cross-repo review"): one school, a live one. Everything below is **additive and must leave the school's existing accounts, memberships, sessions and audit rows exactly as they are.**

**Decision 1 — what "a member" is here.** *(Superseded in part, 2026-10-07: the "one active membership per person" rule below was replaced by one membership per person per branch — see "Design change — a person may belong to several branches" and ADR 0007.)* AlEemaan's model is `Membership(userId, branchId, role)`, unique per `(userId, branchId)`, and a role applies **school-wide** (an ADMIN's branch is bookkeeping — §0.5.1.2). The schema permits one person several memberships; **nothing creates more than one today** (setup and invitations each make one). The Users pages therefore treat **one active membership per person** as the rule: inviting someone who already holds an active membership is refused (409), accepting refuses the same, and the API addresses a membership by **its own id** (`/members/[membershipId]`, not a user id) so a future second membership can never make an action ambiguous. The list shows memberships. *(Open question for the maintainer: should one person be able to hold two branches? Built so that opening it up is a service change, not a schema change.)*

**Decision 2 — data (one additive migration, live-safe).** (a) `Membership.deactivatedAt TIMESTAMP(3) NULL` — adding a nullable column with no default is instant and rewrites nothing; **every existing row is "active"**. (b) New table `Invitation { id, email (lower-cased), role, branchId (FK → Branch, cascade), tokenHash UNIQUE (SHA-256 hex — never the token), invitedById?, acceptedById?, createdAt, expiresAt, acceptedAt?, revokedAt? }`, index `(email)`, `(createdAt)`, and a **partial unique index** `Invitation_one_live_per_address` on `(email) WHERE acceptedAt IS NULL AND revokedAt IS NULL` — one open invitation per address, whatever the code does. (c) **No RLS, no `app_user`, no `app_invitation_hash()`** (single tenant — the one place this port is simpler than the source). No backfill, no data rewrite, no `NOT NULL` added to an existing column. **Deploy order:** run the migration first, then the new code (new code reads `deactivatedAt`; the old code is unaffected by the new column). **Rollback:** the old code runs unchanged against the migrated database; dropping the table and column is a clean undo.

**Decision 3 — a deactivated membership is no membership, in every reader.** The rule many places must remember, so each gets a test: `getUserMemberships` (so `requirePageSession`, `/auth/me`, the dashboard and the account page), `withAuth({ roles })` (the membership lookup adds `deactivatedAt: null`), `completeSignIn`'s admin check (a deactivated admin gets an ordinary, not the 7-day-capped admin, session), the dashboard's and Branches page's member counts (active only). Because AlEemaan has no tenant resolver, the roles check **is** the guard; nothing else needs touching.
*Divergence from Octalve:* **deactivating a person's last active membership also deletes their sessions**, in the same transaction (Octalve lets them keep a session that resolves to no school). Here there is one school and nothing else behind a session but the person's own account, and a live school is better served by "deactivated means signed out"; with another active membership the sessions are left alone. Reactivation does not restore sessions (the person signs in again).

**Decision 4 — the link and the mail (as Octalve).** `…/accept-invite#token=<32 random bytes, base64url>` in the URL **fragment**, only the SHA-256 stored, single use, revocable, **7 days**. Mail goes out after the response (`after()`), the same whether or not an account exists for the address. New message `invitationEmail` in `src/lib/email/messages.ts` (school-neutral wording: the branch, the role, who invited). Per-target-address mail limit as for email change.

**Decision 5 — accepting (as Octalve; one rule: an existing account is attached only by its owner).** (a) *No account for the address:* name + password (policy + breached-password check) → one `prisma.$transaction` creates the `User` (`emailVerified = now`), the `Membership`, claims the invitation and audits it; the person is **not** signed in (a link in a mailbox is not a session). (b) *An account exists and the person is signed in as it:* one click attaches the membership. (c) *An account exists, nobody signed in:* "Sign in to accept" that returns to the same link; *signed in as someone else:* refused with no data about the other account. Single use is a **conditional `updateMany`** (`acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > now()` — the row count decides) in the same transaction as the writes; unknown, malformed, used, revoked and expired links are **one generic answer**; public routes carry CSRF, a per-IP failure limit (refunded on success) and a per-token limit. A person with an active membership cannot accept (409); a deactivated person comes back by **reactivation**, not by invitation.

**Decision 6 — API** (all `withAuth(…, { roles: ["ADMIN"] })`, `validate()`-strict bodies, audited **in the same transaction**): `GET /api/v1/members` (offset-paged; filters `role`, `branchId`, `status=active|deactivated|all`, `q` ≤ 64 matched on name/email with `%`/`_`/`\` escaped; stable order with an id tiebreak) · `PATCH /api/v1/members/[id]` `{ role?, branchId? }` · `POST …/deactivate`, `…/reactivate` · `GET/POST /api/v1/invitations` · `DELETE /api/v1/invitations/[id]` (revoke) · `POST …/[id]/resend` · public `POST /api/v1/invitations/preview` and `…/accept`. People are read **through `membership`** with a narrow `select` of the person's name and address (never a bare `user` listing). Audit actions as Octalve's (`INVITATION_CREATED|RESENT|REVOKED|ACCEPTED`, `MEMBER_ROLE_CHANGED`, `MEMBER_BRANCH_CHANGED`, `MEMBER_DEACTIVATED|REACTIVATED`), `targetType` `Membership` / `Invitation`, before/after, never a token, a hash or a password.

**Decision 7 — authority rules.** ADMIN only (not delegable to `CAN_MANAGE_USERS` — an open question carried over from the cross-repo review; the stricter reading is built). (i) **The last active administrator cannot be demoted or deactivated**: counted as **distinct people** with an active ADMIN membership, after `SELECT … FOR UPDATE` on those rows, so two simultaneous demotions cannot both succeed; (ii) nobody changes, deactivates or reactivates **themselves** (`SELF`); (iii) a branch must be one of the four (a made-up id looks like a missing one); (iv) an unknown id is one 404; (v) a no-op is a 200 that writes no audit row; (vi) inviting an active member is a 409 that says only that fact, inviting a deactivated member says to reactivate. A role change takes effect on the person's **next request** (the role is read from the membership every time — Decision 3 makes that true for deactivation too). An ADMIN is shown as "All branches" whatever branch their row names.

**Decision 8 — screens.** `/users` (nav entry "Users" becomes a link, administrators only; anyone else gets the existing 403 view) with filters, a table from `md` / cards on a phone, native `<dialog>` forms (invite, change role/branch, deactivate), one polite live region, focus returned, pending invitations with resend / revoke; `/accept-invite` with the three cases and the dead-link state. New primitives ported with their users: `Dialog` and `SelectField` (as 0.5.G promised). Every state checked with axe in both themes, ≥ 44 px tap targets, no horizontal scroll.

**Decision 9 — tests (written with the code).** *unit:* token generation/hash/shape, invitation status derivation, the like-escape, relative expiry text. *integration:* invitation lifecycle (hash at rest, one live per address, expiry, revoke, resend), **accept creates user + membership + audit atomically and rolls back whole**, **lost races tested deterministically** (a held row in a second connection — the `whileHeld()` pattern from Octalve's `invitations.spec.ts`), two simultaneous accepts → one membership, the authority rules, last-admin under concurrency, **a deactivated membership is invisible to each reader in Decision 3**, deactivation revokes sessions only when it was the last active membership, **the migration leaves existing data untouched** (a test seeds a pre-migration-shaped membership and asserts it reads as active). *api:* every new route's 401 / 403 (non-admin, deactivated admin) / CSRF, the authority matrix, validation, paging, identical answers for "has an account" and "has none", audit contents, mail contents. *browser (desktop + phone):* invite → mail → accept as a new person → sign in; the existing-account path; the users page flows; axe, both themes, every state.
*Mutation plan (≈ 40, listed now, **run at the end of Phase 2** by the maintainer's decision):* token stored in the clear; invitation not single-use / expiry ignored / revoke ignored; accept trusting a body field; an existing account attached by an admin or while signed in as someone else; a deactivated membership still granting `roles`; `completeSignIn` giving a deactivated admin the admin session; last-admin guard removed / counted per row instead of per person / not locked; self-change allowed; a made-up branch accepted; people listed without the membership join; audit missing or carrying a secret; different bodies for "has an account"; a deactivated person re-entering by invitation; sessions kept after the last membership is deactivated, or deleted while another remains.

**Decision 10 — divergences, to be logged in both plans' shared-names tables when built.** `members/[membershipId]` (not user id); `branchId` where Octalve has `campusId`; no RLS / `forInvitation`; deactivation revokes sessions when it removes the last active membership; an ADMIN's branch is shown as "All branches".
**Open questions for the maintainer:** (1) one person in two branches? (2) should `CAN_MANAGE_USERS` ever manage people (Octalve: never delegable)? (3) is "deactivated = signed out" wanted for the live school (Decision 3's divergence)? (4) invitation wording and the sender name/address the school wants on the mail.

### As built — Users pages and invitations (2026-10-07)

Built as designed above (Decisions 1–10), in the order: additive migration → services and readers → routes → components → tests → docs. Record: `phases/phase-0.5.H-users-and-invitations.md`. Where the build differs from the design:

- **The invite dialog requires a branch** (the design's wording "optionally a branch" was Octalve's campus rule carried over): a membership always has one here. Found by the browser test; the dialog says "Choose a branch." in place.
- **No per-token limit** on the public routes (Decision 5 listed one). Only the per-IP failure limit (refunded on success) exists, as in Octalve; the token is 256 random bits.
- **Where the tests live:** token / status / like-escape / mail-header tests are in the integration spec `invitations` (as Octalve does) and the pure UI wording in the unit spec `users-model`; everything else is as listed in Decision 9, plus an HTTP race (two administrators deactivating each other) and "a deactivated administrator is a 403 on every administrator route".
- **`LAST_ADMIN` cannot be provoked over HTTP except by a race** (the caller is always a second administrator), so the rule is pinned in-process and the HTTP test is the race.
- Hints no longer promise a per-branch view nothing here enforces ("The branch this person belongs to").
- **Mutation pass: not run — pending, end of Phase 2.** The list stays as in Decision 9.

### Design change — a person may belong to several branches (decided by the maintainer 2026-10-07; written before any code)

**Why.** Open question 1 of the Users build design ("one person in two branches?") is answered **yes**. Decision 1 had built the opposite rule — *one active membership per person* — into inviting, accepting and the single-open-invitation index. This section changes exactly that rule and nothing else; it is added to the Users branch (PR #11) as new commits, not a separate PR, because #11 is not merged and nothing outside the test databases has seen its migration.

**What does not change.** `Membership(userId, branchId, role)` is already unique per `(userId, branchId)`. Roles stay **school-wide** (ADR 0001): a person who is a parent at one branch and a teacher at another holds both roles everywhere, and any ADMIN membership makes them an administrator. Each membership has its own role, branch and status; the members list shows **one row per membership**, addressed by the membership's id (Decision 1). Self-protection (`SELF`) covers all of a person's own memberships. The last administrator is already counted by person (ADR 0005). Deactivating one membership signs the person out **only if it was their last active one** (ADR 0002) — that rule was written for this case.

**Decision M1 — inviting is per (person, branch).** `createInvitation` refuses with: `ALREADY_MEMBER` — the address has an **active membership in that branch**; `DEACTIVATED_MEMBER` — it has a **deactivated membership in that branch**, *or* it has deactivated memberships and **no active one anywhere** (a deactivated person is brought back by reactivation, never by a new link — this keeps ADR 0002's "an invitation is not a way around a deactivation"). Otherwise it succeeds — including when the person already belongs to other branches.

**Decision M2 — one open invitation per (address, branch).** A new migration (`20261008090000_invitation_per_branch`; the first migration is immutable by our own rule) replaces the partial unique index `Invitation_one_live_per_address ON (lower(email))` with `… ON (lower(email), "branchId") WHERE acceptedAt IS NULL AND revokedAt IS NULL`. Inviting the same address to the **same** branch again still revokes the earlier link; inviting it to a **different** branch leaves the first open. The per-address advisory lock stays per address (it only serialises). Additive on a table the live school has never had; a pure index swap.

**Decision M3 — accepting.** A signed-in invitee with an active membership in the invited branch → `ALREADY_MEMBER` (link not spent); a deactivated one in that branch → `INVALID`; a person with deactivated memberships and no active one → `INVALID`; otherwise the membership for the invited branch is created, and their other memberships are untouched. A new account is unchanged.

**Decision M4 — moving a membership.** `changeMember` onto a branch where the person already has a membership is now its own refusal `BRANCH_TAKEN` (409, "This person already has access in that branch.") instead of the generic invalid-branch message.

**Decision M5 — wording.** The deactivate dialog says "If this is their only branch they are signed out as well; otherwise they stay signed in with their other branches"; the deactivate response gains `signedOut` (whether sessions were deleted) so the notice is accurate. The invite dialog's branch hint and the plan text no longer say "one active membership per person".

**Decision M6 — tests (with the code).** *Integration:* inviting a member to **another** branch succeeds, to the **same** branch is `ALREADY_MEMBER`, a same-branch deactivated is `DEACTIVATED_MEMBER`, a fully-deactivated person is `DEACTIVATED_MEMBER`; two open invitations (two branches) coexist, a repeat for the same branch replaces; accepting adds a second membership and leaves the first alone; the lost-race and rollback cases still hold; `BRANCH_TAKEN`; deactivating one of two memberships keeps the session, the last deletes it. *Index:* the new partial unique index refuses two open invitations for one (address, branch) and allows two branches. *API:* the same over HTTP, incl. the 409 bodies; the list shows two rows for one person. *Browser:* inviting an existing member to a second branch, and the two rows (desktop + phone, axe). *Mutation list (run at the end of Phase 2):* the same-branch check widened to "any branch" or dropped; the index left per address; the "no active anywhere" guard removed; a deactivated person accepted into a new branch.

**Decision M7 — ADR.** `docs/decisions/0007-a-person-may-belong-to-several-branches.md` records it; ADRs 0001/0002/0005 need no change (they already hold). The docs that said "one active membership per person" (CLAUDE.md rule, phase record, plan Decision 1) are corrected with a note, not silently.

#### As built — a person may belong to several branches (2026-10-07)
Built as Decisions M1–M7 above, on the same branch (PR #11), in this order: design (committed alone, `d02c1d8`) → migration `20261008090000_invitation_per_branch` (an index swap) → `createInvitation` / `acceptInvitation` per (person, branch) → `BRANCH_TAKEN` and `signedOut` in the members service/routes → dialog wording → tests → docs. One addition to the design: the deactivate **response** carries `signedOut`, and the notice says "They keep their other branches" when they do. Mutation pass: not run (pending, end of Phase 2); the list is in M6.
