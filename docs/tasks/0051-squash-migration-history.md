# 0051: The whole migration history becomes one baseline

- **Period / Focus:** 2026-11-11 (the maintainer: "squash all", then "squash both": Octalve's migrations and AlEemaan's; everything is scrappable)
- **Status:** Built and tested; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/aleemaan-squash-all` / PR into `dev` (NOT `master`: `master` is what Vercel serves)
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Replace the 52 migrations on `dev` with ONE baseline migration that produces exactly the same schema, so a new database is built by one file and the history is not something anyone has to run in order.

## 2. Context

- The maintainer said there is no production or preview database and that everything is scrappable. **The repository says otherwise for AlEemaan:** `docs/HANDOVER.md` section 3 lists a live remote database at `db.prisma.io` with 26 migrations applied (the latest `20261018150000_staff_extended_fields`, as of 2026-10-29), and the Vercel project has a `DATABASE_URL` for Production and for Preview and a Prisma/Vercel Postgres integration (read with `vercel env ls`, names only, 2026-11-11). The deployment's build is `prisma generate && next build`, which does not run migrations, so no deploy touches that database. Whether it still exists, holds anything that matters, or has had more of the 52 applied since October was NOT checked (that needs its connection string, which I did not pull).
- An applied migration is never edited, merged or squashed. This task does it at the maintainer's explicit word, on `dev` only.
- **What it means for a database that already holds the old history:** `prisma migrate deploy` on it fails (the baseline would run on tables that exist). The way to adopt a squashed history on a database that has data is to bring it up to the baseline's schema first (apply the old migrations it is missing, from git: `git show b47df0e:prisma/migrations/<name>/migration.sql`), then empty `_prisma_migrations` and run `prisma migrate resolve --applied 20260928081559_baseline`, which records the baseline as applied without running it. **That path was not tried here**; the alternative the maintainer named is to drop and recreate the database.
- A plain concatenation of the 52 files does not work: three of them add enum values (`"StandingSubject" PARTICIPANT`, `"EnrollmentStatus" EXPELLED`, `"Permission" CAN_VIEW_FORM_RESULTS`) and later files use them, which Postgres refuses in one transaction (tried: `unsafe use of new value "PARTICIPANT"`).
- The 52 migrations write no data (applied to an empty database they leave every table empty) and AlEemaan has no row-level security, no roles and no grants in its migrations, so a schema-only baseline loses nothing.

## 3. Decisions

- **D1. The baseline is a dump of the final schema:** `pg_dump --schema-only --no-owner` of a database the 52 migrations were applied to one file at a time, as Prisma applies them.
- **D2. Three edits to the dump, and no others.** (1) The `\restrict` / `\unrestrict` lines (psql-only, written by `pg_dump` 16.15) and the `set_config('search_path')` and session `SET` lines are removed, keeping `SET check_function_bodies = false` with a `RESET` at the end. (2) The string literals that hold a carriage return, a form feed and a non-breaking space (the trim sets of some CHECK constraints: five of one kind, two of another) are written as `E' \t\r\n\f\v '` and `E' \t\r\n'` escapes, as the originals were, so no tool that normalises line endings or invisible characters can change them. (3) A header.
- **D3. The name is `20260928081559_baseline`**, the first migration's timestamp.
- **D4. What is lost, and where it is:** the comments that explained each hand-written statement and the order they were made in: git history (`git show b47df0e:prisma/migrations/<name>/migration.sql`) and the task records under `docs/tasks`.
- **D5. The proof is the schema, compared as BYTES:** database A (the 52 originals one by one) against database B (the baseline alone), `pg_dump --schema-only`, byte for byte; a control must differ; a reload of B's dump must be a fixed point. Then a fresh test database (my own, `aleemaan_sq_test`; the shared `aleemaan_test` was not touched) is built by Prisma's `migrate deploy` and the unit, integration and API projects run on it.
- **D6. Tests that read a migration file** (six specs under `tests/integration`) cannot read files that no longer exist. What they asserted about the FILE ("additive": no `DROP`, no `INSERT`; the backfill SQL replayed on legacy rows) is removed; what they asserted about the DATABASE stays. The one worth keeping that was a file check, "the list of stores in the check is exactly the list the code knows", is ported to read the check from the migrated database.
- **D7. Nothing else changes:** no `schema.prisma` change, no application code.

## 4. Work breakdown

- [x] Design (this file).
- [x] The baseline migration; the 52 folders removed.
- [x] Byte-exact schema equality with a control and a fixed-point check.
- [x] A fresh test database migrated by `migrate deploy`; unit, integration and API projects pass.
- [x] The six specs no longer read a migration file; what was removed is listed.
- [x] Docs: HANDOVER, CLAUDE.md banner, tracker.

## 5. Not in this task

- Octalve (its own repository, its task 0050, merged).
- Looking at, or changing, the live remote database.
- `master` and the Vercel deployment: this goes to `dev` only.

## 6. Build record and tests

**Built on** `claude/aleemaan-squash-all`. New: `prisma/migrations/20260928081559_baseline/migration.sql` (7,637 lines: a header and the final schema). Removed: the 52 migration folders. Changed: six specs under `tests/integration` (D6, listed below). No `schema.prisma` change, no application code.

**Proof that it is the same schema, compared as bytes.** Database A: the 52 originals applied one by one with `psql -1`. Database B: the baseline alone. `pg_dump --schema-only --no-owner` of both (minus the random `\restrict` token lines), byte for byte: **8,521 of 8,528 lines identical; the other 7 are CHECK constraints that differ only in the bracketing of AND chains** (the originals used `BETWEEN`, which Postgres keeps as a nested AND; reloading the dump text flattens it; AND is associative), **and no other difference.** The seven lines that hold the trim literal (carriage return, form feed, non-breaking space) are byte-identical in A and B. A control (the first 51 originals) differs by 2 lines (the last migration is small), so the comparison can fail. The dump of B loaded into a fresh database and dumped again is identical to the dump of B (a fixed point). Scratch databases dropped. Nothing in A is data.

**Proof that Prisma applies it.** My own test database `aleemaan_sq_test` (the shared `aleemaan_test` was not touched; `TEST_DATABASE_URL` pointed at mine) was created and migrated by the setup project with `prisma migrate deploy`: the baseline is the only migration.

**What the build found.**
- **A plain concatenation of the 52 files does not work:** in one transaction it fails at `unsafe use of new value "PARTICIPANT"` (three migrations add enum values and later files use them). Hence a dump (D1).
- **The same bug of mine as in Octalve's task 0050:** my first baseline was generated by a script that read the dump in text mode, which turns a carriage return into a newline, so seven CHECK constraints would have trimmed one character fewer; and the comparison I first ran read both dumps the same way and could not see it. Octalve's test suite found it first (`source-hygiene` failed on the form feed left in the file); I then regenerated this baseline byte-exactly with the literals written as `E'...'` escapes and redid the comparison on bytes (the numbers above), before any test of this repository ran.
- **Six specs under `tests/integration` read specific migration files** by name, which no longer exist, and the first test run failed with `ENOENT` on the first of them. Removed: the two "additive" tests of `question-bank-core.spec.ts` and the two of `question-bank-foundation.spec.ts` (no `DROP`, no `INSERT`; the tables a file touches), the "additive" test of `approval-scopes.spec.ts`, the migration replay of `super-admin.spec.ts` (every active administrator becomes a superadmin, and running it twice changes nothing more), the replay of `users-migration.spec.ts` (an applied migration changes no existing row), and the backfill test of `academic-structure.spec.ts` (classes and arms made from the legacy `className` and `arm` strings). **That is 9 tests of the 61 in these files, all about the content of files that no longer exist or about backfilling legacy data that a baseline never meets.** One was ported: "the list of stores in the database check is exactly the list of stores the code knows" (`question-bank-core.spec.ts`) now reads the check from the migrated database with `pg_get_constraintdef`. Every rule those files assert about the DATABASE (keys, checks, names, triggers) stays.
- `prisma migrate diff` against the schema is not clean in this repository (it was not tried here for AlEemaan; Octalve's is not clean for the same kind of reason), so it is not used as a gate.

**Tests.** On the baseline, in my own fresh test database: unit, integration and API projects **2,736 passed, 0 failed** (1.0 hour; includes `source-hygiene`). Browser (`academics-structure`, `promotion-flow`, `progress-records`, `programs`, `landing-screens`, desktop and phone): **111 passed, 0 failed** (7 minutes). **Mutation check of the ported test**, each change applied alone to the test database and restored: the store check without `'memory'` fails it; the store check with an extra `'extra'` fails it; the unmutated and the restored runs pass (2 of 2).

**Static gates:** `tsc --noEmit` clean; `eslint` clean on the six edited specs; Prettier `--check` clean on them and on this file; `verify_catalogs` clean.

**Not tested, and not claimed.** The other 51 browser spec files and the walkthrough project were not re-run (the schema is identical by dump). Nothing was run against the live remote database, and it was not looked at. A database that already holds the old migration names was not tried (expected to fail). `prisma migrate resolve --applied` (the way to adopt the baseline on a database that has data) was not tried. The inline comments of the 52 originals are only in git history.
