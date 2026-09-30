# AlEemaan — Development Progress Tracker

Last Updated: 2026-09-30 (auth rebuilt against the hardened shared design — see "Auth realigned to
Octalve Edu's design" below; repo pushed to https://github.com/roji-tech/AlEemaan, public)

Companion to `docs/development-history/phases/*.md` (one completion record per finished phase) and
the PRD (currently only a Claude Doc — see "Known gaps" below). Mirrors the structure of Octalve
Edu's own `docs/development-history/octalve_edu_progress.md` — tracks _what's actually built_,
checked against the real repo, not what a plan says should exist.

---

## Overall Status Summary

- **Planning**: the PRD exists as a Claude Doc (13 sections: Overview, Legacy System Context, School
  Structure, Users/Roles/Permissions, MVP Scope & Feature Reconciliation, Academic & Results
  Workflow, Finance & Payments, Public Site & CMS, Technical Architecture, Data Migration & Cutover,
  Security & Compliance, Rollout Plan, Open Risks). Not yet synced to this repo as `docs/PRD.md` —
  tracked below.
- **`docs/legacy-feature-inventory.md`**: done, 308 lines, factual inventory of all 5 legacy repos.
- **`docs/feature-reconciliation-audit.md`**: done 2026-09-28 — a full line-by-line re-read of the
  inventory against the PRD §5 table, found 15 real gaps (features §5 never mentioned at all: the
  online admissions form, the fee-structure browser, report-card PDF export, `AssessmentConfig` as
  its own model, forgot-password flow, admin force-delete, and more) plus 2 corrections to existing
  rows. **Not yet merged into the canonical PRD** — the Claude Doc's §5 is stale by these rows until
  Claude Docs is reachable again.
- **Phase 0 — Foundation**: **100% Complete.** Next.js 16 + TypeScript + Tailwind scaffold,
  Prisma 6.19.3 + PostgreSQL (originally scaffolded with Auth.js's standard tables; `Account` was
  later dropped and `Session` reshaped in the 2026-09-30 auth rebuild, see below) plus
  `Branch`/`Role`/`Permission`/`Membership`, local dev `docker-compose.yml` (ports 5434/6381).
  `pnpm build` clean, first migration applied against a real local Postgres. See
  `docs/development-history/phases/phase-0-foundation.md`.
- **Phase 0.5.0 — First-run superadmin setup wizard**: **100% Complete.** Seeds all four branches +
  creates the first `ADMIN`, verified live end-to-end including the idempotency guard. See
  `docs/development-history/phases/phase-0.5.0-setup-wizard.md`.
- **`domain-implementation-plan.md`**: created 2026-09-28 — design-first from here on, not
  code-first. Already caught one real correction before it shipped silently: Auth.js v5 refuses
  `Credentials` + database sessions outright, recorded in the plan alongside the fix.
- **Phase 0.5.1 — Minimal auth (login/logout) & branch management**: **100% Complete, then fully
  rebuilt 2026-09-30 — see Phase 0.5.1.5 below, which supersedes the original build described
  here.** Originally: hand-rolled login/logout against Auth.js's own `Session` table, `requireAdmin()`,
  and admin-only `GET`/`POST /api/v1/branches`. See
  `docs/development-history/phases/phase-0.5.1-auth-and-branches.md` for that original record (now
  historical — the code it describes no longer exists as written).
- **Phase 0.5.1.5 — Auth rebuilt against the hardened, Octalve-Edu-shared design**: **100%
  Complete, verified live 2026-09-30.** Auth.js dropped entirely (`next-auth`/`@auth/prisma-adapter`
  removed); replaced with a hand-written `src/lib/auth/session.ts` storing hashed (SHA-256) session
  tokens, a timing-safe login compare (`src/lib/auth/password.ts`), and a rate limiter fixed against
  three real bugs (untrusted IP header, check-then-record race, unbounded memory growth). Full
  record, including the exact live verification sequence run: 
  `docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md`.
- **Everything else** (TOTP MFA, forgot-password, the Settings model, the rest of Core SIS + Finance
  per the PRD's MVP feature-reconciliation matrix, the public-site CMS, data migration from the 4
  Firestore projects): **0% — not started.** Settings is being designed next (not built) — see
  `domain-implementation-plan.md`'s Phase 0.5.2 once it's written.

---

## Known gaps (tracked, not lost)

- **`docs/PRD.md` not synced, and now also stale by 15 rows.** The Claude Docs MCP connection this
  was drafted through is currently disconnected in this session — next time it's reachable: (1) sync
  `docs/PRD.md` the same way Octalve Edu's PRD was transcribed, and (2) merge
  `docs/feature-reconciliation-audit.md`'s findings into the canonical §5 table, both in the Claude
  Doc and the local sync.
- ~~No git repository yet.~~ **Resolved 2026-09-28**: `git init`, committed, pushed to
  `github.com/roji-tech/AlEemaan` (public). `out/` (the 5 legacy repos) is deliberately not tracked
  — see `docs/legacy-repos.md` for why and how to check them out locally; README and
  `legacy-feature-inventory.md` both link to it now so a fresh clone from GitHub doesn't silently
  reference a directory that isn't there.
- ~~No `domain-implementation-plan.md`.~~ **Resolved 2026-09-28**: created, Phase 0.5.1 designed and
  built against it. Phase 1 (Core SIS + Finance) and Phase 0.5.2 (Settings) still need their own
  design passes before any code, per the same document.
- **No branches-and-environments convention.** Octalve Edu has one
  (`octalve-edu/docs/branches-and-environments.md`, `dev`/`main`/`prod`); AlEemaan doesn't have a
  CI/CD or branching decision made yet, and inventing one here would be getting ahead of a real
  decision — add it once there's an actual answer, not before.
- ~~Phase 1's open authorization question (how `ADMIN` reaches across every branch).~~ **Resolved
  2026-09-28**: any `Membership` with `role: ADMIN` grants access regardless of which branch it
  anchors to (`src/lib/auth/require-admin.ts`).

## Next action

Phase 0.5.2 (School Settings) is designed in `domain-implementation-plan.md` — **not implemented
yet**, waiting on confirmation before any code, per the design-first rule this document now follows.

`domain-implementation-plan.md` now also has a full **Phase 1 → 7 (+ 0.5.3) roadmap** (2026-09-28,
revised same day), breaking what was one vague "Phase 1 (Core SIS + Finance)" bullet into 7
dependency-ordered phases: 1 (Academic Structure), 2 (Student & Staff Records), 3 (Results & Assessment
Workflow), 4 (Finance & Payments), 5 (Public Site & CMS), 0.5.3 (auth completion — forgot-password,
admin force-delete, persistent rate limiting — repositioned right before Phase 6, not first, once it
became clear it sits on no one's critical path), 6 (Family/Student Self-Service Portal), 7 (Data
Migration & Cutover). Full model-level design is still deferred to each phase's own pass, written
immediately before that phase is built — the roadmap is the map, not 7 designs at once. Next up in
sequence: **Phase 1 (Academic Structure)**, the actual dependency root.

Phase 1's design was also cross-checked against [1EdTech's OneRoster](https://www.1edtech.org/standards/oneroster)
standard (2026-09-28) — not adopted wholesale, but two real improvements taken from it: `Enrollment`
becomes its own model (replacing a `classGroupId` field on `Student` and the legacy system's
`promotionHistory` array-append with a queryable per-session enrollment history), and grade bands
become a `GradeScale` model instead of a hardcoded WAEC-legend constant, consistent with
`AssessmentConfig` already being admin-editable data. OneRoster's `course`/`class` split was
deliberately *not* adopted — nothing in the legacy inventory shows more than one section per class,
so modeling for it now would be designing ahead of a real need.

**Prisma schema is now multi-file** (2026-09-28): `prisma/schema.prisma` split into
`prisma/schema/{schema,auth,branch,setup}.prisma` (Prisma's "schema folder" mode, stable since 6.7, no
preview flag needed on the installed 6.19.3), with a new `prisma.config.ts` pointing the CLI at the
folder — same convention already used by `octalve-ims`. `pnpm prisma validate` and `pnpm prisma
generate` both verified clean against the split. Every future phase's models get their own file
(`academics.prisma`, `students.prisma`, `results.prisma`, `finance.prisma`, `cms.prisma`) rather than
growing one large file.

Separately: sync `docs/PRD.md` once Claude Docs is reachable again, and merge
`feature-reconciliation-audit.md`'s findings into its canonical §5.

## Auth realigned to Octalve Edu's (now more-hardened) design (2026-09-30)

`domain-implementation-plan.md` §0.5.1.5 (new): Octalve Edu's auth plan is now canonical for both
projects, after a two-AI security review found real issues in AlEemaan's shipped login/session code
(`octalve-edu/docs/auth-review-2026-09-29.md` has the full record) that got fixed in Octalve Edu's
*plan* before AlEemaan's *code* was patched to match. Eight concrete changes are now specified for
AlEemaan's shipped code — not yet applied:

1. Rate limiter: trust only a proxy-set IP header (not client-suppliable `X-Forwarded-For`), fix the
   check-then-record race (reorder to reserve-before-await — no Redis needed for AlEemaan's
   single-process deployment), cap the `attempts` Map's size, layer three rate-limit keys instead of
   one.
2. Hash `Session.sessionToken` before storing it (currently plaintext).
3. Dummy-hash `bcrypt.compare` on every login failure path (real timing side-channel currently
   present).
4. Cookie: `__Host-` instead of `__Secure-`, scheme-aware `secure` flag instead of `NODE_ENV`-tied,
   logout deletes with matching attributes (current version may silently fail in production HTTPS).
5. Email case-insensitivity enforced at the database level, not just in application code.
6. Password max length (128 chars) to guard the 72-byte bcrypt truncation point.
7. Session lifecycle: rotation, per-user cap, revoke-on-change, absolute expiry, purge job, plus
   schema columns for an eventual devices page.
8. Auth.js's own maintenance status (now under Better Auth, security-patches-only) is an open
   question for Octalve Edu's still-unbuilt auth, not an urgent one for AlEemaan's already-shipped
   code — explicitly deferred, not ignored.

**Applied 2026-09-30 — done, verified live, not a patch but a full rebuild.** All 8 items above are
built: hashed session tokens, the timing-safe dummy-hash compare, the fixed rate limiter (trusted
`X-Real-IP` only, reserve-then-refund, size-capped), `__Host-`/scheme-aware cookies, password max
length, and the `Session` lifecycle columns. Auth.js (`next-auth`, `@auth/prisma-adapter`) was
**dropped entirely**, not just unmounted — the hashed-token requirement has no clean path through
Auth.js's Prisma adapter, which looks sessions up by the raw cookie value. Replaced with a
~90-line `src/lib/auth/session.ts`. Full record: `docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md`.
Still not done (deliberately, not forgotten): DB-level email case-insensitivity, absolute
session-timeout + purge job, the active-devices UI, MFA, and the still-undecided Better Auth
question (Octalve Edu's to answer first).
