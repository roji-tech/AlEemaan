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
- **Phase 0 — Foundation**: **100% Complete.** Next.js 16 + TypeScript + Tailwind scaffold,
  Prisma 6.19.3 + PostgreSQL with Auth.js's tables plus `Branch`/`Role`/`Permission`/`Membership`,
  local dev `docker-compose.yml` (ports 5434/6381). `pnpm build` clean, first migration applied
  against a real local Postgres. See `docs/development-history/phases/phase-0-foundation.md`.
- **Phase 0.5.0 — First-run superadmin setup wizard**: **100% Complete.** Seeds all four branches +
  creates the first `ADMIN`, verified live end-to-end including the idempotency guard. See
  `docs/development-history/phases/phase-0.5.0-setup-wizard.md`.
- **Everything else** (Auth.js wiring beyond the schema, the rest of Core SIS + Finance per the
  PRD's MVP feature-reconciliation matrix, the public-site CMS, data migration from the 4 Firestore
  projects): **0% — not started.** No phase-by-phase implementation plan like Octalve Edu's
  `domain-implementation-plan.md` exists yet for AlEemaan — this repo has gone straight from PRD to
  Phase 0/0.5.0 without that intermediate planning document. Worth doing before Phase 1 starts, same
  way Octalve Edu did it, so schema decisions aren't invented ad hoc mid-build.

---

## Known gaps (tracked, not lost)

- **`docs/PRD.md` not synced.** The Claude Docs MCP connection this was drafted through is currently
  disconnected in this session — sync it the next time it's reachable, the same way Octalve Edu's
  PRD was transcribed.
- ~~No git repository yet.~~ **Resolved 2026-09-28**: `git init`, committed, pushed to
  `github.com/roji-tech/AlEemaan` (public). `out/` (the 5 legacy repos) is deliberately not tracked
  — see `docs/legacy-repos.md` for why and how to check them out locally; README and
  `legacy-feature-inventory.md` both link to it now so a fresh clone from GitHub doesn't silently
  reference a directory that isn't there.
- **No `domain-implementation-plan.md`.** Phase 1 (Core SIS + Finance, adapted from Octalve Edu's
  own Phase 1 per the PRD's reconciliation matrix) needs one before it starts.
- **No branches-and-environments convention.** Octalve Edu has one
  (`octalve-edu/docs/branches-and-environments.md`, `dev`/`main`/`prod`); AlEemaan doesn't have a
  CI/CD or branching decision made yet, and inventing one here would be getting ahead of a real
  decision — add it once there's an actual answer, not before.
- **Phase 1's open authorization question**: how `ADMIN` reaches across every branch when its own
  `Membership` row only anchors to one (see `prisma/schema.prisma`'s comment on `Membership`).

## Next action

Either sync `docs/PRD.md` once Claude Docs is reachable again, or write
`domain-implementation-plan.md` for Phase 1 (Core SIS + Finance) directly from the PRD's §5
reconciliation matrix — whichever the next session is asked to do first.
