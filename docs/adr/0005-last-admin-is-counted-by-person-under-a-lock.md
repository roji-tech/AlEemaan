# 0005 — The last administrator is counted by person, under a row lock
Status: accepted (built in 0.5.H; tests written) · Decided: Users/invitations port design · Recorded: 2026-10-07

## Context
The school must never be left with no administrator. Two admins demoting or deactivating each other at the same moment can each see "another admin exists" and both succeed. A person can also hold two ADMIN memberships (two branches), which would double-count.

## Decision
`hasAnotherActiveAdmin` selects active ADMIN memberships `FOR UPDATE` and counts **distinct persons**, excluding the person being changed (`src/lib/members/service.ts`). Changing the role of, or deactivating, the last administrator is refused (`LAST_ADMIN`). User management is ADMIN only; it is not delegated to `CAN_MANAGE_USERS` (an open question for the maintainer).

## Consequences
Role changes and deactivations take a lock on admin rows; contention is irrelevant at this school's size.

## Enforced by
`tests/integration/members.spec.ts`: the last administrator cannot be demoted or deactivated; one person with two ADMIN memberships counts once; two administrators demoting, and two deactivating, each other at the same instant leave exactly one (repeated rounds). `tests/api/members.spec.ts`: the same race over HTTP.

## Related
Plan "Build design — Users pages and invitations".
