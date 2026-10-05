# AlEemaan — roadmap broken into sub-phases, tasks and steps

Written 2026-10-05. The **working map** under `domain-implementation-plan.md`: the plan holds each phase's *design*; this file
says **what to build, in what order, and how each piece is proven**. A phase still gets its design written into the plan
*before* code, and its record in `phases/phase-X-….md` after. AlEemaan is the **live school** (single tenant, four branches),
so everything below is also constrained by: additive, live-data-safe migrations; no downtime surprises; and the legacy
behaviour that real staff and parents rely on is carried forward deliberately (`legacy-feature-inventory.md`,
`feature-reconciliation-audit.md`).

**Conventions** — IDs are stable (`1.2-T3`). Status: ✅ built and verified · 🟡 partly · ⛔ blocked · ⬜ not started.
**Every sub-phase ends the same way:** design in the plan → tests first (unit / integration / api / e2e / axe both themes) →
code → full suite green → **mutation check** → docs (plan "as built", phase record, `CLAUDE.md`, `tests/README.md`) → push the
branch → PR to `master` only when asked. Shared mechanisms (auth, UI language, permissions) are built in Octalve Edu first and
ported by reading the raw diff; a difference is logged in both plan docs. AlEemaan has **no tenant boundary / RLS** (one school,
branches not tenants) — recorded as a divergence; its roles/audit-append-only hardening may be borrowed later.

## Where we are

