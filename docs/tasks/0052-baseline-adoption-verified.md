# 0052: The one baseline, checked further: the way to adopt it on a database that has data, and the browser projects

- **Period / Focus:** 2026-11-12 (the maintainer: "and we need to resolve the weak spots", after the baseline of task 0051)
- **Status:** Built and tested; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/verify-after-squash` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Close the two weak spots that task 0051 left written down as "not tested, and not claimed": (1) the way to adopt the baseline on a database that already holds the old migration history was documented but never tried; (2) the `https` project and the browser specs (57 e2e files, desktop and phone) had not been re-run on the baseline, and neither had the walkthrough's own project.

## 2. Context

- Task 0051 replaced the 52 migrations with one baseline, `20260928081559_baseline`. A database that applied the old names cannot take it by `migrate deploy`. The documented way round (bring the schema up to date, empty `_prisma_migrations`, `prisma migrate resolve --applied`) was only written down.
- One old history exists in git: `b47df0e` (52 folders), the parent of the squash merge. The baseline is 1 folder. HANDOVER section 3 says a live remote database has 26 of the old migrations applied (October); the 'October shape' below is the first 26 of the 52.
- HANDOVER section 3 still says a live remote database (`db.prisma.io`, 26 migrations applied as of 2026-10-29); the Vercel project also has a `DATABASE_URL` for Production and Preview exists. It was NOT looked at here either, and nothing in this task touches a hosted database. What this task proves is the procedure, on local throwaway databases.

## 3. Decisions

- **D1. Throwaway databases only.** Made and dropped by the script (`aleemaan_adopt_*`), on the docker Postgres (:5434); the Prisma CLI is pointed at them through `DATABASE_URL` and `DIRECT_URL` in the child process's environment only; nothing is printed that is a secret. No hosted database, no `.env` change.
- **D2. The databases are built the way a real one is built: by Prisma.** `prisma migrate deploy` of the old folders taken from git (`git archive`), so `_prisma_migrations` holds Prisma's own rows and checksums, not a hand-made imitation. One `User` row is inserted before the adoption and must still be there after.
- **D3. The schema is compared as bytes** with the same classification as task 0050: `pg_dump --schema-only --no-owner` (minus the random `\restrict` lines) of the adopted database against a reference made by the baseline alone; CHECK lines that differ only in the bracketing of AND are counted separately and must be the 7 already known; anything else counts as a difference and fails.
- **D4. Four scenarios**, each ending in the same checks: (s1) a database made from the old history (52 folders); (s3) the October shape: the first 26 applied, then brought up with the rest, then adopted; (s4) a negative control: the baseline folder against an old-history database with NO adoption, then recovery; (s5) a variant: `resolve --applied` WITHOUT emptying `_prisma_migrations`. (There is no second old history here, so no counterpart of Octalve's s2.)
- **D5. No product or schema change.** Documentation only.

## 4. Work breakdown

- [x] Design (this file).
- [x] The adoption path, tried on throwaway databases (four scenarios, section 6).
- [x] HANDOVER and the task 0051 record updated: "untried" becomes the verified procedure, with what it does not cover.
- [x] The `https` project and the 57 e2e files (desktop and phone) run on the baseline (section 6): 1 failure, an intermittent contrast scan, read and rerun alone, cause not found.
- [x] Docs: tracker, CLAUDE.md banner.

## 5. Not in this task

- Any hosted database, and looking at the old remote database (HANDOVER section 3). If it exists and holds data, the procedure below is what to try on a COPY of it first.
- A database whose applied migrations differ from the list above (the October database's real list was never seen: "the first 26" is the October shape assumed from the HANDOVER's count).
- Data in the other tables: only a `User` row was used. `migrate resolve` writes only `_prisma_migrations` and the schema check covers every table, constraint and index, so the risk is low, but it was not exercised with data elsewhere.

## 6. Build record and tests

**The procedure that was verified** (local, throwaway databases; on a real database, take a `pg_dump` first):

1. **Bring the database up to the last old state.** Take the old migration folders from git into a scratch project (`git archive b47df0e prisma`), and run `prisma migrate deploy` there against the database: it applies only the folders the database lacks. After this, `_prisma_migrations` lists the old history and the schema is the baseline's schema.
2. **Empty the migration log:** `DELETE FROM _prisma_migrations;`.
3. **In the current checkout, record the baseline as applied without running it:** `prisma migrate resolve --applied 20260928081559_baseline`.
4. **Check:** `prisma migrate status` says "Database schema is up to date!" and `prisma migrate deploy` says "No pending migrations to apply."

**Results** (script kept in the maintainer's private `out/tools/`; one run of 2026-11-12; the reference database, made by the baseline alone, has a schema dump of 8,528 lines):

| Scenario | `_prisma_migrations` before | `resolve --applied` | `status` | `deploy` | Schema against the reference | The `User` row |
|---|---|---|---|---|---|---|
| s1: the 52 old folders | 52 rows, 52 finished | exit 0 | up to date | no pending migrations | 8,528 vs 8,528 lines; 7 CHECK lines differ only in AND bracketing; 0 other | kept |
| s3: first 26, then the rest | 26 rows, then 52 | exit 0 | up to date | no pending migrations | the same: 7 and 0 | kept (inserted at 26 migrations) |
| s5: the 52, log NOT emptied | 52 rows | exit 0 | up to date | no pending migrations | the same: 7 and 0 | kept |

After the adoption `_prisma_migrations` holds 1 row (`20260928081559_baseline`, finished), exactly what a database made from the baseline holds; in s5 it holds 53 (the 52 old ones and the baseline).

**The negative control (s4), and a finding.** `migrate deploy` with the baseline folder against an old-history database, without adopting, **exits 1**: `ERROR: type "AnnouncementStatus" already exists` (code 42710). The attempt changes neither the schema nor the data (0 lines differ, the row is still there), **but it leaves a failed row in `_prisma_migrations`** (53 rows, 52 finished), and from then on every `migrate deploy` and `migrate status` fails with `P3009` until the failure is recovered from. Recovery was tried and works: empty `_prisma_migrations`, `resolve --applied` of the baseline, then `status` is up to date, `deploy` has nothing to do, and the schema and the row are as in the other scenarios (7 and 0 differences). So running `migrate deploy` on an old database by mistake does no damage to the schema or the data, and the way out is the same procedure.

**What this establishes.** For a database made from the old history, and for the October shape brought up first, the documented procedure turns the database into one Prisma regards as up to date on the baseline, with the same schema as a fresh baseline database and the data intact. The variant that keeps the old rows also works; emptying the log is recommended because the result then looks like a fresh database's (one row) and no later reader has to wonder why a folder named in the log does not exist.

**The browser projects, on the baseline.** One run on the production build of `dev` `042f10a` (`setup`, `https`, `e2e-desktop`, `e2e-mobile`), the test database created by the `setup` project from the baseline alone; Playwright's own totals, no retries:

| Projects | Tests run | Passed | Skipped | Failed | Time |
|---|---|---|---|---|---|
| `setup`, `https`, `e2e-desktop`, `e2e-mobile` | 1,061 | 1,012 (setup 1, https 8, e2e-desktop 512, e2e-mobile 491) | 48 (e2e-desktop 13, e2e-mobile 35) | **1** | 58.6 min |

The skipped tests are skipped by condition in the specs (`test.skip(isMobile ...)` and the reverse), not parked.

**The one failure, read on its own.** `tests/e2e/question-bank-screens.spec.ts:196`, "reviewers: a large staff list: with more than 100 teachers the list says it is cut off ...", desktop: `accessibility violations on reviewers (search with a chosen person) [light theme]`, one axe violation, `color-contrast [serious]`, raised by `checkBothThemes` (it sets the theme attribute and scans at once). Rerun alone three times (`--repeat-each=3`): **3 passed**. The cause was **not found**: this spec uses the fixtures that emulate reduced motion (the explanation of the earlier contrast flakes, PR #158, does not apply), and nothing was changed. It is a candidate for an intermittent contrast flake in a light-theme scan; the run that failed also had the machine busy with two Octalve runs. Left as it is, and listed.

**Found while checking: the walkthrough's own project was red on `dev`** (not part of any earlier regression): row `PGR-15` named a migration file the baseline removed, and the Arabic front page `/ar` had no row. That was this squash's miss; fixed in PR #169 (`--project=support`: 34 of 34), and the lesson is in the HANDOVER (a change that removes or adds a page, a nav entry or a file named by a row needs that project in its regression).


**Static gates:** Prettier `--check` clean on the changed files; `verify_catalogs` clean. No code changed in this task.

**Not tested, and not claimed.** Any hosted database; the old remote database of HANDOVER section 3; a database whose applied list differs from the list above; data in the other tables; a rollback of an adoption (take a `pg_dump` first). The four scenarios ran once, on PostgreSQL 16.15, Prisma 6.19.3.
