# 0010 — Commit and PR messages are comprehensive
Status: accepted · Decided: by the maintainer · Recorded: 2026-10-08

## Context
Short messages lose the reasoning, the deviations, and what was and was not tested, which the next person or AI needs.

## Decision
Every commit has a clear subject and a body: what changed and why, design decisions and deviations, bugs found and how they were fixed, migrations, and exactly which tests and gates ran with results (and what did not). Every PR adds a summary by area, risk spots for review, migration notes, test evidence with counts, what was not done, open questions and how to verify.

## Consequences
Longer messages; a docs-only commit still gets a body.

## Enforced by
Review.

## Related
0008.
