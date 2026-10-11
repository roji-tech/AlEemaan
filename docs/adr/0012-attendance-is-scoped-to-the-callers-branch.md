# 0012 — Attendance is scoped to the caller's branch; marking only accepts enrolled students of that branch

Status: Proposed
Decided by: — (drafted by an agent; awaiting the maintainer's acceptance) · Date: —
Recorded: 2026-10-11

## Context

AlEemaan is one school with several branches, and a person's role applies school-wide (ADR 0001) while membership is per branch (ADR 0007). The attendance port (PR #15) checked only that the caller held a staff role somewhere, defaulted a missing branch role to `TEACHING_STAFF`, and upserted on `(studentId, date)` without checking the student belonged to the branch. A code review on 2026-10-11 found that any staff member could read or write any branch's roll call, overwrite another branch's record, and read any student's history. See the plan's "Fix design — attendance is scoped to the caller's branch".

## Decision

A caller may touch a branch's attendance only with an `ADMIN` membership anywhere or an **active membership in that branch**; otherwise the answer is the same 404 as for an unknown branch. There is no default role. Marking accepts only non-archived students with an `ACTIVE` enrolment in the branch's active session, listed once; any other id refuses the whole request before a write. An existing record must already belong to the branch. One helper (`resolveBranchRole`) is the only place that decides.

## Alternatives Considered

- **Keep the role-only check and rely on the UI to offer the right branch:** rejected; the API is the boundary and the UI is not trusted.
- **Make `branchId` part of the unique key `(branchId, studentId, date)`:** rejected for now; it changes an existing unique index on a live table. The in-transaction branch check gives the same protection without a migration.
- **Return 403 for a branch the caller does not belong to:** rejected; it confirms the branch exists. 404 matches every other not-found.

## Consequences

- A teacher who teaches in two branches needs a membership in each (ADR 0007 allows it).
- Marking now fails with 409 when a branch has no active session (it already did for reading).
- Existing tests that signed in as a member of a different branch had to be corrected.
- **Revisit if:** attendance moves to per-class teacher assignment (a teacher then sees only their own classes), or the unique key gains `branchId`.

## Enforced by

`pnpm exec playwright test tests/api/attendance.spec.ts` (branch-scoping block: 404 for a foreign branch, whole-request refusal for a foreign student, no overwrite of another branch's record, no active session, malformed date, admin still reaches all).

## Binds

- `src/lib/attendance/access.ts`
- `src/lib/attendance/service.ts`
- `src/app/api/v1/attendance/route.ts`
- `src/app/api/v1/students/[id]/attendance/route.ts`
- `tests/api/attendance.spec.ts`
