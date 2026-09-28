# Phase 0.5.0 — First-Run Superadmin Setup Wizard: Completion Record

**Status: Done.** Verified against the real repo and a real local Postgres, built together with
Phase 0 (this is a brand-new repo — there was no earlier Phase 0 checkpoint to build this on top of
separately, unlike Octalve Edu where the two were genuinely sequential). Adapted from the same
`proplity` reference implementation Octalve Edu's own setup wizard used
(`octalve-edu/docs/development-history/phases/phase-0.5.0-setup-wizard.md` has the shared reasoning
in more detail); this doc covers only what's different here.

## What's different from Octalve Edu's version

- **No `DEPLOYMENT_MODE` gate.** Octalve Edu's wizard is Solo-only because SaaS mode has a different
  onboarding path; AlEemaan has no SaaS mode at all, so `/api/v1/setup` and `/setup` are always
  reachable until setup completes.
- **No school-name field, no tenant code.** AlEemaan isn't a generic template — it's one specific,
  already-known school. The wizard seeds the four branches by fixed name (`Secondary (English)`,
  `Primary (English)`, `Secondary (Arabic)`, `Primary (Arabic)`) rather than asking for them, and
  there's no tenant code to derive since there's no `Tenant` model at all.
- **The admin's `Membership` anchors to the first seeded branch** (`Secondary (English)`), not to a
  tenant — `ADMIN` is meant to be authorized across every branch at the application layer regardless
  of which branch its own membership row points to. That authorization rule is Phase 1 work, not
  built yet (noted in `prisma/schema.prisma`'s `Membership` comment so it isn't lost).
- **`AuditLog` has no `tenantId`** (nothing to scope by in a single-tenant app) — otherwise identical
  shape to Octalve Edu's.

Everything else — CSRF, in-memory IP rate limiting, Zod validation, the optional `SETUP_TOKEN`
compared with `crypto.timingSafeEqual`, the atomic `SystemSettings.updateMany({ where:
{ setupComplete: false } })` guard, the `{ data, meta, error }` response envelope, the Server
Component page that fails open on a DB error — is the same pattern, same reasoning, as Octalve Edu's
version.

## How it was verified

1. `pnpm prisma migrate dev --name init` → applied cleanly (this was AlEemaan's first migration,
   combined with Phase 0's schema).
2. `pnpm build` → clean, `/api/v1/setup` and `/setup` both listed as dynamic routes.
3. `pnpm dev` (port 3000) + a real `POST /api/v1/setup` → `201`, all four branches created by name,
   the admin `User` + `Membership` (`role: ADMIN`, anchored to `Secondary (English)`) + `AuditLog`
   row all confirmed in the response body.
4. A second `POST` immediately after → `409 ALREADY_COMPLETE`, confirming the atomic guard.
5. `GET /api/v1/setup` afterward → `setupComplete: true`.
6. Test data truncated from the local dev database afterward (`TRUNCATE "AuditLog", "Membership",
   "Branch", "User", "SystemSettings" CASCADE`) so local dev starts clean again.

## What's explicitly not here yet

No email to the new admin. No git repository for this project yet (see `phase-0-foundation.md`) —
nothing here has been committed. The Phase 1 authorization rule for how `ADMIN` actually reaches
across branches (not just where its own membership row points).
