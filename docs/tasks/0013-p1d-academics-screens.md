# [0013]: P1d - Assessment and grading and Staff screens

- **Period / Focus:** 2026-10-14 (design: plan "Build design - Slice P1d")
- **Status:** [~] In Progress - built; full suite 1225 passed
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p1d-screens` -> `dev`
- **Started:** 2026-10-14 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
The screens over the P1b and P1c APIs, so a branch administrator can set up how marks are built and graded and who teaches what, without a developer. No new routes, no migration.

## 2. Work Breakdown
- [x] Design committed alone first (plan "Build design - Slice P1d").
- [x] `/academics` gets three sections behind one ARIA tab list (`AcademicsSections`: Left/Right/Home/End move between tabs; only the active section is mounted): Classes and subjects (unchanged), `GradingPanel`, `StaffPanel`. `common.ts` holds the shared `say()` / types (ClassesPanel now imports them).
- [x] Assessment and grading: scheme list (scope, parts, exam, version, Locked badge), scheme dialog with a live "Adds up to N of 100" line, edit in place / New version when locked / archive; grade-scale list with the band table and Default badge, scale dialog with the WAEC-style template button (offered, never applied silently), Make default, archive. The server's own sentence for a broken rule is shown as returned.
- [x] Staff: search + current/archived filter, record dialog (field-level server messages), manage dialog (link / unlink a sign-in from the branch's linkable members, assign a subject to an arm - only subjects the arm's class studies are offered - and remove). A teacher sees the lists and the manage dialog read-only, no controls.
- [x] Found by looking at the phone screenshots (as the design said I would): (1) the grading band table scrolls sideways on a phone and axe flagged it as not keyboard-reachable (`scrollable-region-focusable`) - the wrapper is now a focusable labelled region; (2) the three section tabs scrolled off-screen on a phone ("Staff" hidden) - they now share the width; (3) **the superadmin's phone tab bar overflowed - "More" was cut off at the right edge** (five tabs + More, made so by P1a's Academics item). Settings now lives in the More sheet on a phone (`inMore` on the nav item; the desktop sidebar is unchanged), so the bar is Overview, Branches, Academics, Users, More.
- [x] Tests: `tests/e2e/academics-grading-staff.spec.ts` (5 tests x desktop and phone, both themes, axe on each section and dialog). NOT seen failing first (written with the screens); real failures found while writing it were mine (wrong branch for a superadmin's test data, a strict-mode locator, "Make default" on an already-default scale) and the axe finding above. `shell.spec.ts` updated for the four-tab bar plus Settings in the sheet (a stale assertion I own, not hidden).
- [ ] Not done: the branch choice is per section (switching tabs resets it to the first branch); a "Locked" scheme or scale cannot yet be seen in the UI because nothing locks them until Slice P2, so the New version path is covered by the API tests, not by a browser test.

## 3. Verification
Targeted after `pnpm build`: academics-grading-staff + academics-structure (21 passed), shell + users (73 passed, 12 skipped); typecheck, lint, Prettier clean. Screenshots in `out/screenshots` (desktop and phone, both themes). Full suite (one worker, ~1.1 h): **1225 passed, 0 failed, 18 skipped.** The 18 skips were not individually re-examined. Mutation passes NOT RUN - pending, end of Phase 2.