| Phase | Status |
| :-- | :-- |
| 0 Foundation · 0.5.0 Setup wizard · 0.5.1 Auth + branches (+ rebuild, + sync to Octalve) | ✅ |
| 0.5.A design language + shell · 0.5.B CSP · 0.5.C password reset · 0.5.D TOTP · 0.5.F dev inbox | ✅ merged |
| 0.5.E account self-service | ✅ merged (PR #8) |
| **0.5.G shared API infrastructure** (pagination, `validate()`, breached-password check, `Dialog`/`SelectField`) — ported from Octalve Edu; prerequisite of the Users pages | ⬜ designed in the plan's "Cross-repo review", not started |
| **0.5.2 School Settings** | ⬜ designed, **awaiting go-ahead** |
| 1 Academic Structure → 2 Student & Staff → 3 Results → 4 Finance → 5 Public site/CMS | ⬜ |
| 0.5.3 Auth completion (force-delete, persistent rate limiting) → 6 Family portal → 7 Migration & cutover | ⬜ |

---

## 0.5.2 — School Settings (the legacy "School Info" tab only)
Design: plan §0.5.2. One global row; nothing academic lives here.
- **A model** — T1 `SchoolSettings` (`id = "global"`, name, principal, phone, motto, address, `updatedAt`); T2 additive migration
  that **seeds the row from the setup wizard's school name** (live-data-safe, idempotent); T3 never nullable "not configured".
- **B API** — T1 `GET /api/v1/settings/school` (any signed-in member); T2 `PATCH` (ADMIN only, validated lengths/phone format,
  trimmed, audited with before/after); T3 limits; T4 tests (401/403/CSRF, validation, audit, concurrency = last write wins with
  `updatedAt` shown).
- **C UI** — T1 Settings screen inside the shell (currently a visible "Soon"); T2 form with per-field errors; T3 success toast and
  focus management; T4 phone layout + axe both themes.
- **D Where it shows** — T1 header/shell name from settings; T2 report-card/letterhead use later (Phase 3); T3 public site (Phase 5).
- **E Verification** — mutations (non-admin can write; audit missing; unvalidated length; seed overwrites an existing value).

## Users pages and invitations (finishes 0.5.E) ⬜
(1) Member list per branch (paged; role/branch filters). (2) **Invite**: hashed single-use link → invitee proves the email and
sets their own password; an existing account attaches only when the invitee accepts while signed in as themselves.
(3) Change role / branch / permissions (`CAN_APPROVE_RESULTS`, `CAN_MANAGE_FINANCE`, `CAN_PUBLISH_CONTENT`, `CAN_MANAGE_USERS`);
(4) deactivate (history survives, sessions revoked); (5) admin-initiated email change; (6) audit; (7) tests incl. an admin
cannot escalate beyond their own authority; (8) port from Octalve.

---

## Phase 1 — Academic Structure (the foundation every later phase reads)
Pure configuration, no student data. **Per-branch** (Arabic branches: two terms; English: three).
| Sub-phase | Content |
| :-- | :-- |
| 1.1 | `AcademicSession` / `Term`, active-term state **per branch** |
| 1.2 | `ClassGroup` (admin-configurable on every branch — fixes the legacy primary-only inconsistency) |
| 1.3 | `Subject` per branch and class group |
| 1.4 | `AssessmentConfig` (CA components + max scores + exam max) with the **snapshot onto each Result** |
| 1.5 | `GradeScale` as data (band → letter → remark; A1–F9 default) |
| 1.6 | Screens: one "Academic setup" area per branch; copy-forward from last session |
| 1.7 | Gate: every branch configurable; rules (one active term per branch, no overlapping bands) enforced by conditional updates |

Steps for each of 1.1–1.5: (1) design in plan (what is branch-scoped, uniqueness, deletion rules — nothing referenced by
results may be deleted, only archived); (2) additive migration; (3) pure rules in `lib/academics/` (unit-tested);
(4) API with `withAuth` (ADMIN / permission), pagination, audit; (5) tests incl. cross-branch isolation (a branch admin cannot
touch another branch if branch-scoped roles are introduced) ; (6) screens; (7) mutations; (8) docs.

## Phase 2 — Student & Staff Records
- **2.1 Student** — T1 model (admission number generated, **not** a Firebase UID; guardian contact); T2 **`Enrollment` as its
  own table** (student + class group + session + status) — no `classGroupId` on `Student`; T3 class-consistency guard (legacy §2.1);
  T4 CSV import (dry-run report, caps) and export (legacy §4.4/4.5) ; T5 screens.
- **2.2 Staff** — T1 profile beyond `Membership` (subjects taught); T2 assignment to branch/class; T3 screens.
- **2.3 Gate** — IDOR tests; imports are idempotent and reversible; live-data rehearsal on a copy.

## Phase 3 — Results & Assessment Workflow
T1 score entry (teacher) validated against the snapshot · T2 submit → approve (`CAN_APPROVE_RESULTS`) → publish (conditional
updates; replaces the plaintext shared-password unlock) · T3 class position computed server-side with correct tie handling ·
T4 server-rendered report-card PDF (letterhead from Settings) · T5 bulk promotion (Third-Term only, average of per-term
averages ≥ 50%, idempotent) by closing and opening **enrollments** · T6 screens · T7 gate: parent/student see only their own
published results; promotion rule matches the legacy golden cases exactly.

## Phase 4 — Finance & Payments
T1 `Invoice` / `Payment` replacing the bare `hasPaid` flag the result checker gates on · T2 manual confirmation first (no
gateway invented) · T3 bulk "reset payment per class" · T4 Paystack engine later (mock checkout, HMAC-SHA512 raw body,
atomic `fulfillPayment`) per plan §0.5.F · T5 receipts · T6 screens · T7 gate: a result is gated by invoice status, never by a
client-side flag.

## Phase 5 — Public Site & CMS
Admissions inquiry form finally wired to a backend (currently cosmetic) · fee browser from CMS content, not `fees-data.js` ·
contact / tour / vacancy forms · spam protection and rate limits · content publish permission (`CAN_PUBLISH_CONTENT`) · SEO,
accessibility, performance budget.

## 0.5.3 — Auth completion
T1 admin force-delete without re-authenticating as the target (`CAN_MANAGE_USERS`) · T2 persistent, Redis-backed rate limiting
behind the existing interface (replacing the in-memory default) · T3 breached-password check · T4 auth-event audit. Urgency tracks
user count: must land before Phase 6.

## Phase 6 — Family / Student Self-Service Portal
One `PARENT` / `STUDENT` login across all four branches (replacing four per-branch result-checker logins) · family view of
children in several branches · published results and invoice status only · notifications · gate: no cross-family access.

## Phase 7 — Data Migration & Cutover
**Blocked on a question for the school first:** what populates the two Arabic branches' data today (no admin/teacher portal
exists for them in the five legacy repos)? Then: T1 mapping of four Firestore projects → one Postgres; T2 dry-run migration on a
copy with reconciliation reports (counts, checksums, spot audits by staff); T3 freeze window and cutover plan; T4 rollback plan;
T5 parallel-run period; T6 decommission the old projects.

## Cross-cutting
Security (mutation pass per phase; advisory routine for Next.js/Prisma; backups and a restore drill **before** real data) ·
CI gates (tsc, ESLint, all test projects, axe both themes) · operations (migrations run by a restricted role as a deploy step;
the dev inbox stays off in production) · docs updated every sub-phase · design-artifact as-built artboards in one pass.
