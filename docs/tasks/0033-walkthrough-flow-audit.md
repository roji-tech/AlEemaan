# 0033: Walkthrough videos and PDFs that double as a flow audit

- **Period / Focus:** requested 2026-10-19; **deferred: runs last, after all other tasks are done** (maintainer's decision, 2026-10-19). Nothing is built.
- **Status:** Pending (specified and refined 2026-10-23, not started; 0 of 9 items done; the prerequisites in section 6 are not met)
- **Priority:** Medium (last in the order of work)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** to be created off `dev` when the work starts; one PR per repository (AlEemaan and Octalve Edu, each on its own)

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
For each project separately, produce a video and a PDF that show **every feature working, as a normal user would use it in a browser**, start to finish. The run doubles as a flow audit: whatever a user cannot do by clicking and typing is a finding, and the findings are fixed.

## 2. Context & Related Docs
- Decisions in the maintainer's words: `docs/HANDOVER.md` section 6.7.
- Why it is last: the audit changes production code, so it should run once, against the finished product, including Task 0032 (Forms and question bank). Decided 2026-10-19: Octalve's question-bank parity (its own design note, then the build) counts as part of "all tasks", so it is done BEFORE Octalve's walkthrough.
- Builds on: the Playwright setup in this repo; the production-build rule (`pnpm build` before any run); the dev email inbox (`EMAIL_TRANSPORT=inbox`, Phase 0.5.F); the theme cookie and tokens.

## 3. The rules (the maintainer's words, made enforceable)

**A person may only:** click, type (real key presses), choose a file in a file dialog, follow a link, use back/forward, and sign out and in as another person.

**Forbidden, and enforced by code, not promise:**
- SQL, Prisma, or any database edit during the journey; API calls (`page.request`, `fetch` or `evaluate`, curl); cookie or storage edits.
- `page.goto` after the first page load. Every later page is reached by a click or a link.
- "If visible, then..." or try/catch-and-continue. Every step is a hard assertion; a step that cannot be done as a user would do it **fails the run** and becomes a finding.
- `test.skip`, `test.fixme` or retries inside the journey.

**Start state:** a new, empty database with migrations applied (environment setup, outside the recording). The recording begins at the first-run setup wizard. All data is created through the screens; a CSV import and a file upload count as user actions. A dedicated database (`aleemaan_walkthrough`); never `aleemaan_test`, never the online database; nothing else running against it while it records. Fictional names and throwaway credentials only. The servers under test are a production build.

**Outside the browser (decided 2026-10-19: use the in-app stand-ins):** emailed links come from the in-app dev inbox widget and are clicked; payments use the mock gateway modal; for two-step sign-in the run reads the secret shown on screen and types the computed code, as a person would from their phone. The PDF labels every such step. What a browser run cannot show at all (waiting days for an expiry, a real SMS) is listed in the PDF as "not demonstrable here" with the reason; it is never silently skipped.

**Passes (decided 2026-10-19: the full journey in all three):** desktop light theme, desktop dark theme, and phone width. Each pass is one continuous recording from its own fresh database, starting at the setup wizard. If the app has no way to switch theme by clicking, that is a finding. One PDF per project holds all three passes: each step shows the desktop-light screenshot with the dark and phone shots beside it.

**Journey:** one browser context and one recording per pass. The person signs out and in as each role (superadmin, branch administrator, teacher, non-teaching staff, and the pupil and guardian through the portal). Every nav item, page and feature reachable by a user is visited by clicking. A **coverage matrix is written first** (plan before code), built from the nav list, every `page.tsx`, the HANDOVER and task docs, and each API route's screen; the run fails if an item on the matrix is not ticked.

**What counts as a finding:** dead ends and unreachable features; APIs with no screen; confusing or wrong wording; console errors and failed requests; hydration errors; axe violations; unstyled or low-contrast screens; clicks that do nothing; data that did not persist; any state that needs a developer to proceed.

**Fix authority (decided 2026-10-19):** defects and missing screens are fixed, each with a test; product choices (what a feature should do, wording the maintainer owns, anything with a trade-off) are asked, not guessed. The audit-and-fix loop is: run, read each failure, fix, rerun from a fresh database. The final video and PDF come from **one green, uninterrupted run per pass on the last commit**; failed and partial runs are kept only as evidence.

## 3a. Refinements (2026-10-23, from a reusable walkthrough prompt the maintainer supplied)
Everything in section 3 stands. These make it sharper and are additive; the ones marked **PROPOSED** change a decision and wait for the maintainer.

**Phases, each ending with a report and a stop when the report holds a question:** P0 plan (environment, guardrails, coverage matrix; no journey code), P1 recon (run as often as needed to find where it breaks; never a deliverable), P2 fix (a regression test per fix, rerun), P3 final (one strict, uninterrupted run per pass from an empty database; produces the deliverables), P4 ship (pull requests, docs, tracker). P0 changes no product code, so it may start before the prerequisites in section 6 are met; P1 onward may not.

**Actors and observers.** The forbidden list in section 3 is about *actors*, things that change what the app does. *Observers* never change app state and are allowed: Playwright listeners for `console`, `pageerror`, `requestfailed` and `response`, axe, screenshots, video, and the in-page caption bar and cursor overlay. In doubt, it is an actor and is forbidden. Waiting is not a conditional: `await expect(locator).toBeVisible()` on something the journey knows will appear is a hard assertion; `if (await x.isVisible())` is a guess and hides a finding.

**Recon runs versus the final run.** A recon run may be *soft* (a failed step is recorded as a finding and the run goes on to the next chapter, so one pass shows many problems) and may restore a `pg_dump` snapshot taken at the start of a chapter instead of replaying the earlier chapters. Recon runs and snapshots are evidence (kept in `_evidence/<run-id>/`), never the deliverable. The final run is strict, with no snapshot and no soft mode.

**One timeline drives everything.** `timeline.json`, `[{ id, chapter, role, name, covers: [rowIds], startMs, endMs, screenshot }]`, generates the PDF captions, the coverage ticks, `chapters.vtt` and `chapters.json`. A tick on the coverage matrix is generated from it, never edited by hand, and the run fails if a row is still `planned`.

**Coverage matrix columns:** Feature | Route | Roles that can reach it | The click that proves it | API routes behind it | Status (`planned`, `ticked`, `not demonstrable`). The API column is computed by reading the route files and the screens' API calls, so "an API route with no screen" is a computed list, not a guess. Every role also gets **negative rows**: what it must be shown *not* being able to do, and what it sees (hidden, a clear sentence, or "could not be found"). Absence is part of the product here (another branch's data, results a person may not approve, exam items a pupil may not see).

