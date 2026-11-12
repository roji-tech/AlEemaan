# 0033: Walkthrough videos and PDFs that double as a flow audit

- **Period / Focus:** requested 2026-10-19; **deferred: runs last, after all other tasks are done** (maintainer's decision, 2026-10-19). P0 (plan, guardrails, coverage matrix) built 2026-11-02; no journey yet (section 6).
- **Status:** In progress (P0 built 2026-11-02 for AlEemaan: matrix, guardrails, runner safety; P1 recon started 2026-11-03 after task 0041 merged, section 6.6)
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
- [x] P0.1 Coverage matrix (every feature, route and screen, with negative rows per role and a computed "API route with no screen" list; plan before code): built 2026-11-02, 168 rows; agreement of the maintainer outstanding (section 6)
- [x] P0.2 Guardrails (built 2026-11-02, section 6): separate Playwright config and folder (`tests/walkthrough`), a per-tab `goto` wrapper that throws after the first call, a tamper-tested unit test that greps the folder for `request`, `fetch`, `prisma`, `pg`, `skip`, `fixme`, `isVisible`, `try {`, `localStorage`, `sessionStorage` and `cookies` (outside an allowlisted observer file), a visible cursor and click ripple, an in-page caption bar, very-fast-human typing (35 to 80 ms a key; was 50 to 120 until 2026-11-06, when the maintainer asked for a very fast human), observers always on (console, pageerror, requestfailed, response status, axe after each new route), and `timeline.json` as the single source of captions, ticks and chapters
- [ ] P0.3 Tooling: Playwright records `.webm`; the mp4, burned-in captions and chapters need ffmpeg (none is installed; a static build from npm into a tools folder outside the repo, no sudo, is the proposal); the PDF is an HTML report printed with Chromium (`page.pdf()`), which needs nothing new
- [ ] P1 Recon runs (soft mode, chapter snapshots) until the journey reaches the end; findings logged
- [ ] P2 Findings fixed (a regression test each that fails on the old code), or listed with the decision they need
- [ ] P3 Final: desktop light, then dark, then phone, each one strict, uninterrupted run from a fresh database
- [ ] P4 Ship: the harness as its own PR; each fix its own commit; deliverables per project under the git-ignored `out/walkthrough/` (the three videos, one PDF, `findings.md`, `timeline.json`, `chapters.vtt`, the coverage matrix, screenshots, `_evidence/`)
- [ ] Same for Octalve Edu (tenant onboarding, platform superadmin, support access, custom domains, Paystack mock, messaging stand-ins), as its own run and its own PR
- [ ] Mutation passes (deferred to the end of Phase 2)

## 5. Definition of done
The matrix is fully ticked in one green run per pass; every finding is fixed or listed with its reason and the decision it needs; the guardrail unit test is green; tsc, lint, build, then the full suite pass on the final commit; PR into `dev` with `base.ref` verified; docs (this file, HANDOVER, open-items, current-tasks) updated in the same change.

## 6. Where it stands (2026-11-02: P0 done for AlEemaan; P1 waits for the maintainer)

### 6.1 What P0 built (tests and scripts only; no product code)
- **The coverage matrix.** `tests/walkthrough/coverage/rows.json` holds 174 rows (168 when P0 was built; slice F1 of task 0041 added the six Forms rows FRM-01 to FRM-06): 135 positive, 39 negative (what each role must be refused), 2 `not demonstrable` with their reason (real e-mail/WhatsApp/SMS delivery, the guardian's SMS magic link; the offline page was a third until the maintainer's answer to D5, section 6.4), 12 that need a typed address (see D2). The rows are written by hand; everything else is computed by `scripts/walkthrough-run/coverage.mjs`: the 28 pages and 16 navigation entries (27 and 15 before the Forms page), the 184 API routes with their methods and who may call them (from the function catalog), which screens call which route (by following each screen's imports and matching its `/api/v1/...` strings), the API column of every row, and the list of API routes no screen reaches. `--structure` fails when a page or navigation entry has no row, a row names a file, role or route that does not exist, an id repeats or a "not demonstrable" row gives no reason; `--check` (the final gate) also fails while any row is only `planned`. A row is ticked only by a recorded step that names it in `covers`. `tests/walkthrough/support/coverage.spec.ts` breaks the matrix on purpose and watches the gate refuse it.
- **The guard is a table of rules** (`support/guard-rules.ts`), each with its own tamper line that guard.spec.ts feeds it. Two tiers: the actor tier (page.request/APIRequestContext, fetch, prisma/pg, shell-out, local/session storage, cookies, skip/fixme, retries, any `goto` that is not `Walk.goto`, forced clicks, fill, insertText, setInputFiles, dispatchEvent, fulfill) binds every file including the helpers; the journey tier (isVisible and its relatives, try/catch/.catch, if/else/switch/while, evaluate, Promise.race, expect.soft, route) binds the journey files and not the observer library. Comments are ignored, strings are not.
- **The walk helpers follow the rules.** Typing is one key press at a time, 35 to 80 ms apart (the old constant 25 ms and `fill` are gone; the range was 50 to 120 until the maintainer asked on 2026-11-06 for "a very fast human", and the click pauses were shortened with it), the speed scale cannot shorten it, and a pass fails over a 12-minute typing budget. A step must name coverage-matrix rows that exist. Roles use the matrix's seven names (the old role names never matched the overlay's colour classes). One `goto` per tab, counted by `Walk`.
- **Observers, always on** (`support/observers.ts`): console errors and warnings, page errors, failed requests, HTTP statuses, any request that would leave the machine (refused and recorded: "the app calls X"), and axe on every new path. Blockers (script error, console error, 5xx, an outside request, serious or critical axe) fail a strict run; a recon run only records them.
- **Config.** `playwright.walkthrough.config.ts` has a `support` project (the harness's own tests, no recording) and three recording passes: `desktop-light` and `desktop-dark` at 1280 x 720 and `phone` on a Pixel 7. No retries, no parallelism. Output goes to the main checkout's git-ignored `out/walkthrough/aleemaan/<pass>/`, never into a worktree.
- **The runner's safety** (`scripts/walkthrough-run/safety.mjs`, used by `run.mjs`): it drops and recreates a database, so the name must be `wip_<repo>_walkthrough` (never test, dev or prod), the server must be on this machine, nobody else may be connected, and `select current_database()` must return the name before the first write. Each run makes its own setup token (never printed).
- **Tests:** `pnpm exec playwright test --config=playwright.walkthrough.config.ts --project=support` (the harness's own tests; they need no database and no server).

### 6.2 What P0 found
Defects in the harness that was merged on 2026-10-28 (never run, so none could show):
1. The journey typed into a `schoolName` field that the setup page does not have, and left out the setup token it asks for: it could not have got past step 2. It also branched with `if (onSetup)`. It was removed (it is in the history); P1 writes the real one against the matrix.
2. The caption bar's script ran before the page had a body and threw on every page load: a false page error on every page of every run, and a caption bar that vanished after each click until the next step. Fixed; the test fails on the old script.
3. Role names did not match the overlay's colour classes, so no role badge was coloured.
4. Typing at 25 ms and `fill`, against the rule (50 to 120 ms of real key presses); one viewport at 1366 x 768, against the three passes at 1280 x 720; no observers; a guard that let `if (`, `page.goto(`, `evaluate`, cookies, forced clicks and `fill` through and exempted four whole files from every check; a runner that dropped whatever database a variable named, with no `current_database()` check and no password for the client tools.
5. Still to adapt in P1 and P3: `report.mjs` reads the old single-pass layout, `timeline.json` still uses `title` where the specification says `name`, and `run.mjs` falls back to `next dev` and builds into `.next` (the specification wants a production build in its own directory, which needs a `distDir` setting in `next.config.ts`: product configuration, so left for the maintainer's word).

Findings about the product (stated in general terms):
- **Forms, practice and questionnaires have an API and no screen.** The scan finds no trace of a screen for 54 of the 184 routes; read by hand: 35 are the Forms module and the pupil's practice (create and close a form, responses, marking queue, analytics, turn-ins, print, the public questionnaire link, practice sets, questionnaires, paper work and practice sessions); 6 are question-bank reports, printing, print logs and offer-back; 3 (approve, reject, retire) are reached by a screen that builds their address from a variable, so a screen exists; the other 10 are single routes, below. The task 0032 header already says slices 3 to 10 are not started. There is no pupil practice screen and no public questionnaire page.
- Of the other 10: three look unused by any screen (a second `attendance` route beside the one the screen uses, `auth/me`, the invoice `pay` route) and need a person to decide, remove or give them a screen; two are not for a screen (the Paystack webhook, and the JSON twin of the public verification page); five are not settled by the scan (the grade-scale and assessment-scheme item routes, the session item route, staff restore, and a teacher's quiz-attempt route; the grading panel builds its addresses from constants, so some are likely in use) and are read by hand in recon.
- `/video-guide` is reachable by address only: nothing in the app links to it.

### 6.3 Prerequisites (re-checked 2026-11-02)
- Task 0032: the question-bank screens (browse, write, review, reviewers, settings) are built; the Forms and practice screens are not (above).
- Results approval by scope (Octalve's ADR 0018) is built here as task 0039.
- One green full suite on `dev`: the run of 2026-10-30 had 2169 non-browser tests passed and 3 failed (two fixed in #131, one a load flake that passes alone), and 567 browser tests passed, 0 failed.
- Octalve Edu: not started (its question-bank parity and its own P0 are separate).

### 6.4 The maintainer's answers (2026-11-02)
- **D1 Build the Forms screens first, quickly, then walk.** Done as task 0041 (`docs/tasks/0041-forms-screens.md`): slices F1 to F7. The walkthrough's journey (P1) starts after they are merged, so that the Forms module is walked and not listed as "has an API, no screen".
- **D2 Typed-address rows: as recommended** (a fresh tab with exactly one counted `goto` each, labelled "typed address" in the PDF).
- **D3 The guardian's SMS or WhatsApp magic link: as recommended**, "not demonstrable".
- **D4 Link `/video-guide` from the app: yes** (slice F7). **The finished video is compressed after it is made** (ffmpeg, installed outside the repository; the recording is a large VP8 file and the published copy is VP9 or H.264 at a lower bitrate; the size before and after goes in the PR). Where it is hosted stays as recommended: out of git (`public/media/video-guide/` is git-ignored) and on a host the maintainer picks when the video exists; the page reads its files from a configurable address (slice F7). The production build gets its own `distDir` (slice F7).
- **D5 The offline page: demonstrable after all.** The maintainer asked whether it is really not demonstrable, and it is: a person does lose the network, and doing so changes nothing in the app and fakes no reply. Playwright's offline switch is the same as turning on airplane mode. The first answer treated it as an actor because the guard treats an unclear actor as forbidden; the fix is an explicit, named exception (`walk.goOffline()` and `walk.goOnline()`, the only place the offline switch may appear, caption on screen), not a gap in the matrix. Row OFF-01 is `planned` again. The service worker (`public/sw.js`) must have cached the offline page by then, which the journey proves by going offline after a page load.

### 6.5 Next
After task 0041: P1 recon (write the journey against the matrix, soft mode, chapter snapshots, read the findings), then P2 fix, P3 the three strict passes, P4 ship. Octalve Edu is its own run and its own PR.

### 6.6 P1 recon: the plan (2026-11-03; the maintainer said "start P1" once the Forms screens (task 0041, F1 to F8) were merged)
**Goal.** Write the journey against the matrix (224 rows now: 171 positive, 53 negative) and run it, soft, on a fresh `wip_aleemaan_walkthrough` database until it reaches the end; every place it breaks is a finding. Nothing from P1 is a deliverable (section 3a). No product code changes in P1 except what a finding needs and the maintainer's rules allow: P2 does the fixing.

**Environment (checked 2026-11-03).** The docker PostgreSQL on `:5434` is up and its role may create databases; the walkthrough database is `wip_aleemaan_walkthrough`, never `aleemaan_test`; ffmpeg and ffprobe are installed outside the repository (`~/.local/bin`); ports 3320 and 3321 are free; a worktree (`../AlEemaan-p1`, branch `claude/walkthrough-p1`) off `dev`, because the main checkout belongs to another session. The server is a production build in its own folder (`NEXT_DIST_DIR=.next-walk`, task 0041 F7), started like the dev-tools server of the test harness (`APP_ENV=staging`, `DEV_TOOLS=true`, a token the run makes, `EMAIL_TRANSPORT` empty so mail goes to the in-app inbox, mock payments, a setup token the run makes). Throwaway values only, kept in the runner's environment and never printed.

**What P1 changes in the harness (tests and scripts only).**
1. `scripts/walkthrough-run/run.mjs` still names the old environment (`DEV_TOOLS_ENABLED`) and falls back to `next dev`; it will build into `.next-walk`, serve from it with the variables above, and take `WALKTHROUGH_MODE=recon|strict`.
2. A chapter wrapper in `support/walk.ts` (the library file, exempt from the journey tier of the guard): `walk.chapter(name, run)`. In recon it records a failed step as a finding (id, chapter, step, route, what a user saw, evidence) and goes on to the next chapter; in strict it rethrows. The journey files themselves keep the no-`try`, no-`if` rule.
3. A snapshot per chapter, recon only: the runner takes a `pg_dump` after each chapter that passes. When a chapter fails, the next one is not started on its half-made data: the runner restores the last good snapshot, and the chapters that depend on the failed one are recorded as "blocked by C0n" in the findings instead of failing again for the same reason. The snapshots are evidence (kept in `_evidence/<run-id>/`), never a deliverable.
4. `report.mjs` and the timeline: `name` instead of `title`, the three-pass layout (section 6.2 item 5); only as far as recon needs it (the PDF is P3).

**The journey: chapters, in the order the data is made (each chapter names the rows it covers; the rows are the matrix's, nothing new).**
- C01 Start and sign-in: RTE-01, SET-01 to SET-03, LOG-01, LOG-02, LOG-04, LOG-05, SHL-04, SHL-07, DSH-02, VID-01, VID-02, OFF-01.
- C02 The school: BRN-01 to BRN-04, STG-01 to STG-08, APR-01 to APR-05, DSH-01.
- C03 Academics and people: ACA-01 to ACA-14, USR-01 to USR-12 (with the dev inbox: SHL-06, INV-01 to INV-03, CNF-01, FRG-01, FRG-02, RST-01, RST-02), LOG-03, ACC-01 to ACC-08.
- C04 Students and the day: STU-01 to STU-08, ATT-01 to ATT-07, TMT-01 to TMT-06, ANN-01 to ANN-06, COM-01 to COM-05.
- C05 Coursework and results: LMS-01 to LMS-10, RES-01 to RES-10, VER-01, VER-02, FIN-01 to FIN-10.
- C06 The question bank and Forms: QBK-01 to QBK-19, FRM-01 to FRM-22, FRM-23 to FRM-26 (the public link, as a visitor).
- C07 The portal: POR-01 to POR-32 (pupil and guardian), SHL-01 to SHL-03, SHL-05, SHL-08, DSH-03.
A chapter is written, run and read before the next is written: the journey grows from the front, so a finding in C01 is found before C02 is written on top of it.

**Findings.** One file per run, `findings.md` under `_evidence/<run-id>/`, each with the fields of section 3a; the first run's findings and the decisions they need go in section 6.7 of this file (stated in general terms: how to trigger a weakness stays in the private tracker).

**Stops.** A finding that is a product choice (section 3, fix authority) is written as Needs a decision and the run goes on; the report at the end of P1 says what was run and what was only read. No migration is run on any hosted database.

### 6.7 Where P1 stands (2026-11-09: rebased onto dev; C01 re-run; the coverage matrix fixed)
- **Chapter C01 (Start and sign-in) is written and has been run twice**, the second time on 2026-11-09 after the branch was rebased onto `dev` (which had moved by 18 pull requests' worth of product code: programs P2 to P5, progress records R1 to R4, accessibility and test fixes). That run was a **recon pass, desktop-light, on a production build made for the run** (`WALKTHROUGH_REBUILD=1`, built 2026-11-09), on a fresh `wip_aleemaan_p1check_walkthrough` database: the one journey test passed in 31 seconds and `findings.md` says "0 chapter(s) stopped before their end." The only line the server wrote to its error stream was the known rate-limit notice that there is no proxy address in the run.
- **A trap in the runner, found while doing this:** `run.mjs` reuses an existing `.next-walk` build when one is there. A folder left from 2026-11-03 would have been tested as if it were the current code, and the run would still have said it passed. Until the runner compares the build with the code, pass `WALKTHROUGH_REBUILD=1` after any rebase or merge, and look at the date of `.next-walk/BUILD_ID`. (The first run of this day used the old build and was thrown away for that reason.)
- **The harness's own project passes: 34 of 34** (`--project=support`). Two of its tests, `coverage.spec.ts` "the real matrix is complete in structure" and "a row is ticked only by a recorded step", **fail on plain `dev`**, not only on this branch: the programs and progress-record work added rows the gate rejects (`PGR-14` to `PGR-16` name "Program admin" and "Supervisor", which are assignments, not sign-in roles; the certificate page `/programs/[id]/certificates/[certId]` had no row). The rows were fixed (a program admin is filed under Superadmin and a supervisor under Teacher, as the earlier rows do; `PCM-04` now carries the certificate page's route). The gate was not loosened. The support project is not part of `pnpm check`, which is how this went unseen; whoever adds matrix rows should run it.
- **Not done:** chapters C02 to C07; the desktop-dark and phone passes of C01; any deliverable (video, PDF); the full suite and mutation passes. P1 stays open in section 4 until the journey reaches its end.
