# Phase 0 — Foundation: Completion Record

**Status: Done.** Verified against the real repo on 2026-09-28, not assumed from the plan. Mirrors
Octalve Edu's own Phase 0 process (`octalve-edu/docs/development-history/phases/phase-0-foundation.md`)
almost exactly, adapted for a single-tenant schema.

## What was built

- Scaffolded via `pnpm create next-app` into a temp directory (the target directory's name,
  `AlEemaan`, has capital letters `create-next-app` rejects for a package name), then moved into
  place — `package.json`'s `name` field set to `aleemaan`. Next.js 16.3.6 (App Router), React 19.2.8,
  TypeScript, Tailwind v4, `src/` directory, `@/*` import alias, ESLint 9. pnpm as the package
  manager, matching Octalve Edu's convention.
- Prisma pinned directly to 6.19.3 from the start (skipping the rc-detour Octalve Edu's own Phase 0
  hit and documented — same reasoning applies here without needing to rediscover it).
- `prisma/schema.prisma`: Auth.js's four required models, a `Branch` model (the four legacy
  sections: Secondary/Primary × English/Arabic — no `code` field, since nothing routes on it, unlike
  Octalve Edu's `Tenant`), `Role`/`Permission` enums (`Permission` identical to Octalve Edu's own
  `§1.7` addendum — shared design), and `Membership` (branch-scoped; see the schema's own comment on
  the still-open question of how `ADMIN` reaches across branches — Phase 1 authorization work, not
  answered yet).
- `docker-compose.yml`: local-only Postgres 16 + Redis 7, on host ports 5434/6381 (5432/5433 and
  6379/6380 are already taken on this machine — 5433/6380 specifically by `octalve-edu`'s own
  containers).
- `.env.example`: every variable currently needed, none filled in.
- `.gitignore`: fixed `.env*` also silently ignoring `.env.example` (added `!.env.example`, same bug
  Octalve Edu's Phase 0 hit and fixed). Separately, moved `/out/` out of the "next.js" section and
  re-documented it: this app doesn't use `output: "export"`, so it was never really a Next.js
  static-export collision — `out/` here holds 5 cloned legacy repos kept purely as local migration
  reference. Decided **not** to track them in this repo (each is its own git repo — already public
  under `github.com/ajiboladev`, and embedding 5 nested `.git` dirs as gitlinks would be messy for no
  benefit), so `/out/` stays gitignored, just for a different, explicit reason than the default
  template's.
- `README.md`: replaced the `create-next-app` boilerplate with a real project README.
- No git repository initialized yet in this directory (the scaffold's own temp `.git` was
  deliberately left behind in `/tmp`, not copied in) — tracked as an open item, not done silently.

## What's explicitly not here yet

No RLS (not needed — single tenant), no Auth.js wiring beyond the schema, no API routes beyond
`/api/v1/setup` (built alongside this phase — see `phase-0.5.0-setup-wizard.md`), no UI beyond the
default scaffold page and the setup wizard, no git repository, no `docs/PRD.md` synced from the
canonical Claude Doc.

## How it was verified

1. `pnpm install` → clean, Prisma pinned at 6.19.3 (not the 8.0.0-rc `latest` dist-tag).
2. `docker compose up -d` → both containers started.
3. `pnpm prisma migrate dev --name init` → applied cleanly against the real local Postgres,
   `prisma/migrations/20260928081559_init/` created.
4. `pnpm build` → clean production build, 0 TypeScript errors.
