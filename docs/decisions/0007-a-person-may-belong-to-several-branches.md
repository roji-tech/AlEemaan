# 0007 — A person may belong to several branches
Status: accepted · Decided: by the maintainer, 2026-10-07 (supersedes the "one active membership per person" rule of the Users build design, Decision 1) · Recorded: 2026-10-07

## Context
The first Users design kept **one active membership per person** (inviting or accepting for someone who already belonged somewhere was refused), as the safe reading of an open question. The maintainer answered the question: a person can belong to two branches (a teacher at one, a parent at another, or the same role in both).

## Decision
A person holds **one membership per branch** (the existing `(userId, branchId)` unique key); each has its own role and status. Inviting and accepting are **per (person, branch)**: refused for an active membership in *that* branch (`ALREADY_MEMBER`), for a deactivated membership in that branch, or for a person with deactivated memberships and no active one anywhere (`DEACTIVATED_MEMBER` — reactivation is the way back, never a new link). One open invitation per **(address, branch)**. Roles stay school-wide (ADR 0001); the last administrator is counted by person (ADR 0005); deactivating a membership signs the person out only if it was their last active one (ADR 0002). Moving a membership onto a branch the person already has is `BRANCH_TAKEN`.

## Consequences
The members list has one row per membership. The deactivate response says whether the person was signed out. A person who is a parent in one branch and an administrator in another is an administrator everywhere — by ADR 0001, not by accident.

## Enforced by
`tests/integration/invitations.spec.ts` (another branch invitable, same branch refused, fully-deactivated person refused, two open invitations coexist, accepting adds a second membership), `tests/integration/members.spec.ts` ("a person in several branches"; `BRANCH_TAKEN`; sign-out only on the last), `tests/integration/users-migration.spec.ts` (the per-(address, branch) index), `tests/api/invitations.spec.ts`, `tests/api/members.spec.ts`, `tests/e2e/users.spec.ts`. Migration `20261008090000_invitation_per_branch`.

## Related
Plan "Design change — a person may belong to several branches" · ADRs 0001, 0002, 0005 · `phases/phase-0.5.H-users-and-invitations.md`.