**Persistence is proved by leaving.** After an action that should persist, the journey navigates away and back by clicking and re-reads it. "It rendered" is not evidence.

**More guardrails.** The `goto` wrapper counts per tab (the dev inbox opened as a second tab is its own first `goto`); the guard test is tamper-tested (add a forbidden line, see it fail); the caption bar and cursor are drawn inside the page so they are in the recording with no ffmpeg; a click ripple; the mp4 exists only if ffmpeg does (installed outside the repository, never a dependency), and the PDF says plainly if there is none.

**More start-state rules.** `select current_database()` is run before the first write, every time, and must return the walkthrough database; the production build is made into its own distribution directory so it never clobbers a running dev server; nothing may leave the machine, and every blocked external request is itself a finding ("the app calls X"); the harness's "stage" step may create and migrate the database and start the servers and the stand-ins, prints each command it ran, and writes no application data.

**More findings.** A refusal that shows a status code instead of a sentence; a figure that reads `0` where it should be absent (absent is not zero); two numbers on one screen that disagree; a hydration error; an unstyled flash. Each finding has an id, a severity (blocker, major, minor, nit), the repository, the route, what a user saw, the UI steps that reproduce it, the evidence (screenshot, video timestamp, console line) and a status (Fixed, Not fixed, Needs a decision).

**Fixes.** A regression test per fix that fails on the old code (proved by breaking the fix on purpose); the cause is fixed, not the symptom; a product choice is listed as Needs a decision with the options and a recommendation.

**Practical rules.** Sign-in is rate limited, so one context and one pass per role stays inside it, and a saved session is never reused across runs; the first sign-in of an account may open a guided tour whose overlay swallows clicks, so dismissing it is a step of the journey; a timeout is contention and a failed assertion is a defect, so check which before retrying; the report says what was run and what was only read.

