@AGENTS.md

# AlEemaan — orientation for whoever (or whatever) picks this up next

This file exists so a fresh AI session with access to this repo (and its sibling, Octalve Edu) can
get productive in minutes, not hours. Read this whole file before touching code. It tells you what
to read next, in what order, which files are living documents you must keep current, and which are
stable references you can trust without re-verifying. `@AGENTS.md` above is Next.js's own
auto-generated framework-version notice — unrelated to this file, don't edit it, `next dev` rewrites
it.

## What this project actually is

AlEemaan is a from-scratch replacement for a real, currently-live school-management system (Aleeman
School, Ibadan, Nigeria) — one school, four branches (Secondary/Primary × English/Arabic), currently
run on 5 separate vanilla-HTML/Firebase repos with no shared identity between branches. This is
**single-tenant** — exactly one school, ever. Do not add multi-tenancy here; that's the other project.

**Read `docs/legacy-feature-inventory.md` before assuming you know what the old system does** — it's
a factual, no-opinion catalog of all 5 legacy repos, extracted from their actual source. The legacy
repos themselves live at `out/` (gitignored, not in this repo — see `docs/legacy-repos.md` for the
exact `git clone` commands to check them out locally if you need to read the original code directly).

## The sibling project: Octalve Edu — read this section, it matters

`/home/rojitech/Desktop/CODEC/OCTALVE/octalve-edu` is a separate but deliberately parallel project:
same stack (Next.js 16, TypeScript, Prisma 6.19.3/Postgres, hand-rolled auth against database
sessions), same architect, built alongside this one — but **multi-tenant** (many schools in one
database, Postgres RLS for isolation) where AlEemaan is single-tenant. The two projects share design
decisions on purpose, and as of 2026-09-30 **Octalve Edu's auth design is canonical for both** — see
`docs/development-history/domain-implementation-plan.md` §0.5.1.5 for the full reasoning. This means:

- A security finding in one project's auth almost certainly applies to the other's — check the
  sibling's `docs/auth-review-*.md` files before assuming a fix here is complete.
- A schema/API convention decided in one project (e.g. `{ data, meta, error }` response envelope,
  multi-file Prisma schema under `prisma/schema/`, admin-role-crosses-every-branch semantics) is
  meant to match the other unless a section explicitly says why it diverges (this project's
  single-tenancy is the main deliberate divergence).
- **Before starting any auth or schema work here, check whether Octalve Edu's own
  `docs/development-history/domain-implementation-plan.md` has moved ahead of this one** (or vice
  versa) — whichever project's plan is more recently revised on a shared topic is probably the one to
  sync from.

