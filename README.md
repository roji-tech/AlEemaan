# AlEemaan

Replacement system for Aleeman School (Nigeria) — one school, four branches, built on the same
architecture as [Octalve Edu](../../OCTALVE/octalve-edu), but single-tenant.

The current live system is 5 separate vanilla HTML/JS repos, each its own Firebase project
(`docs/legacy-feature-inventory.md` has the full factual inventory). This repo is the replacement,
being built alongside the live system — see the standing decision in
[`docs/development-history/aleemaan_progress.md`](docs/development-history/aleemaan_progress.md):
the legacy repos are not patched, only referenced (`out/` holds them, read-only, for migration
purposes).

## Stack

Next.js (App Router) + TypeScript + Tailwind + Prisma/PostgreSQL, Auth.js database sessions — same
as Octalve Edu, minus the multi-tenancy machinery (no `Tenant` model, no RLS, no `[code]` routing):
there's exactly one school here, modeled as one `Branch` row per legacy section.

## Getting started

```bash
docker compose up -d     # local Postgres (5434) + Redis (6381) — see docker-compose.yml comments
cp .env.example .env      # fill in secrets
pnpm install
pnpm prisma migrate dev
pnpm dev
```

## Status

Foundation + the first-run setup wizard are done — see
[`docs/development-history/phases/`](docs/development-history/phases/) for the completion records
and [`docs/development-history/aleemaan_progress.md`](docs/development-history/aleemaan_progress.md)
for the current, honest state (most of the app doesn't exist yet).

## Docs

- [`docs/legacy-feature-inventory.md`](docs/legacy-feature-inventory.md) — factual feature inventory
  of all 5 legacy repos.
- The PRD lives in a Claude Doc (not yet synced to this repo as `docs/PRD.md` — tracked as an open
  item in the progress tracker).
- [`docs/development-history/`](docs/development-history/) — the build plan and what's actually
  built, checked against the real repo.
