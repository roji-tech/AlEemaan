# [0012]: P1c - staff records and teaching assignments (ported to branches)

- **Period / Focus:** 2026-10-14 (design: plan "Build design - Slice P1c", refining decision 8 of Slice P1)
- **Status:** [~] In Progress - built; full suite **(running)**
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p1c-staff-assignments` -> `dev`
- **Started:** 2026-10-14 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
How the branch knows its staff - including people who never sign in - and who teaches which subject to which arm. The foundation P2 (results authorship) and P3 (timetable) stand on.

## 2. Work Breakdown
- [x] Design committed alone first (plan "Build design - Slice P1c"). Deviation from decision 8: two staff categories (TEACHING / NON_TEACHING), as in Octalve; a guard or driver is NON_TEACHING with no account.
- [x] Migration `20261014110000_staff_assignments` (additive; run before the code; applied to the test DB): `StaffRecord` and `StaffSubjectAssignment` with composite `(branchId, id)` keys; the account link is a composite FK `(userId, branchId)` to `Membership` so only a member of the same branch can be linked; CHECKs (names, phone, lower-cased email); partial unique indexes (one account per record per branch, live emails unique per branch ignoring case); unique assignment triple.
- [x] `lib/academics/staff.ts`: list / get / create / edit / archive / restore (archive refused while assignments exist), link / unlink / list linkable accounts (active member of the same branch, role matching the category: TEACHING -> TEACHING_STAFF, NON_TEACHING -> NON_TEACHING_STAFF, one account one record), add / remove assignment (the arm's class must study the subject; everything live and in the branch). Races are answered by the indexes (P2002 -> 409), and the link is a conditional update. Every change is audited.
- [x] Routes through `withBranch` under `/api/v1/staff`: `GET/POST`, `[id]` `GET/PATCH`, `archive`, `restore`, `account` (`GET` linkable, `PUT` link, `DELETE` unlink), `assignments` `POST`, `assignments/[assignmentId]` `DELETE`. Read = staff role held in the branch; write = administrator of the branch; another branch's record is the same 404 as an unknown id; a branch named in a body is 403.
- [x] Tests: `tests/integration/staff-assignments.spec.ts` (5), `tests/api/staff-assignments.spec.ts` (4). **NOT seen failing first** - written after the code and all passed on the first run; a spec that never failed proves less, and the mutation pass is where that gets checked (pending).
- [ ] Screens (People/Staff section) are slice P1d. Teachers' attendance remains unrestricted by assignment (separate decision for the maintainer).

## 3. Verification
Targeted after `pnpm build`: integration 5 + API 4 + route guard (unit) passed; typecheck, lint, Prettier clean. Full suite: **(running)**. Mutation passes NOT RUN - pending, end of Phase 2.
