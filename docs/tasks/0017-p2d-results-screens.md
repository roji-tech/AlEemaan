# [0017]: P2d - the Results screens

- **Period / Focus:** 2026-10-15 (design: plan "Build design - Slice P2d")
- **Status:** Completed (PR #41 merged into `dev`)
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p2d-results-screens` -> `dev` (merged: PR #41)
- **Started:** 2026-10-15 UTC
- **Ended:** 2026-10-15 UTC
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Teachers and administrators can do the whole results journey in the browser: enter marks, submit, review and publish, write remarks, read and print a report card, and open the public verification page from it. No new migration.

## 2. Work Breakdown
- [x] Design committed alone first (plan "Build design - Slice P2d").
- [x] `/results` page (administrators and teachers) with three sections behind the same ARIA tab list as Academics: **Enter marks** (term, class and subject from `result-sheets/options`; a grid with a live total and letter computed in the browser **for display only** while the server recomputes on save; cells flagged when out of range; partial rows block saving with a plain sentence; rows past DRAFT read-only with their status; Save drafts; Submit; clearing a draft row's marks and saving removes the draft), **Review** (administrators: the queue per arm and subject with counts and the actions for a whole group - Approve, Return, Publish, Send back, Lock, Unlock with a reason dialog; the server's refusals, including "not your own entries", are shown in its words), **Report cards** (term, class, student; the card; an administrator's preview of unpublished results; the remarks form, disabled with the reason once published; Print).
- [x] Two small read endpoints, as the design said: `GET result-sheets/options` (the terms of the active session and the subject-and-arm pairs this person may enter - all offered pairs for an administrator, only assigned ones for a teacher) and `GET academics/arms/[id]/roster?periodId=` (the students of an arm for a term). `getSheet` now also returns the scale's bands and `reviewQueue` the ids per status (so an action can act on a whole group).
- [x] `ReportCard` presentation: school header, student block, subjects (CA, exam, total, %, grade, remark), summary tiles (total, average, position, class size), remarks, grading legend, and each published subject's verification link as text. Print: the shell, tabs, page header and controls carry `print:hidden`, so only the card prints (checked by emulating print media). **Deviation from the design:** printing is inline in the Report cards tab (`window.print()`), not a separate `/results/card` page - one less route, same output.
- [x] Nav: a **Results** item for administrators and teachers (`staffOnly`; `navFor` gained a teacher flag fed by the layout), a clipboard icon, `print:hidden` on the sidebar, top bar and bottom bar. **Branches and Settings now live in the More sheet on a phone** (`inMore`; the desktop sidebar is unchanged) so the bottom bar is Overview, Academics, Results, Users + More for an administrator and Overview, Results + More for a teacher - the same overflow problem P1d fixed would otherwise have come back with the sixth item.
- [x] Tests: `tests/e2e/results-screens.spec.ts` (7 per project: both themes of the teacher entry flow and of the administrator review, remarks, card, print and public-page flow; a teacher with no assignments; a parent; the tabs from the keyboard), axe on every section, dialog and the public page; run on desktop and phone: 7 passed each. `shell.spec.ts` updated for the new nav (a stale assertion I own: a teacher's bar and sidebar now have Results; Branches is reached through More on a phone; the "in-app navigation" test uses the Users tab instead of Branches). NOT seen failing first. Found while writing: my own test indexed the wrong table cells, and a `print:hidden` I thought I had added to the tab list had not been applied (the print test caught it).
- [ ] Not done: a per-group history dialog in Review (the history API exists; no screen yet), PDF download, student/parent access, the payment gate, a "Branches" shortcut for superadmins on phones other than More.

## 3. Verification
Targeted after `pnpm build`: results-screens 7 + 7 (desktop, phone), shell 37 passed (12 skipped); typecheck, lint, Prettier clean. Screenshots in `out/screenshots` (`aleemaan-results-entry-*`, `aleemaan-results-card-*`). Full suite (one worker, ~1.2 h): **1275 passed, 1 failed, 18 skipped.** The one failure is `account-self-service.spec.ts:22` (desktop): `signInThroughUi` stayed on `/login` for its 5-second check (the same family of sign-in timeouts seen under machine load in earlier runs; load average about 5 from other programs on this machine). Re-run three times alone: **passed 3 of 3.** I did not change the test or the helper; the cause is NOT proven (load is the likely one; nothing in P2d touches sign-in or the account page). It stays on the watch list with `account-self-service.spec.ts:349`. The 18 skips were not individually re-examined. Mutation passes NOT RUN - pending, end of Phase 2.
