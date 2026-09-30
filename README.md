# AlEemaan

Replacement system for Aleeman School (Nigeria) — one school, four branches, built on the same
architecture as [Octalve Edu](../../OCTALVE/octalve-edu), but single-tenant.

**AI agent (or human) picking this up cold: read [`CLAUDE.md`](CLAUDE.md) first**, not this file —
it has the actual reading order, which docs to keep updated, and the relationship to the sibling
`Octalve Edu` project (same stack, multi-tenant, now shares this project's own auth implementation
as the reference for its own still-unbuilt auth).

The current live system is 5 separate vanilla HTML/JS repos, each its own Firebase project
(`docs/legacy-feature-inventory.md` has the full factual inventory). This repo is the replacement,
being built alongside the live system — see the standing decision in
[`docs/development-history/aleemaan_progress.md`](docs/development-history/aleemaan_progress.md):
the legacy repos are not patched, only referenced.

They're checked out locally at `out/`, but **not tracked in this repo** — see
[`docs/legacy-repos.md`](docs/legacy-repos.md) for why and the exact clone commands. Run those
first if `docs/legacy-feature-inventory.md`'s file references need to resolve to something real.

## Stack

Next.js (App Router) + TypeScript + Tailwind + Prisma/PostgreSQL, hand-rolled auth against
database-backed sessions (hashed tokens, no Auth.js — see
[`domain-implementation-plan.md` §0.5.1.5](docs/development-history/domain-implementation-plan.md))
— same core mechanism as Octalve Edu, minus the multi-tenancy machinery (no `Tenant` model, no RLS,
no `[code]` routing): there's exactly one school here, modeled as one `Branch` row per legacy
section.

## Getting started

```bash
docker compose up -d     # local Postgres (5434) + Redis (6381) — see docker-compose.yml comments
cp .env.example .env      # fill in secrets
pnpm install
pnpm prisma migrate dev
pnpm dev
```

## Status

Foundation, the first-run setup wizard, and auth (login/logout/branch management) are done — see
[`docs/development-history/phases/`](docs/development-history/phases/) for the completion records
and [`docs/development-history/aleemaan_progress.md`](docs/development-history/aleemaan_progress.md)
for the current, honest state (most of the app doesn't exist yet). Auth was fully rebuilt 2026-09-30
against a hardened design shared with Octalve Edu — see
[`phases/phase-0.5.1.5-auth-rebuild.md`](docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md).

## Docs

- [`CLAUDE.md`](CLAUDE.md) — start here; the real reading order and living-vs-stable file map.
- [`docs/legacy-feature-inventory.md`](docs/legacy-feature-inventory.md) — factual feature inventory
  of all 5 legacy repos.
- [`docs/legacy-repos.md`](docs/legacy-repos.md) — how to check out `out/` locally (not tracked
  here).
- [`docs/feature-reconciliation-audit.md`](docs/feature-reconciliation-audit.md) — a second-pass
  audit of the legacy inventory against the PRD's MVP feature-reconciliation table; found 15 gaps
  not yet merged into the canonical PRD.
- The PRD lives in a Claude Doc (not yet synced to this repo as `docs/PRD.md` — tracked as an open
  item in the progress tracker).
- [`docs/development-history/`](docs/development-history/) — the build plan and what's actually
  built, checked against the real repo.
- Octalve Edu's [`docs/auth-review-2026-09-29.md`](../../OCTALVE/octalve-edu/docs/auth-review-2026-09-29.md)
  — the two-AI security review this project's own auth rebuild was built against.
