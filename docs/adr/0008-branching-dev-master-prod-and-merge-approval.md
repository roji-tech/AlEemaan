# 0008 — Development happens on `dev`; `master` needs the maintainer's approval; `prod` is reserved
Status: accepted · Decided: by the maintainer · Recorded: 2026-10-08

## Context
Until now the AI pushed feature branches and opened PRs, and the maintainer merged everything. That made every step wait on a human.

## Decision
- The repository has `dev` (all development), `master`, and a future `prod` (production).
- The AI may push feature branches, open PRs and **merge into `dev`** on its own once the gate (typecheck → lint → format:check → build → tests) has passed, with the evidence in the PR.
- A PR `dev` → `master` is merged only after the maintainer approves **that specific PR** in the session; approval of one PR never covers another. Stacked PRs merge in order.
- Nobody pushes straight to `master` or `prod`. `prod` is not touched until the maintainer defines its flow.
- If a merge is blocked by a permission check, the AI reports it and never works around it.

## Consequences
Faster development on `dev`; `master` stays reviewed. The `dev` branch must be created from `master` and open PRs retargeted to it.

## Enforced by
Convention and the AI's permission checks; branch protection on `master`/`prod` is recommended.

## Related
0006 (mutation passes) · 0009 (databases) · 0010 (messages).
