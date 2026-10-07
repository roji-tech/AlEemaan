# 0005 — The last administrator is counted by person, under a row lock
Status: accepted (tests pending) · Decided: Users/invitations port design · Recorded: 2026-10-07

## Context
The school must never be left with no administrator. Two admins demoting or deactivating each other at the same moment can each see "another admin exists" and both succeed. A person can also hold two ADMIN memberships (two branches), which would double-count.

## Decision
`hasAnotherActiveAdmin` selects active ADMIN memberships `FOR UPDATE` and counts **distinct persons**, excluding the person being changed (`src/lib/members/service.ts`). Changing the role of, or deactivating, the last administrator is refused (`LAST_ADMIN`). User management is ADMIN only; it is not delegated to `CAN_MANAGE_USERS` (an open question for the maintainer).

## Consequences
Role changes and deactivations take a lock on admin rows; contention is irrelevant at this school's size.

## Enforced by
Intended: a deterministic lost-race integration test (a held row in a second connection) — **not yet written**.

## Related
Plan "Build design — Users pages and invitations".