Two more repos show up in comments/history but are **not siblings to keep in sync with** — they're
one-off pattern sources, referenced once for a specific technique and then done:
- `/home/rojitech/Desktop/CODEC/NextJS/proplity` — where the first-run setup-wizard pattern and the
  atomic-conditional-update bootstrap race-guard came from. Also has its own real auth implementation
  reviewed in detail 2026-09-30 (`proplity/docs/auth-review-2026-09-30.md`) — worth reading for what
  a JWT+refresh-token architecture gets right (timing-safe compare, reuse-detection/rotation) and
  wrong (a real logout-doesn't-revoke bug), but **do not port its JWT+refresh model here** — database
  sessions were a deliberate, audit-driven choice, not an oversight.
- `/home/rojitech/Desktop/CODEC/OCTALVE/ims` — where the multi-file Prisma schema convention
  (`prisma/schema/*.prisma` instead of one `schema.prisma`) came from.
- `/home/rojitech/Desktop/CODEC/NextJS/TheNiche` — where the mobile bottom-tab-bar dashboard pattern
  (used in the Figma-like design artifact, not yet in real code) came from.

## Read in this order, first session

1. **This file.**
2. **`docs/development-history/aleemaan_progress.md`** — the single source of truth for "what's
   actually built right now," checked against the real repo, not what any plan says should exist.
   Has a "Next action" section at the bottom — that's the actual todo list.
3. **`docs/development-history/domain-implementation-plan.md`** — the step-by-step build plan.
   Design-first: every phase gets designed here *before* it's coded. Read whichever phase section is
   currently "next" before writing any code for it.
4. **`prisma/schema/*.prisma`** — the actual current data model. This is ground truth; if a doc and
   the schema disagree, the schema is right and the doc is stale (fix the doc).
5. **`docs/development-history/phases/*.md`** — one completion record per finished phase, for history
   and reasoning you don't need to re-derive. Skim titles, read the ones relevant to what you're
   touching.
6. The PRD — **not yet synced to this repo** (tracked gap, see below). Lives only as a Claude Doc;
   ask the user for the link if you need it and Claude Docs tools are unavailable.

## Files that change constantly — update these every session that changes anything real

- **`docs/development-history/aleemaan_progress.md`** — update its "Last Updated" date and "Next
  action" section after *any* real change (code, schema, or a design decision), not just at the end
  of a phase. This is the first file any future session reads to know current state; letting it go
  stale defeats the entire point of it existing.
- **`docs/development-history/domain-implementation-plan.md`** — add to it *before* writing code for
  a new phase, and correct it in place (with a note on what changed and why, not a silent edit) when
  implementation reveals the design was wrong — e.g. §0.5.1.1's documented mid-flight correction on
  Auth.js's Credentials+database-session incompatibility, or §0.5.1.5's full realignment to Octalve
  Edu's design. Don't let this drift from what's actually built.
- **`prisma/schema/*.prisma`** — grows one file per new domain area as phases are built (see the
  roadmap in `domain-implementation-plan.md`'s "Roadmap: Phase 1 → 7" section for what's coming:
  `academics.prisma`, `students.prisma`, `results.prisma`, `finance.prisma`, `cms.prisma`).

## Files that are stable reference — read once, trust, don't expect them to move

- `docs/legacy-feature-inventory.md` — a frozen factual snapshot of the 5 legacy repos as read on
  2026-09-28. Won't change unless the legacy system itself is re-audited.
- `docs/feature-reconciliation-audit.md` — the second-pass gap analysis against the PRD's original
  §5 table. **Not yet merged into the canonical PRD** (needs Claude Docs MCP reachable) — until then,
  this file is more current than the PRD on feature scope.
- `docs/legacy-repos.md` — exact clone commands for `out/`. Only changes if the legacy repos move.
- `docs/development-history/phases/*.md` — append-only history, never edited after being written.

## Working rules in this repo (follow these without being asked)

1. **Design before code.** Write or extend the relevant phase section in `domain-implementation-plan.md`
   first. If you discover the design was wrong while implementing, fix the doc *and* explain the
   correction inline (see §0.5.1.1 for the pattern) — don't just silently patch the code.
2. **Verify live, not just "it compiles."** Every phase so far has been verified against a real local
   Postgres (`docker compose up -d`, port 5434) with actual `curl`/cookie-jar requests, not just
   `pnpm build` passing. Truncate test data afterward (`TRUNCATE ... CASCADE` via
   `docker exec aleemaan-db-1 psql ...`) so the dev DB starts clean for the next session.
3. **Always update docs in the same pass as the code change** — the progress tracker and, if the
   design changed, the plan doc. Don't treat this as a follow-up task.
4. **Cite reasoning, not just conclusions**, in comments and docs — why a decision was made, not just
   what it is. This whole doc culture exists so nobody (human or AI) has to re-derive a decision that
   was already made once.
5. **Multi-file Prisma schema** (`prisma/schema/*.prisma`, `prisma.config.ts` points the CLI at the
   folder) — add new files per domain area, don't grow one file indefinitely.
6. **Tests ship with the change, and a security test must be seen to fail.** Every security-relevant
   assertion in `tests/` was mutation-checked: inject the bug it claims to catch, confirm the suite goes
   red, restore — and run it *unmutated* first, since a test that fails both ways proves nothing. Drive UI
   changes in a real browser and read the screenshots. The limiter functions are `async`: every call
   must be `await`ed (`if (!reserveAttempt(k))` without it is `!Promise`, always false, and silently
   disables the limit — TypeScript won't flag it).
7. **Keep the sibling in sync.** Auth/session/limiter/password/`withAuth`/UI-primitive files share names
   and behaviour with Octalve Edu on purpose (table in the plan doc, §0.5.1.6). A change to one gets
   ported to — or explicitly logged as a divergence from — the other.

## Current state, as of 2026-09-30 (verify against `aleemaan_progress.md` — it may have moved since)

- Phase 0 (scaffold), 0.5.0 (setup wizard), 0.5.1 (auth + branch management) are built.
- **Auth was fully rebuilt 2026-09-30** against a hardened design (session tokens hashed at rest,
  timing-safe login compare, a fixed rate limiter, `__Host-` cookies) — Auth.js was dropped entirely
  (`next-auth`/`@auth/prisma-adapter` removed). Record:
  `docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md` (committed — `b3ddbcd`; an earlier
  version of this file warned it was still uncommitted, which stopped being true the same day).
- **Then synced to Octalve Edu's built-and-verified implementation (Phase 0.5.1.6) — built and verified,
  on branch `claude/octalve-auth-sync`, awaiting the maintainer's review/merge.** Two-level session
  expiry, DB-enforced lowercase emails, limiter parity, the 72-byte password policy, `withAuth()`
  replacing `requireAdmin()`, `GET /api/v1/auth/me`, security headers, `/login` + `/dashboard` + `/setup`
  screens, and a real test suite. **Read `docs/development-history/phases/phase-0.5.1.6-octalve-sync.md`
  and `tests/README.md` before touching auth or those screens.**
- **There is a test suite: `pnpm test`** (build + Playwright: unit, integration, API, browser at desktop
  and phone sizes, axe accessibility, and a real-HTTPS cookie run). It needs a Postgres
  (`docker compose up -d db`), Chromium (`pnpm exec playwright install chromium`) and `openssl`; it uses
  its own `aleemaan_test` database. Run it before opening a PR.
- Phase 0.5.2 (School Settings) is designed, not built — waiting on a go-ahead.
- Phase 1 (Academic Structure) is next in the roadmap after 0.5.2, and is the real dependency root
  for everything after it (see the plan doc's roadmap section).
- A Figma-like UI design (Login, Branches, Settings, Mobile dashboard, both landing pages) exists as
  a private Claude Artifact, not yet reflected in real frontend code — ask the user for the link if
  you need to reference it; it is not saved anywhere in this repo.

## Known open items (not forgotten, deliberately not yet done)

- PRD not synced to `docs/PRD.md` locally, and the Claude Doc's §5 is stale by
  `feature-reconciliation-audit.md`'s 15 rows — both blocked on Claude Docs MCP being reachable.
- A real open question for the school, not an engineering one: what's actually populating the two
  Arabic branches' data today (no admin/teacher portal exists for them in any of the 5 legacy repos)
  — ask before Phase 7 (migration) gets designed.
- Active-devices UI, MFA, password reset, a nonce-based script CSP — deliberately deferred (listed in
  `phase-0.5.1.6-octalve-sync.md`'s "Explicitly not done"). DB-level email case-insensitivity and absolute
  session expiry + purge were deferred by 0.5.1.5 and are now done (0.5.1.6).
- AlEemaan's own visual identity (from the Figma-like artifact) — the shipped screens use Octalve Edu's
  palette and shared primitives; a re-skin, not yet decided.
