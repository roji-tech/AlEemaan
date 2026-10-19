# 0033: Walkthrough videos and PDFs that double as a flow audit

- **Period / Focus:** requested 2026-10-19; **deferred: runs last, after all other tasks are done** (maintainer's decision, 2026-10-19). Nothing is built.
- **Status:** Pending (specified, not started)
- **Priority:** Medium (last in the order of work)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** to be created off `dev` when the work starts; one PR per repository (AlEemaan and Octalve Edu, each on its own)

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
For each project separately, produce a video and a PDF that show **every feature working, as a normal user would use it in a browser**, start to finish. The run doubles as a flow audit: whatever a user cannot do by clicking and typing is a finding, and the findings are fixed.

## 2. Context & Related Docs
- Decisions in the maintainer's words: `docs/HANDOVER.md` section 6.7.
- Why it is last: the audit changes production code, so it should run once, against the finished product, including Task 0032 (Forms and question bank). Open question for the maintainer: whether Octalve's question-bank parity (which needs its own design note) counts as part of "all tasks" before Octalve's walkthrough.
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

## 4. Work Breakdown
- [ ] 1 Coverage matrix (every feature, route and screen; plan before code), agreed with the maintainer
- [ ] 2 Guardrails: separate Playwright config and folder (`tests/walkthrough`), a `goto` wrapper that throws after the first call, a unit test that greps the folder for `request`, `fetch`, `prisma`, `pg`, `skip`, `isVisible` guards and fails if any appear, a visible cursor and click highlight, human-speed typing, a step timeline (name, start, end, screenshot) that the PDF is generated from
- [ ] 3 Tooling: Playwright records `.webm`; mp4, burned-in step captions and chapters need ffmpeg (none is installed; a static build from npm into a tools folder outside the repo, no sudo, is the proposal); the PDF is an HTML report printed with Chromium (`page.pdf()`), which needs nothing new
- [ ] 4 Journey: desktop light, then dark, then phone, each green from a fresh database
- [ ] 5 Findings fixed (with tests), or listed with the decision they need
- [ ] 6 Deliverables per project under the project's git-ignored `out/walkthrough/`: the three videos, one PDF, `findings.md`, the coverage matrix
- [ ] 7 Same for Octalve Edu (tenant onboarding, platform superadmin, support access, custom domains, Paystack mock, messaging stand-ins), as its own run and its own PR
- [ ] Mutation passes (deferred to the end of Phase 2)

## 5. Definition of done
The matrix is fully ticked in one green run per pass; every finding is fixed or listed with its reason and the decision it needs; the guardrail unit test is green; tsc, lint, build, then the full suite pass on the final commit; PR into `dev` with `base.ref` verified; docs (this file, HANDOVER, open-items, current-tasks) updated in the same change.
