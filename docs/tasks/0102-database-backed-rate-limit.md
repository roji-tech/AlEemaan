# 0102: The rate limiter counts in the database, so a limit holds across every server instance

- **Period / Focus:** 2026-11-18 (the maintainer, on the family sign-in: "Is /portal really secure?"; decision 3 of 0094: the limits must hold on Vercel)
- **Status:** Built; the record is section 5
- **Priority:** High (it is the limit every sign-in and every guess-able route leans on)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/db-rate-limit` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. The problem

`lib/auth/rate-limit.ts` counted attempts in the memory of the running process. Its own header said that is correct for one long-lived process and wrong for anything with several instances, and `docs/DEPLOYMENT.md` said so for Vercel: "a limit is looser than its number says". Production is on Vercel. Each warm function instance had its own count and a restart started it again, so the sign-in limits (5 per client and pupil, 10 per pupil, 30 per client, per 5 minutes) were a multiple of their number, on the one sign-in whose secrets (a date of birth, the last digits of a phone) can be guessed. More than 30 routes call the limiter (the staff sign-in, the family sign-in, password reset, MFA, every bulk import, the standing actions, the Report tool).

## 2. Decisions

- **D1. The counts are rows in the database** (`RateLimitHit`: `key`, `at`; indexes on `(key, at)` and `at`). The window is the same exact sliding five minutes as before; the count of a key is the number of its rows newer than the window. The three functions keep their names and signatures (`reserveAttempt`, `refundAttempt`, `checkRateLimit`), so no caller changes.
- **D2. A reservation is atomic**: one transaction takes a per-key advisory lock (`pg_advisory_xact_lock(hashtextextended(key, 0))`, released at commit), removes that key's rows past the window, counts, and records only if under the limit. Two requests for one key queue behind each other, so 50 racers still give exactly `limit` winners; different keys never wait. A refused attempt records nothing, so hammering while locked out never extends a lockout (a rule the tests already held).
- **D3. A refund removes the key's most recent row** (as the memory version popped the latest time).
- **D4. Cleanup**: each reservation removes its own key's expired rows, and one in 200 sweeps every expired row, so a key nobody uses again leaves nothing behind.
- **D5. If the database cannot be used the limiter counts in memory** (the old behaviour, the same limits) and says so once in the log: a limiter must not take every sign-in down with it, and must not turn into "no limit". `RATE_LIMIT_STORE=memory` chooses memory on purpose (a single Docker process; a local run that wants no database traffic). The memory implementation stays, exported as `memoryLimiter`, with its size cap.
- **D6. The client's address** is still read only from the header the platform sets (`CLIENT_IP_HEADER`, default `x-real-ip`, which Vercel sets); nothing about that changed.
- **D7. Cost**: one short transaction (lock, delete, count, insert) per limited request, about four round trips to a database in the same region as the functions (fra1 and Neon eu-central-1 since #278). Limited routes are the sign-ins and the actions people take a few times a day, not the pages they read.

## 3. Migration (the maintainer's to run: additive, a new table, no existing data touched)

`20261118210000_rate_limit_hit`: `CREATE TABLE "RateLimitHit"` and its two indexes. Until it has run on a database, the limiter finds no table, falls back to memory and says so once: nothing breaks, and the limits are as loose as they were.

## 4. Tests

`tests/unit/rate-limit.spec.ts`: the whole set of rules (exactly `limit` winners then refusals, a refused attempt does not extend the lockout, the window slides, refund hands back one, an empty refund is harmless, check reads without reserving, keys are independent, 50 concurrent racers give exactly `limit`) now runs against **both stores**; plus: the count is in the database and not in the process (wiping the process's memory changes nothing, so another instance sees the same count), a refused attempt is not a row, a refund removes exactly one row, expired rows are removed when the key is used again, keys' rows are their own, and when the database cannot be used the limit still holds in memory with no error to the caller. The memory cap (LRU) test runs on the memory limiter.

## 5. Build record and tests

Gates in this order: `tsc --noEmit` clean; `eslint` on the changed files clean; `next build` clean; `prettier --check` on every changed file clean.

Unit, the WHOLE project, one worker as CI runs it, against a scratch database (`aleemaan_ratelimit_test`) migrated with `prisma migrate deploy`, so the new table `RateLimitHit` was really there: **1375 of 1375 passed** (1.4 minutes). The first run used four workers and had one failure in an unrelated spec (`communication-gateways`, a foreign-key error): the specs share one database and the config's default is one worker, so that run was my mistake and is not a result; the rerun with the default is the record.

What the new tests prove (`tests/unit/rate-limit.spec.ts`; the rules loop runs once for each store, so the database store obeys exactly the rules the memory store does): the limit counts hits inside a sliding five-minute window for a key and no other; a refunded attempt is given back; two `reserveAttempt` calls racing for the last place cannot both win (the database store takes a transaction-scoped advisory lock per key); expired rows are deleted; the rows are really in the table; and when the database cannot be used (the call is stubbed to throw) the limit still holds, counted in memory, the caller sees no error and the warning is logged once.

Not run: the e2e and API projects (nothing outside `lib/auth/rate-limit.ts` changed its callers' behaviour: their signatures are the same and they were not edited); a load test of the database store with many instances at once.

**Until the migration runs, nothing is lost:** the store falls back to memory with one log line, exactly as before this change. Run it the usual way after the production merge.
