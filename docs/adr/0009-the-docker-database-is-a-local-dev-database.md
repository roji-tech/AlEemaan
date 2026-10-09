# 0009 — The docker `aleemaan` database on port 5434 is a local dev database
Status: accepted · Decided: by the maintainer · Recorded: 2026-10-08 · Supersedes: the "never run `prisma migrate`/`deploy` with the default `DATABASE_URL`" bullet of 0003

## Context
0003 treated the `aleemaan` database on :5434 as the school's real data. The maintainer clarified that it is a local development database, not the live one.

## Decision
The AI has full access to it: it may migrate, reset and use it for dev work. **Unchanged from 0003:** migrations stay additive and live-data-safe (the production school's database receives the same migrations later, and "immutable once merged" still holds), and automated tests run only on databases whose name ends in `_test`.

## Consequences
Dev work no longer needs a separate `aleemaan_dev` database, though it still works. A destructive migration is still a mistake for production.

## Enforced by
The `_test` name check in the test helpers; review of migrations.

## Related
0003 · 0008.
