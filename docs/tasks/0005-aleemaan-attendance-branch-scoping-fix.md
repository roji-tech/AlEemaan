# [0005]: Attendance branch-scoping fix (code-review findings) and the route-role guard

- **Period / Focus:** 2026-10-11 (security fix on the attendance port)
- **Status:** Completed
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/fix-attendance-branch-scoping` → `dev` / [PR #17](https://github.com/roji-tech/AlEemaan/pull/17), [#18](https://github.com/roji-tech/AlEemaan/pull/18), [#19](https://github.com/roji-tech/AlEemaan/pull/19) (the last two merged into their stack bases by mistake), landed in `dev` by [PR #20](https://github.com/roji-tech/AlEemaan/pull/20)
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
- [x] `tests/api/attendance.spec.ts`: **15 passed, 0 failed** (7 existing + 8 new; with `students.spec.ts`: 26 passed; after the per-branch-roles decision, `attendance` + `students` + `route-role-guard`: **32 passed, 0 failed**; `pnpm build` first, `TEST_DATABASE_URL=…/aleemaan_test`, run alongside the Octalve suite). Not run: the tests were not run against the unfixed code, so "failed first" is not shown.
- [x] Existing attendance tests corrected (they signed in as a member of another branch — they only passed because of the bug)

### Module C: Docs
- [ ] Plan "As built — attendance branch scoping", progress tracker, tests/README, this file's results

---

## 4. Unified Verification & Quality Gates
- [x] `tsc --noEmit` clean
- [x] Lint & formatting clean (`pnpm lint`, `pnpm format:check`)
- [x] Production build succeeds (`pnpm build`)
- [x] `tests/api/attendance.spec.ts` passed (15/15)
- [x] Full AlEemaan one-lane run on `claude/route-role-guard` (2026-10-11, 1.1 h): **1096 passed, 3 failed, 18 skipped** (the 18 are viewport-specific designed skips). The 3 failures were all `e2e/shell.spec.ts` expectations that went stale when Settings became a real page (0.5.2): Settings expected as "coming soon" text (desktop), the phone tab bar expected 3 links (now 4), and Settings expected in the More sheet. None is related to this change. The three expectations were corrected and `shell.spec.ts` re-run: **37 passed, 0 failed** (desktop + phone).

---

## 5. Notes, Findings & Deviations
- **Decision 2026-10-11 (maintainer):** a person may hold different roles in different branches and branches are boundaries for staff; the intended end state is branch admins plus superadmins (admin everywhere). Done now: staff act in a branch through the role held there (write check uses the branch role; PARENT/STUDENT memberships give nothing); an ADMIN membership stays school-wide as an interim. **Not done, needs its own design + ADR + additive migration (existing admins backfilled as superadmins):** branch admins/superadmins, and a review of every admin-only route.
- ADR 0012 was reworded accordingly (still Proposed; it amends ADR 0001's last sentence). Lesson recorded: I should have proposed the amendment before coding, as the ADR rules require.
- `tests/unit/route-role-guard.spec.ts` (3 tests) fails when a handler loses `roles:` — checked by temporarily removing the roles from `GET /students`.
- Not in this change (separate tracker items): student import has no row cap and returns raw error text; new routes bypass `validate()`.
- Mutation pass: not run — pending, end of Phase 2.

## 6. Output & Deliverables
- **Commits:** `2dec5ea` (design) · code commit pending
- **PR:** #17 (dev), #18/#19 (stack bases, by mistake), #20 (landed the stack in dev)
- **Docs:** plan, ADR 0012

- **Process note (2026-10-11):** #18 and #19 were merged into their stack bases because `gh pr edit --base dev` failed quietly and I merged without checking the base; #20 landed the stack. Rule for next time: retarget with `gh api -X PATCH .../pulls/N -f base=dev` and check `base.ref` before merging.
