# [0005]: Attendance branch-scoping fix (code-review findings)

- **Period / Focus:** 2026-10-11 (security fix on the attendance port)
- **Status:** In Progress
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/fix-attendance-branch-scoping` / PR not opened yet
- **Started:** 2026-10-11 UTC
- **Ended:** —
- **Duration:** —

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Make attendance reading and marking respect the caller's branch: no cross-branch reads, writes or overwrites, no 500s on bad input.

## 2. Context & Related Docs
- Plan: "Fix design — attendance is scoped to the caller's branch" (committed alone, `2dec5ea`).
- ADR 0012 (Proposed), ADR 0001 / 0007 (roles school-wide, membership per branch), ADR 0003 (additive migrations — none needed here).
- Found by reading the code of PR #15; the review is not a test, so each finding gets a failing-first test.

---

## 3. Work Breakdown

### Module A: Design and decision record
- [x] Fix design committed alone (`2dec5ea`)
- [x] ADR 0012 drafted (Proposed — needs the maintainer)

### Module B: Code
- [x] `lib/attendance/access.ts` — `resolveBranchRole` (no default role)
- [x] Service: active-session check, enrolled-student check, duplicate ids, cross-branch record guard (rolls back), history needs branch membership
- [x] Routes: both use the helper; roll-call GET validates its query
- [x] Addendum A7–A9 (committed alone, `ea34c2a`): student list/detail staff-only and branch-scoped; helper moved to `lib/auth/branch-access.ts`; 3 new tests in `students.spec.ts`
- [x] Tests: new branch-scoping block in `tests/api/attendance.spec.ts` (8 tests) written
- [x] `tests/api/attendance.spec.ts`: **15 passed, 0 failed** (7 existing + 8 new; with `students.spec.ts`: **26 passed, 0 failed**; `pnpm build` first, `TEST_DATABASE_URL=…/aleemaan_test`, run alongside the Octalve suite). Not run: the tests were not run against the unfixed code, so "failed first" is not shown.
- [x] Existing attendance tests corrected (they signed in as a member of another branch — they only passed because of the bug)

### Module C: Docs
- [ ] Plan "As built — attendance branch scoping", progress tracker, tests/README, this file's results

---

## 4. Unified Verification & Quality Gates
- [x] `tsc --noEmit` clean
- [ ] Lint & formatting clean (`pnpm lint`, `pnpm format:check`)
- [x] Production build succeeds (`pnpm build`)
- [x] `tests/api/attendance.spec.ts` passed (15/15)
- [ ] Zero regressions on the rest of the suite — full AlEemaan run **not started** (waits for the Octalve run to finish)

---

## 5. Notes, Findings & Deviations
- Not in this change (separate tracker items): student import has no row cap and returns raw error text; new routes bypass `validate()`.
- Mutation pass: not run — pending, end of Phase 2.

## 6. Output & Deliverables
- **Commits:** `2dec5ea` (design) · code commit pending
- **PR:** not opened
- **Docs:** plan, ADR 0012
