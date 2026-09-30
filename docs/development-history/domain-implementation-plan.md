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
10. **The test suite** (`pnpm test`): unit, integration, API, browser (desktop + phone, axe WCAG 2.2),
    and the real-HTTPS `__Host-` cookie run (auth-review P0 #4 — verified for Octalve Edu, *never
    verified here* until now). Every security assertion is mutation-checked, as in Octalve Edu; the
    port itself is attacked too (including the sync→async hazard: `if (!reserveAttempt(k))` without
    `await` is `!Promise`, always false, and would silently disable a limit). Because item 9 ports
    the real sign-in screens, the HTTPS run drives them exactly as Octalve Edu's does — Chromium's own
    cookie rules decide whether the `__Host-` cookie sticks and whether logout removes it.

**Deferred, unchanged:** TOTP MFA (needs the Settings UI), password reset, active-devices page,
breached-password check, a nonce-based script CSP. **Not applicable here:** Redis-backed limiter
(single process), everything in Octalve Edu's §0.5.2 (RLS / tenant trust boundary).

---

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

**Phase 0.5.1.6 (the sync to Octalve Edu's verified auth) is built and verified — hand it to the
maintainer for review and merge** (`claude/octalve-auth-sync`; see
`phases/phase-0.5.1.6-octalve-sync.md`). Nothing else depends on it being merged first.

Then: Phase 0.5.2 (School Settings) is designed and ready to implement directly from its section above —
still waiting on confirmation before writing code, per the design-first rule. Next in sequence after
that: **Phase 1 (Academic Structure)**, since it's the actual dependency root every later phase reads
from — schema modelling comes before the auth-completion slice (0.5.3), which was originally placed
first but doesn't belong on the critical path (see the roadmap's dependency-shape note). Any new
`withAuth` route ships with API tests (401 / 403 / CSRF) — `tests/README.md` says how; TOTP MFA and
`permissions` gating (§1.7) must be built in **both** repos together.
