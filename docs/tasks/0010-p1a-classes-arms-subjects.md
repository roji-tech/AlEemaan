# [0010]: P1a - classes, arms, subjects and offerings (ported to branches)

- **Period / Focus:** 2026-10-14 (port of Octalve Edu; design: plan "Build design - Slice P1")
- **Status:** [~] In Progress - built; full suite **(running)**
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p1a-classes-subjects` -> `dev`
- **Started:** 2026-10-14 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Real classes, arms and subjects per branch (replacing, without breaking, the `className` / `arm` strings), as the foundation for assessment, results and the timetable.

## 2. Work Breakdown
- [x] Migration `20261014090000_academic_structure` (additive; run before the code; applied to the dev and test DBs): `ClassGroup`, `ClassArm`, `Subject`, `SubjectOffering` with composite `(branchId, id)` keys; nullable `StudentEnrollment.classArmId`; partial unique indexes for live names / codes; CHECKs; **backfill** of classes and arms from the existing strings (idempotent; display name = the most frequent spelling) and linking of existing enrolments.
- [x] `lib/academics/structure.ts` (+ `structure-http.ts`): create / update / archive for classes, arms and subjects; replace-the-set offerings; `resolveArmId` (case-insensitive) used by the student create and import paths so the strings and the arm agree wherever they can. Duplicate names are a 409 with a message written for the caller; nothing returns exception text.
- [x] Routes (all through `withBranch`, ADR 0015): `GET/POST academics/class-groups`, `PATCH class-groups/[id]`, `PUT class-groups/[id]/subjects`, `POST academics/arms`, `PATCH arms/[id]`, `GET/POST academics/subjects`, `PATCH subjects/[id]`. Read = a staff role held in the branch; write = administrator of the branch; another branch is 404 (URL / looked-up id) or 403 (named in a body).
- [x] Tests: `tests/integration/academic-structure.spec.ts` (5: composite keys, live-name uniqueness incl. archive-frees-name, CHECKs, backfill on legacy-shaped rows incl. rerun); `tests/api/academic-structure.spec.ts` (7). The backfill test was seen failing once, for a real defect (`min()` picked the lowercase spelling as the class name; fixed to the most frequent spelling). The API specs and the other integration tests were NOT seen failing first.
- [ ] Screens are slice P1d; assessment and grading P1b; staff P1c.

## 3. Verification
Targeted: 12 + route guard 7 passed after `pnpm build`; typecheck, lint, prettier clean. Full suite: **(running)**. Mutation passes NOT RUN - pending, end of Phase 2.
