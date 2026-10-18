# 0027: UI History Dialog in Review Tab & Results Branch State Synchronization

- **Period / Focus:** 2026-10-17 (Academics / Results Review Workflow & Multi-Branch UX)
- **Status:** Completed
- **Priority:** High
- **Assignee:** Antigravity Agent
- **Target Branch / PR:** `claude/task-0027-review-history-dialog`
- **Started:** 2026-10-17 22:45:00 UTC
- **Ended:** 2026-10-17 23:02:00 UTC
- **Duration:** 17m

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Provide administrators reviewing academic results in the Review tab (`ReviewPanel.tsx`) with an interactive audit history modal to inspect transitions, grader/approver identity, score edits, unlock reasons, and timestamps via `GET /api/v1/academics/results/[id]/history`. Synchronize the selected branch across Results tabs (`Enter`, `Review`, `Report cards`) so navigating between tabs does not reset branch context.

## 2. Context & Related Docs
- Resolves open items in `docs/open-items.md`:
  - `A history dialog in the Review tab (the history API exists)`
  - `The Review/Enter screens keep the branch choice per section; switching a tab resets it to the first branch.`
- Backed by Slice P2a/P2b database models: `ResultAudit` (`prisma/schema/academics.prisma`).
- Service layer: `resultHistory` in `src/lib/academics/results-workflow.ts`.

---

## 3. Work Breakdown

### Sub-phase A: Workflow Service & Audit Model Enhancement
- [x] Extend `resultHistory` query in `src/lib/academics/results-workflow.ts` to include `actor` (`name`, `email`) relation on `ResultAudit`.
- [x] Return `actorName` and `actorEmail` while maintaining strict backwards compatibility for `actorUserId`.

### Sub-phase B: Results Screen Branch Synchronization
- [x] Lift / synchronize `selectedBranchId` state into `ResultsSections.tsx`.
- [x] Update `EntryPanel`, `ReviewPanel`, and `CardsPanel` to accept optional `selectedBranchId` and `onSelectBranch` without breaking standalone props.
- [x] Fix Tailwind class warning in `EntryPanel.tsx` (`min-w-160`).

### Sub-phase C: Interactive History Dialog in Review Tab
- [x] Add "View history" action button on each (class arm, subject) group card in `ReviewPanel.tsx`.
- [x] Implement accessible `HistoryDialog` (`<Dialog>` with focus trap, Escape to close, responsive layout).
- [x] Fetch student result overview for the selected group from `/api/v1/academics/result-sheets`.
- [x] Allow selecting any student in the group to view their individual result audit timeline.
- [x] Render audit badges for all state transitions: `ENTERED`, `SUBMIT`, `APPROVE`, `PUBLISH`, `RETURN`, `REVERT`, `LOCK`, `UNLOCK`.
- [x] Show score diffs (`fromTotal` ➔ `toTotal`), actor names/roles, formatted timestamps, and reason quotes.

### Sub-phase D: Verification & Quality Gates
- [x] `tsc --noEmit` / typecheck clean (0 errors)
- [x] `pnpm test:unit` all unit tests pass (306/306 passed)
- [x] `pnpm build` clean production build (72/72 routes compiled successfully)
- [x] `pnpm lint` and `pnpm format:check` clean (0 warnings / 0 errors)
- [x] `tests/api/results-workflow.spec.ts` (9/9 passed)
- [x] `tests/e2e/results-screens.spec.ts` (13/13 passed)

---

## 4. Output & Deliverables
- **Files Modified:**
  - `src/lib/academics/results-workflow.ts`
  - `src/components/results/ReviewPanel.tsx`
  - `src/components/results/ResultsSections.tsx`
  - `src/components/results/EntryPanel.tsx`
  - `src/components/results/CardsPanel.tsx`
  - `docs/tasks/0027-p2-review-history-dialog.md`
  - `docs/tasks/current-tasks.md`
  - `docs/open-items.md`
  - `docs/HANDOVER.md`
  - `/home/rojitech/Desktop/CODEC/out/tasks.md`
