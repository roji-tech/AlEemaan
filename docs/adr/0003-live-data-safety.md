# 0003 — Migrations are additive and tests never touch the live database
Status: accepted (the "never run migrate with the default DATABASE_URL" bullet is superseded by 0009) · Decided: from the start of the live school · Recorded: 2026-10-07

## Context
The school's real data lives in the `aleemaan` database on port 5434. A destructive migration or a test helper that truncates tables there is unrecoverable.

## Decision
- Migrations are additive and live-data-safe (new nullable columns, new tables, defaults that keep existing rows valid) and immutable once merged.
- Tests run only against a database whose name ends in `_test`: `TEST_DATABASE_URL="postgresql://roji:roji@127.0.0.1:5432/aleemaan_test"`. Destructive helpers refuse any other name.
- Never run `prisma migrate` / `deploy` with the default `DATABASE_URL`; do not create or alter database roles beyond the init scripts.

## Consequences
A "rename" is add-new, copy, switch, and only later drop. Test runs need the extra environment variable.

## Enforced by
The name check in the test helpers (`tests/README.md`, "TEST_DATABASE_URL … must end in `_test`") and the mutation runner's clean-tree check.

## Related
Plan "Build design — Users pages and invitations", migration paragraph.
