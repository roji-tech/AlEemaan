# 0093: A page to create and manage academic sessions, and an Overview with set-up status, shortcuts and linked figures

- **Period / Focus:** 2026-11-18 (the maintainer, after the pupil upload refused all 144 rows with "This branch has no active academic session": "where is the page to create academic session?", and on the Overview: "we should have more things on the overview like creating a new session, new class, new ... or more stats that link to their pages ... I need a well designed UI/UX for this")
- **Status:** Designed; building
- **Priority:** High (it blocks loading the school's real pupil files)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/list-grid-views` / PR into `dev` (it uses the list/grid kit of task 0089)
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

An administrator can create a session (a school year with its terms), see which one is active, make another one active, close one, rename one and choose the current term, all from the app. The Overview says what is not set up yet and offers the next step in one click, and its figures open the page they count.

## 2. What exists today

The API is complete (`GET/POST /api/v1/academics/sessions`, `PATCH /sessions/[id]` to rename, activate or close, `PATCH /periods/[id]` to make a term current; terms are made with the session; activating one closes the branch's other active session) and audited. The only screen that uses it is the **"Academic Sessions & Terms" tab of Settings, which is superadmin-only** (`NAV` `superAdminOnly`): a branch administrator, who is the person who must start the year for their branch, cannot see it (the maintainer asked where the page was, signed in as an Administrator). A branch with no active session refuses every pupil that names a class. The Overview has three figures that link nowhere.

## 3. Decisions

- **D1. A Sessions tab on Academics** (after Subjects), and a real route `/academics/sessions` that redirects to `/academics?section=sessions` (the URL a person would try; it was a 404). The tab uses the same branch choice as Classes and Subjects.
- **D2. The page says what matters first.** A warning when the branch has no active session ("Pupils can't be placed in a class until one is active"), then the sessions, the active one first. Each is an item of the list kit: name, status badge (Active, Planned, Closed: always words, never colour alone), dates, the terms as chips (the current one marked; an administrator can make another current), and the actions.
- **D3. New session** asks for the name, the two dates, the number of terms and whether to make it active now. It suggests the next school year that does not exist yet (2026/2027, 1 September to 31 July; a branch whose name has "Arabic" starts with 2 terms, as the server does) so the usual case is one click. Making a session active closes the active one: the form says so, and the same warning is shown before "Make active" and "Close session" (a confirmation each; nothing is ever deleted).
- **D4. Deep links open the thing**: `/academics?section=sessions&new=1` opens the New session form; `section=classes&new=1` opens New class; `branch=<id>` chooses the branch. Only an id the person may see is used.
- **D5. The Overview (administrators)**: (1) the figures, each a link (Branches, People with a role, Pupils, Classes, Subjects, Active sessions) in the same labelled region as before; (2) "To do": per branch, what is missing (no active session, no classes, no subjects, no pupils), each with a button to the right page; "Everything is set up" when nothing is; (3) quick actions (New academic session, New class, Add pupils, Invite people, New subject); (4) the branches, each opening its page, with its members, pupils and active session (or "No active session"). Everything is scoped to the branches the person belongs to (a superadmin: all); the old page counted every branch for a branch administrator.
- **D6. The Settings tab stays for now** (a superadmin still has it; both call the same audited API). Whether to replace it with a link to the new tab, so there is one place, is the maintainer's call; it is not changed here.
- **D7. Security**: no new API. Every change is the existing audited, branch-checked endpoints; the page only shows buttons to a person who administers the branch, and the API decides again on each request. The deep links carry no data, only which screen to open.

## 4. Files

`src/lib/academics/session-suggest.ts` (pure: the suggested session, the default number of terms); `src/components/academics/SessionsPanel.tsx`; `AcademicsSections.tsx` (the tab, `?section`, `?branch`, `?new`); `ClassesPanel.tsx` (`autoNew`); `src/app/(app)/academics/page.tsx` and `.../sessions/page.tsx`; `src/app/(app)/dashboard/page.tsx`; the bulk review's link (task 0084 follow-up, PR #275) already points at the new tab.

## 5. Tests

Unit `tests/unit/session-suggest.spec.ts`; browser `tests/e2e/academic-sessions.spec.ts` (create, the active one is replaced, close, rename, a term made current, the warning, a teacher sees no buttons, `/academics/sessions` opens the tab, `new=1` opens the form, axe, phone and desktop) and `tests/e2e/overview.spec.ts` (the figures link, the to-do items, the quick actions, a branch administrator sees only their branches, axe).

## 6. Build record and tests

(filled in with the real counts when the suites have run)
