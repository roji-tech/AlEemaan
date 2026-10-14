# [0011]: P1b - assessment schemes and grade scales (ported to branches)

- **Period / Focus:** 2026-10-14 (design: plan "Build design - Slice P1", decisions 6 and 7)
- **Status:** [~] In Progress - built; full suite **(running)**
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p1b-assessment-grading` -> `dev`
- **Started:** 2026-10-14 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
How a mark is built (continuous-assessment components + exam = total) and how a score becomes a grade, per branch and versioned so that history cannot be rewritten once results exist (Slice P2).

## 2. Work Breakdown
- [x] `lib/academics/scoring.ts` + `tests/unit/scoring-rules.spec.ts` copied unchanged from Octalve Edu (pure rules: `toHundredths`, `checkScheme`, `snapshotScheme`, `checkBands`, `gradeFor`).
- [x] Migration `20261014100000_assessment_grading` (additive; run before the code; applied to dev + test DBs): `AssessmentScheme`, `AssessmentComponent`, `GradeScale`, `GradeBand` with composite `(branchId, id)` keys; CHECKs; one live scheme per scope (branch default or one class) and one live default scale per branch (partial unique indexes); **lock triggers** - a locked scheme/scale keeps its name, totals, version, scope and components/bands forever, whichever code writes (only archiving, and for a scale the default flag, may change). No RLS (AlEemaan's guard is `withBranch`).
- [x] `lib/academics/assessment.ts`: create / edit-in-place (unlocked only) / new version (locked only; predecessor archived, default moves with it) / archive for schemes and scales, make-default, `lockScheme` / `lockScale` (first caller: P2), the WAEC-style template (A1..F9) offered to the administrator, never inserted silently. The rule's own messages reach the caller as a 400; conflicts are 409.
- [x] Routes through `withBranch`: `assessment-schemes` GET/POST, `[id]` GET/PATCH, `[id]/versions`, `[id]/archive`; `grade-scales` GET/POST (the GET also returns the template), `[id]` PATCH, `[id]/versions`, `[id]/default`, `[id]/archive`. Read = staff role in the branch; write = administrator of the branch; another branch 404 (URL / looked-up id) or 403 (named in a body).
- [x] Tests: `tests/integration/assessment-grading.spec.ts` (6: composite keys, impossible numbers, one-live-default indexes, lock triggers on schemes and scales), `tests/api/assessment-grading.spec.ts` (7). NOT seen failing first (written with/after the code); the lock-trigger test did catch my own API-test cleanup trying to delete a locked scheme (a test bug, fixed by a truncating reset).
- [ ] Screens (Assessment and Grading sections) are slice P1d. The CA/exam split per branch is chosen by the administrator when the first scheme is created (legacy: secondary 30/70, primary 40/60) - nothing is seeded.

## 3. Verification
Targeted: integration 6 + unit scoring (16) + API 7 + route guard passed after `pnpm build`; typecheck, lint, prettier clean. Full suite: **(running)**. Mutation passes NOT RUN - pending, end of Phase 2.
