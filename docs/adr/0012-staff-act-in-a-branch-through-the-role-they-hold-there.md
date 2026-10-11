# 0012 — Staff act in a branch only through the role they hold there; people data is scoped to role and branch

Status: Proposed
Decided by: — (drafted by an agent; the maintainer chose per-branch roles on 2026-10-11, acceptance pending) · Date: 2026-10-11
Recorded: 2026-10-11
Amends: 0001 (its last sentence, "a role applies school-wide; withAuth checks that a membership with the role exists, not which branch") — see Consequences

## Context

ADR 0001 made the branch "not a security boundary" and roles school-wide, and said that per-branch restriction would need a new ADR. The attendance port (PR #15) and the student routes were built as if that held, which produced real flaws found by code review on 2026-10-11: a staff member with no membership in a branch could read or write that branch's roll call (a missing role defaulted to `TEACHING_STAFF`); the attendance upsert could overwrite another branch's record; and `GET /students` and `/students/[id]` had no `roles` at all, so any signed-in user (STUDENT, PARENT, no membership) could read every student with guardian contacts. The maintainer then decided (2026-10-11) that a person may hold different roles in different branches (a teacher in Primary, non-teaching in Secondary) and that branches are boundaries for staff.

## Decision

- **A person acts in a branch only through the STAFF role they hold in that branch** (`Membership(userId, branchId, role)`). No membership in the branch, or only a STUDENT/PARENT membership there, is the same 404 as an unknown branch. There is no default role.
- **Writes use the branch role**, not "a teacher somewhere": marking attendance needs ADMIN or TEACHING_STAFF *in that branch*.
- **Student list and detail** require a staff role and show only the branches where the caller holds a staff membership.
- **Interim, until the next ADR:** an ADMIN membership in any branch still administers every branch (as 0001). The maintainer's intended end state is branch admins (admin in their own branch) plus superadmins (admin everywhere); that needs its own design, an additive migration that backfills existing admins as superadmins, a review of every admin-only route, and a superseding ADR.
- Marking only accepts non-archived students with an ACTIVE enrolment in the branch's active session, listed once, and never overwrites another branch's record; one helper (`lib/auth/branch-access.ts`) decides.

## Alternatives Considered

- **Keep 0001 (school-wide roles) and only close the role gap on student reads:** rejected by the maintainer; staff of one branch should not see or edit another's pupils.
- **Make `branchId` part of the unique key `(branchId, studentId, date)`:** rejected for now; it changes a unique index on a live table. The in-transaction branch check gives the same protection without a migration.
- **403 for a branch the caller does not belong to:** rejected; it confirms the branch exists.
- **Make ADMIN branch-bound now:** deferred; it needs the superadmin concept first or the live school's administrators lose access.

## Consequences

- A teacher who works in two branches needs a membership in each (ADR 0007 allows it).
- `withAuth({ roles })` still means "a membership with this role somewhere"; routes that act on a branch must also check the branch role. The route-role guard test (`tests/unit/route-role-guard.spec.ts`) forces every handler to declare `roles:` or an allowlist reason, but does not check the branch role: that stays a review item for each new branch-scoped route.
- ADR 0001's status becomes "partly superseded by 0012" when this is accepted.
- **Revisit if:** branch admins and superadmins are built (supersede the interim ADMIN rule), or attendance moves to per-class teacher assignment.

## Enforced by

`pnpm exec playwright test tests/api/attendance.spec.ts tests/api/students.spec.ts --project=api` (branch-scoping and who-may-read blocks, incl. a teacher in one branch and non-teaching in another) and `tests/unit/route-role-guard.spec.ts`.

## Binds

- `src/lib/auth/branch-access.ts`
- `src/lib/attendance/service.ts`
- `src/app/api/v1/attendance/route.ts`
- `src/app/api/v1/students/route.ts`
- `src/app/api/v1/students/[id]/route.ts`
- `tests/api/attendance.spec.ts`
- `tests/api/students.spec.ts`
- `tests/unit/route-role-guard.spec.ts`
