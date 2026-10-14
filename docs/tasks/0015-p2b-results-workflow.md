# [0015]: P2b - results review workflow

- **Period / Focus:** 2026-10-14 (design: plan "Build design - Slice P2", merged as PR #37)
- **Status:** [~] In Progress - built; full suite **(running)**
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p2b-results-workflow` -> `dev`
- **Started:** 2026-10-14 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Results move DRAFT -> SUBMITTED -> APPROVED -> PUBLISHED -> LOCKED under the rules of the design, with the back-steps and the unlock, every step audited, every batch all-or-nothing.

## 2. Work Breakdown
- [x] Migration `20261014130000_results_workflow` (additive; run before the code; applied to the test DB): `ResultAudit.actorUserId` becomes nullable (NULL = "the system"); a trigger on `AcademicSession` locks every PUBLISHED result of a session's terms when the session becomes CLOSED, with a history row - whichever code closes it (it is closed from three places in the app), so a closed year can never keep an unlocked published result.
- [x] `lib/academics/results-workflow.ts`: the whole machine as one table (`RULES`): submit (author or an administrator), return, approve, revert, publish, lock, unlock (administrators; `approve` refuses results the actor entered or submitted unless the actor is a superadmin; `unlock` needs a reason of 5+ characters). A batch runs in one transaction with the rows `FOR UPDATE` in id order, refuses wholesale if any row is in the wrong status, and writes a `ResultAudit` row for each step. Publish makes a 256-bit token and a SHA-256 of the canonical content plus the publish time. `resultHistory` and `reviewQueue` (counts by status per arm and subject).
- [x] Routes: `POST results/transition` (`withBranch(staff-write)`; unknown ids, ids of another branch and ids spanning branches are one 404; a non-administrator asking for an administrator's step is 403), `GET results/[id]/history` and `GET results/queue` (administrators). New `ForbiddenError` (403) beside `ConflictError`.
- [x] Tests: `tests/api/results-workflow.spec.ts` (9: the whole road incl. token/hash and unlock clearing them, back-steps and edit-after-return, who may do what, no self-approval incl. entered-by-teacher-submitted-by-admin and the superadmin exception, wrong-status 409 and all-or-nothing, the one 404, validation, the queue), plus a close-the-term test in `tests/integration/results.spec.ts` (now 10). NOT seen failing first (written with the code). One assertion of mine was wrong (a teacher asking for history gets the role guard's 403, not 404) and was corrected to the real, consistent behaviour - not a code change.
- [ ] **Deviation / clarification of the design:** `unlock` also works on a PUBLISHED (not yet locked) result, with a reason, because otherwise a published result could not be corrected until its term closed. Design said unlock from LOCKED only.
- [ ] Not done: the report card and verification page (P2c), the screens (P2d), the payment gate.

## 3. Verification
Targeted after `pnpm build`: API workflow 9 + integration results 10 + route guard passed; typecheck, lint, Prettier clean. Full suite: **(running)**. Mutation passes NOT RUN - pending, end of Phase 2 (targets: the RULES table, the no-self-approval check, the all-or-nothing count, the session-close trigger).
