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

## Next action

Two Phase 0.5.2 School Settings model + its (thin) API/audit trail is small enough to implement next
directly from the design above. Separately, and larger: Phase 1 (Core SIS + Finance) needs its own
full design pass — `AcademicSession`/`Term`, `ClassGroup`, `Subject`, `AssessmentConfig` all belong
there, adapted from Octalve Edu's own Phase 1 `sis.prisma` per the PRD's §5 reconciliation matrix —
before any of that gets built, not invented mid-implementation.
