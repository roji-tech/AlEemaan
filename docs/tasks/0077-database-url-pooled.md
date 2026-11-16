# 0077: The app can connect through a pooled address (`DATABASE_URL_POOLED`) while migrations keep using the direct one (`DATABASE_URL`)

- **Period / Focus:** 2026-11-16 (the maintainer, going live on Neon: "can we do something like this [proplity's DIRECT_URL setup] but using DATABASE_URL and DATABASE_URL_POOLED")
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Medium (production database set-up; a serverless app without a pooler can exhaust a database's connection limit)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/database-url-pooled` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Two variables, as the maintainer asked:

- `DATABASE_URL`: the **direct** address. Prisma's command line (`migrate deploy`, `migrate status`, `studio`) and the operator scripts use it, exactly as today.
- `DATABASE_URL_POOLED`: **optional**, the pooler's address (Neon's `-pooler` host). When it is set, the **running app** uses it. When it is not set, nothing changes: the app uses `DATABASE_URL`.

## 2. Why

Every serverless invocation can open its own connections, and a database has a fixed number of them. A pooler in front of it (Neon's PgBouncer) shares them. A pooler in transaction mode cannot hold the session lock `prisma migrate` takes, so migrations must go direct. Proplity (the maintainer's other project) solves this with `DIRECT_URL` for migrations and a pooled `DATABASE_URL`; here the names are the other way round, which keeps every existing set-up (local development, the tests, the hosted projects that hold only `DATABASE_URL`) working with no change.

## 3. Decisions

- **D1. One helper decides.** `runtimeDatabaseUrl(env)` in `src/lib/db-url.ts` answers `DATABASE_URL_POOLED` (trimmed) when it is set and not blank, else `undefined`. `src/lib/db.ts` passes it to `PrismaClient` as `datasourceUrl` only when there is one; otherwise the client reads `DATABASE_URL` from the schema as before. The Prisma CLI and `prisma.config.ts` are not touched and never see the pooled address.
- **D2. It fails closed on a mistake, naming variables and never a value.** The pooled address must start `postgres://` or `postgresql://`; and when `DATABASE_URL` is also set, both must name the **same database** (the path). A staging pooled address left next to a production direct one would otherwise send the app to a different database from the one that was migrated, and the mismatch would show only as strange data. A refusal is a thrown error with a fixed sentence (the module is read when the first request needs the database, so the page fails with that sentence in the log). Not checked: that the two hosts belong to the same server (a pooler's host is the provider's business).
- **D3. A developer's or a deployer's shell can never point the tests or the walkthrough at a hosted database through the new variable.** The harness rewrites `DATABASE_URL` to the `_test` database; a `DATABASE_URL_POOLED` left in a shell or in `.env` would win over it. So `tests/support/env.ts` sets it to the **empty string** in the process (not deleting it: `next start` reads `.env` for any variable that is absent from the environment, and an empty one blocks that) and `serverEnv` sets it empty for every server under test. The walkthrough runner (`scripts/walkthrough-run/run.mjs`) does the same for the server and the build it starts. A blank value means "not set" (D1).
- **D4. The pooled address wants `pgbouncer=true`** (Prisma then avoids prepared statements, which a transaction-mode pooler does not keep). That is a property of the value the deployer pastes, so it is documented in `.env.example` and the deployment guide, not added by code. `channel_binding` is not supported by Prisma's engine as far as is known and is better left off (`sslmode=require` still enforces TLS).
- **D5. No schema, route, migration or behaviour change** for anyone who does not set the new variable.

## 4. Not in this task

Setting the variables on Vercel (the maintainer's, with the secrets); the migration itself (the maintainer's step, on the direct address); Octalve (same adapter question, not asked); a `directUrl` in the Prisma schema (it is not needed: the CLI already uses `DATABASE_URL`).

## 5. Work breakdown

- [x] Design (this file).
- [x] `tests/unit/database-url.spec.ts`: the helper (unset and blank mean none; a value is trimmed and returned; a wrong scheme is refused; a different database name from `DATABASE_URL` is refused; the same name and "no `DATABASE_URL`" are fine; no message repeats a value) and the harness (a `DATABASE_URL_POOLED` in the shell is blank in the process and in `serverEnv`; the walkthrough runner blanks it). Failing first.
- [x] The change: `db-url.ts`, `db.ts`, `tests/support/env.ts`, `tests/integration/startup-secrets.spec.ts`, `scripts/walkthrough-run/run.mjs`.
- [x] `.env.example`, `docs/DEPLOYMENT.md`, `docs/HANDOVER.md`, the function catalogue, tracker TASK-0077.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 6. Build record and tests

**Build record (2026-11-16, worktree `AlEemaan-cloudinary`, off `origin/dev` `5cf40af`; a production build of exactly the tree tested).**

- Gates in order: `tsc --noEmit` clean; `eslint` on the six changed source and test files clean; `pnpm build` exit 0; Prettier `--check` clean (the four existing files were clean at `HEAD`, so `--write` touched only my lines; `.env.example` has no Prettier parser); the catalogue verifier 747 rows, 0 missing (it first reported `src/lib/db-url.ts` missing, and the row was added).
- **Failing first**, `tests/unit/database-url.spec.ts` against a stub that keeps the old behaviour (the pooled address ignored), run with a hosted-looking `DATABASE_URL_POOLED` set in the shell: **7 failed, 1 passed** (the one is the control that "not set means none", true before and after). Each failed for its own reason: the helper answered `undefined` where the pooled address was expected; a wrong scheme and a different database name threw nothing (message empty where `DATABASE_URL_POOLED` was expected); the harness left the shell's hosted address in `process.env` and in `serverEnv`; and neither the walkthrough runner nor the startup-secrets spec blanked it. A first version had one test asserting the process and then the server environment, so the first failure hid the second; it was split before this record was taken.
- **The change:** the same spec **8 passed** (with a hosted-looking `DATABASE_URL_POOLED` still in the shell, which is the point). The whole `unit` project: **1131 passed, 2 failed, 6 did not run**: `communication-gateways` and `communication-templates` call `seedInstance()` and failed with "Authentication failed ... placeholder" because I ran with a placeholder `TEST_DATABASE_URL` (no database), and the 6 depend on them. The earlier `info-tips` failure is gone (task 0076 is on `dev`).

**Not run, and not claimed:** the `api`, `e2e-desktop`, `e2e-mobile`, `integration` and `https` projects (they need the test database and servers; the integration spec that starts servers, `startup-secrets`, only gained one line that blanks the variable); the app **against a real pooler** (no run has used `DATABASE_URL_POOLED` for a real connection; the helper is tested, the connection is not); mutation passes (deferred to the end of PHASE 2). **No migration. Environment: `DATABASE_URL_POOLED` is optional; set it only on a host with a pooler.**

**For the maintainer (open, not changed):** the Vercel Preview `DATABASE_URL` that applies to every branch except `master` was not changed and its value cannot be read from here: check it is not a production database.
