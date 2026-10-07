# 0006 — Mutation passes for new work are deferred to the end of Phase 2
Status: accepted · Decided: by the maintainer · Recorded: 2026-10-07

## Context
Through 0.5.G each phase ended with a mutation pass (inject the bug a test catches, see it fail). It is slow on this CPU-capped machine.

## Decision
Mutation passes for the work after 0.5.G (the Users/invitations port, and Phase 1 and 2) run **together at the end of Phase 2**. Until then each design lists its mutations, and docs say **pending** — the work is not called mutation-tested.

## Consequences
Survivors are found late; keep the lists current. Runner: `scripts/mutations/run-mutations.py` (needs a `_test` database and a clean tree).

## Enforced by
Convention; `/home/rojitech/Desktop/CODEC/out/tasks.md`.

## Related
Octalve ADR 0007 · `phases/phase-0.5.G-api-infrastructure.md` (the last pass run).
