# 0098: A break inside a term or semester (the mid-term or mid-semester holiday), and the announcement that goes with it

- **Period / Focus:** 2026-11-18 (the maintainer: "we also have something we call mid-term or mid-semester holiday, how do we apply it? and this is something worth annoucement too")
- **Status:** Built; the run is recorded in section 5
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/session-breaks` / PR into `dev` (it builds on task 0097, the session's terms and their dates)
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

An administrator can say "there is no school from Monday 26 October to Friday 30 October" inside a term or semester, see it under that term, change or remove it, and right after adding it is offered an announcement to the whole branch, written for them to read and change.

## 2. Decisions

- **D1. A break belongs to ONE term or semester** (`AcademicBreak`, a new table; the composite key `(branchId, periodId)` makes the database refuse a break that points at another branch's term). It lies **inside** that term (first and last day both allowed) and the breaks of a term **never overlap** (the touching day counts). The term's own dates do not change: a break is a hole in a term, not a gap between two, and a gap between two terms is already allowed (task 0097).
- **D2. The days are included at both ends**, so a one-day break has the same first and last day. School does not run from the first to the last day.
- **D3. The rules are one pure module** (`session-break-rules.ts`) used by the form and the server, so they cannot disagree. Nothing is deleted: a removed break is archived (`archivedAt`) and its days are free again.
- **D4. Moving a term's days never leaves a break outside it.** The schedule edit of task 0097 (`PUT .../schedule`) is refused, naming the break and the term ("Mid-term break (2026-10-26 to 2026-10-30) would fall outside 1st Term. Move or remove the break first.").
- **D5. The announcement is the ordinary announcement** (`POST /api/v1/announcements`), offered right after a NEW break is saved (not after a change or a removal), with a draft the person can read and change or skip ("Not now"): title "Mid-term break: Monday 26 October 2026 to Friday 30 October 2026", and "<Branch> will have no classes from … to … for the mid-term break in the 1st Term of 2026/2027. Classes resume on Monday 2 November 2026." It goes to everyone in that branch (staff, pupils, parents: no role filter), is not pinned unless asked, and stops showing at the end of the day classes resume. **No link is kept between a break and its announcement**: changing or removing a break does not withdraw one already sent, and the remove dialog says so. (Linking them would mean a second table and a second source of truth for little gain; the person posts a new one.)
- **D6. "Classes resume on" is the day after the break, or the Monday when that is a weekend** (the school week is Monday to Friday). It is only a draft: the person corrects it in the text.
- **D7. Authority.** Administrators of the term's branch (a superadmin: any). Another branch's term or break is the same 404 as an unknown id. Teachers and staff see the breaks and none of the buttons. Every change is audited (`ACADEMIC_BREAK_CREATED`, `_UPDATED` with before and after, `_REMOVED`).
- **D8. Reading them.** The breaks come back with each term in `GET /api/v1/academics/sessions` and `/sessions/[id]` (`periods[].breaks`), through one extra query used only there, so a screen that does not show breaks never depends on the new table.

## 3. Work

- [x] `prisma/schema/academics.prisma` (`AcademicBreak`), migration `20261118170000_academic_break` (additive: one table)
- [x] `src/lib/academics/session-break-rules.ts`, `session-breaks.ts`; `updateSchedule` refuses to strand a break
- [x] `POST /api/v1/academics/periods/[id]/breaks`, `PATCH` and `DELETE /api/v1/academics/breaks/[id]`
- [x] `BreakDialogs.tsx` (the form and the announcement), the breaks under each term in `SessionsPanel`, info tip `sessions.break`
- [x] `tests/unit/session-breaks.spec.ts`, `tests/api/session-breaks.spec.ts`, `tests/e2e/session-breaks.spec.ts`

## 4. Migration (the maintainer's to run)

`prisma/migrations/20261118170000_academic_break/migration.sql` creates one table and two foreign keys; it touches no existing table or row. **Staging:** `migrate-staging.yml` runs it by itself when `master` receives a change under `prisma/migrations/**` or `prisma/schema/**`. **Production:** merge to `prod`, THEN `gh workflow run migrate-production.yml --ref prod -f confirm="migrate production"`. Until it runs in an environment, only the Sessions tab list and a session's detail fail there (they read the table); nothing else depends on it.

## 5. Record of the runs (2026-11-18, from the run summaries and logs)

- **First combined pass** (fresh build of the whole batch: unit with setup 1355 passed / 1 failed; API 254 passed / 1 failed; desktop browser, 34 specs of the touched screens, 291 passed / 10 failed). The failures: a literal U+2028 in a test; the break refusal said "inside 1st Term"; two locators that the new Overview made ambiguous; four tests that needed the Users list to load first or the newest toast; two sign-in tests that were already stale on `dev` (the website at `/` is for everyone, its Sign in link goes to `/select-role`); one race in the programs spec. All fixed in cf34410, not skipped.
- **Rerun** (fresh build): unit 5 passed, API (breaks) 6 passed, desktop 103 passed, phone (new screens) 45 passed / 1 failed (the pager test looked for numbered pages, which a phone does not draw; fixed in 49c5e1d).
- **Final pass** (fresh build, after merging the Report tool; the first try failed 56 tests with "the browser reported Content-Security-Policy violations: eval", because `src/lib/reports/report.ts` built a zod schema in the browser without `import "@/lib/zod-csp"` first; fixed in f7c5219): unit 21 passed, API 23 passed (reports, breaks, session schedule), desktop browser 38 passed, phone browser 20 passed, **0 failed**.
- Not run: the whole browser suite (only the 34 specs of the touched screens plus the phone project for the new screens); the unit suite ran in full only in the first pass.
