# AlEemaan — Development Progress Tracker

Last Updated: 2026-09-28 (repo pushed to https://github.com/roji-tech/AlEemaan, public)

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
  Prisma 6.19.3 + PostgreSQL with Auth.js's tables plus `Branch`/`Role`/`Permission`/`Membership`,
  local dev `docker-compose.yml` (ports 5434/6381). `pnpm build` clean, first migration applied
  against a real local Postgres. See `docs/development-history/phases/phase-0-foundation.md`.
- **Phase 0.5.0 — First-run superadmin setup wizard**: **100% Complete.** Seeds all four branches +
  creates the first `ADMIN`, verified live end-to-end including the idempotency guard. See
  `docs/development-history/phases/phase-0.5.0-setup-wizard.md`.
- **`domain-implementation-plan.md`**: created 2026-09-28 — design-first from here on, not
  code-first. Already caught one real correction before it shipped silently: Auth.js v5 refuses
  `Credentials` + database sessions outright, recorded in the plan alongside the fix.
- **Phase 0.5.1 — Minimal auth (login/logout) & branch management**: **100% Complete.** Hand-rolled
  login/logout against Auth.js's own `Session` table (Credentials provider isn't usable with
  database sessions — see the plan doc), `requireAdmin()`, and admin-only `GET`/`POST
  /api/v1/branches`. Verified live end-to-end: login sets the cookie, branches list/create both
  work authenticated and 401 unauthenticated, duplicate names 409, logout actually deletes the
  session row. See `docs/development-history/phases/phase-0.5.1-auth-and-branches.md`.
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

Design Phase 0.5.2 (Settings — School Info, active session/term, per-branch class lists,
`AssessmentConfig`) in `domain-implementation-plan.md` before writing any code for it, per the
design-first rule this document now follows. Separately: sync `docs/PRD.md` once Claude Docs is
reachable again, and write Phase 1's (Core SIS + Finance) own design pass.
