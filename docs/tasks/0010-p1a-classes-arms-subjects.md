# [0010]: P1a - classes, arms, subjects and offerings (ported to branches)

- **Period / Focus:** 2026-10-14 (port of Octalve Edu; design: plan "Build design - Slice P1")
- **Status:** Completed - full suite 1164 passed / 5 failed / 18 skipped; the 5 re-run green (see 3)
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
- [x] A first screen, pulled forward so the work can be driven in a real browser: `/academics` (admin nav item), `ClassesPanel` - pick a branch, classes with arms and subjects, new/edit/archive for classes, arms and subjects, "which subjects does this class study", an "unmatched enrolments" notice; read-only for teachers; a parent gets "no branch with staff access". `sendJson` gained `PUT` (the Octalve copy already had it). `tests/e2e/academics-structure.spec.ts` (5 tests x desktop + phone + setup = 11) with axe on the page and dialogs in BOTH themes; screenshots in `out/screenshots/aleemaan-academics-{dark,light}.png`.
- [ ] The rest of the screens is slice P1d; assessment and grading P1b; staff P1c.

## 3. Verification
Targeted: 12 + route guard 7 passed after `pnpm build`; typecheck, lint, prettier clean. Full suite (one worker, all projects, 1.2 h): **1164 passed, 5 failed, 18 skipped.** The 5: (1) `attendance.spec.ts:442` - caused by MY new API spec, which closed the branch's other ACTIVE session and never restored it; fixed (the spec now restores it) and re-run green in the same order. (2-5) three mobile specs (`responsive-and-a11y` Branches x2, Account) and `https/host-cookie` - the sign-in did not reach /dashboard within 5 s (the screenshot shows the form still on "Signing in..."). The machine's load average was about 14 because an unrelated project was using the CPU; all four passed on re-run (229 passed in the targeted re-run). Cause NOT proven beyond that evidence. Then the new browser spec: two failures were my own sloppy locators (an `.or()` matching two elements; a text match that also hit the success notice), fixed in the test; 11 passed. Passing on re-run is not proof these four cannot recur under load. Mutation passes NOT RUN - pending, end of Phase 2.
