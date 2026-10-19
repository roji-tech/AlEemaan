# 0031: Slice UI1 - close the screen gaps and the security holes found by the browser run

- **Period / Focus:** 2026-10-19 (browser walk-through of the production build, then fixes)
- **Status:** In Progress (code complete and committed on the branch; PR not yet opened)
- **Priority:** High
- **Assignee:** Claude (maintainer: roji-tech)
- **Target Branch / PR:** `claude/ui-gaps-students-settings` into `dev` (PR pending)

> **How to tick:** change `[ ]` to `[x]`.

---

## 1. Objective
Every flow the API supports can be reached and used from a screen, in both themes and at phone width, and no signed-in person can read or change another branch's data by changing an id.

## 2. Context & Related Docs
- Plan: `docs/development-history/domain-implementation-plan.md` ("Build design - Slice UI1").
- Found by: a Playwright walk-through of a production build (setup wizard to every screen), then a browser security pass. The report is in `out/test/REPORT.md` (git-ignored).
- Decisions: the five October decisions (scheme hierarchy, layouts, self-approval toggle, verification fields, attendance grants) were built by the P2e and attendance-permissions slices; UI1 adds the screens and wires the enforcement they lacked.

## 3. Work Breakdown

### Module A: Screens that were missing
- [x] Students screen: list, search, register, edit, archive/restore, namesake confirmation, CSV import (stage 2).
- [x] Approvals and rules page: change requests, report-card layouts, verification-page fields, self-approval toggle, enforcement switch (stage 3).
- [x] Scheme levels on the Academics page and the teacher scheme panel on Results (stage 4).
- [x] Timetable "same period, several days"; the class-arm routes the timetable and announcements used did not exist (stage 5).
- [x] Phone navigation fits (More is reachable); Students, Approvals, Coursework, Attendance, Timetable, Finance live under More.
- [x] Pupils hand in coursework and take quizzes in the portal (stage 7). Staff screens point students to the portal.

### Module B: Defects
- [x] Hydration error #418 on every signed-in full load (service-worker register read `navigator.onLine` in render).
- [x] Wrong "ask an administrator" wording for administrators on Results.
- [x] School-wide and teacher schemes collided with a branch default (migration `20261019090000_hosted_schemes`, **run before the code**).
- [x] Layout PATCH failed on a fresh database (`ensureDefaultReportCardLayouts`).
- [x] A pupil registered with a class but no active session was silently not placed; it now says so.
- [x] Light-theme contrast on Finance and Portal; the LMS and Communication screens used design tokens that do not exist (unstyled) and status colours that follow the OS instead of the app theme. Mapped to the real tokens.
- [x] Coursework page checked role names that do not exist (TEACHER, DIRECTOR...) and used the first membership's role for every branch; now per branch.
- [x] Portal showed work meant for other class groups.
- [x] Setup failed on a slow database (Prisma transaction timeout raised).

### Module C: Security (all fixed, each with a test)
- [x] Finance: fees and invoices readable by any signed-in staff member for any branch.
- [x] Coursework, announcements, timetable, communication and promotion answered any signed-in person for any branch (`withAuthGated`, 22 routes). The Communication page was shown to teachers.
- [x] A student or parent session could submit or attempt as any pupil id (`lib/lms/submitter.ts`); STUDENT/PARENT memberships can no longer name a pupil.
- [x] Read routes sent pupils the quiz answer key, draft work and classmates' submissions (`lib/lms/audience.ts`).
- [x] `GET /academics/sessions` listed every branch's sessions.
- [ ] Rotate the database and Redis credentials that were pasted into chat. (Maintainer.)
- [ ] Portal sign-in secret is the guardian's phone number: weak, needs a real secret or magic link by default. (Open.)

### Module D: Tests and docs
- [x] New specs: students-screen, approvals-screen, scheme-levels, timetable-batch, announcements-audience, browser-security, portal-coursework (api and e2e), cross-branch-isolation, finance-access, hosted-schemes, settings-change-requests, student-csv.
- [x] Stale tests repaired: attendance (fixed date aged out of the 7-day window), promotion and timetable (truncate; published results are write-protected), lms-a11y.
- [x] Full suite before stage 7: 1526 passed, 5 failed (4 repaired, 1 timing test that passes alone).
- [ ] Re-run the full suite on the final commit before the PR.
- [ ] Mutation passes: deferred to the end of Phase 2 (maintainer's call).

## 4. Notes for whoever picks this up
- Migration order: apply `20261019090000_hosted_schemes` to a live database **before** deploying this code. The maintainer controls live databases.
- Not pushed: nothing from this slice is on GitHub yet.
- Octalve Edu got the same hydration fix, the Coursework menu item, the same token fix and two lint fixes on `claude/ui-fixes-hydration-nav` (see its own PR).