**PROPOSED, not decided:**
1. The database is named `wip_aleemaan_walkthrough` (and `wip_octalve_edu_walkthrough`) instead of `aleemaan_walkthrough`: the `wip_` prefix and `_walkthrough` suffix make a wrong connection obvious in a log. Either way it is never `_test`, never shared, never online.
2. The PDF title page prints the commit pin of the repository under test.
3. P0 (plan, guardrails, matrix) may start before the prerequisites are met, as the only part that touches no product code.
Not proposed: the single 1280 x 720 pass of the prompt. The three passes of section 3 stay (theme and phone layout are features here); the refinements above apply to each pass.

## 4. Work Breakdown
- [ ] P0.1 Coverage matrix (every feature, route and screen, with negative rows per role and a computed "API route with no screen" list; plan before code), agreed with the maintainer
- [ ] P0.2 Guardrails: separate Playwright config and folder (`tests/walkthrough`), a per-tab `goto` wrapper that throws after the first call, a tamper-tested unit test that greps the folder for `request`, `fetch`, `prisma`, `pg`, `skip`, `fixme`, `isVisible`, `try {`, `localStorage`, `sessionStorage` and `cookies` (outside an allowlisted observer file), a visible cursor and click ripple, an in-page caption bar, human-speed typing (50 to 120 ms a key), observers always on (console, pageerror, requestfailed, response status, axe after each new route), and `timeline.json` as the single source of captions, ticks and chapters
- [ ] P0.3 Tooling: Playwright records `.webm`; the mp4, burned-in captions and chapters need ffmpeg (none is installed; a static build from npm into a tools folder outside the repo, no sudo, is the proposal); the PDF is an HTML report printed with Chromium (`page.pdf()`), which needs nothing new
- [ ] P1 Recon runs (soft mode, chapter snapshots) until the journey reaches the end; findings logged
- [ ] P2 Findings fixed (a regression test each that fails on the old code), or listed with the decision they need
- [ ] P3 Final: desktop light, then dark, then phone, each one strict, uninterrupted run from a fresh database
- [ ] P4 Ship: the harness as its own PR; each fix its own commit; deliverables per project under the git-ignored `out/walkthrough/` (the three videos, one PDF, `findings.md`, `timeline.json`, `chapters.vtt`, the coverage matrix, screenshots, `_evidence/`)
- [ ] Same for Octalve Edu (tenant onboarding, platform superadmin, support access, custom domains, Paystack mock, messaging stand-ins), as its own run and its own PR
- [ ] Mutation passes (deferred to the end of Phase 2)

## 5. Definition of done
The matrix is fully ticked in one green run per pass; every finding is fixed or listed with its reason and the decision it needs; the guardrail unit test is green; tsc, lint, build, then the full suite pass on the final commit; PR into `dev` with `base.ref` verified; docs (this file, HANDOVER, open-items, current-tasks) updated in the same change.

## 6. Where it stands, and what it waits for (2026-10-23)
- **Built:** nothing. This file and `docs/HANDOVER.md` section 6.7 are the whole of it.
- **Prerequisites, none met:**
  - Task 0032 (Forms and question bank): slice 1 is merged; slice 2 is partly built on a local branch (storage adapter with three backends, image processing, the overlap function, the migration and the rules module are written; the question service, the review routes, the image routes and the screens are not); slices 3 to 10 have not started.
  - Octalve Edu's question-bank parity: a design note exists and one of its decisions (how guardians sign in) waits for the maintainer; no slice is built.
  - Octalve ADR 0018 (results approvers by scope) waits for the maintainer's answer, and this repository follows it afterwards.
  - One green full suite (every project, including e2e and https) on each `dev`: the runs of 2026-10-23 had 29 failures in each repository; 28 (AlEemaan) and all 29 (Octalve) were slow tests timing out under a heavily loaded machine and passed alone, and AlEemaan's one real failure (a keyboard-unreachable scrolling table in the promotion screens) is fixed (task 0037, follow-up). What is left is one run on an idle machine, on a `dev` with the pending work merged.
- **Order when it starts:** P0 for both repositories (report, wait), then P1 to P4 for AlEemaan, then Octalve Edu.
