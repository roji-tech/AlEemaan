# AlEemaan — Project Status & Handover Documentation

> **Last Updated:** 2026-10-19 (Slice UI1 committed on a branch, question bank and Forms decisions - see section 6)  
> **Scope:** AlEemaan School Management System (Single-Tenant, Multi-Branch Architecture)  
> **Repository:** `roji-tech/AlEemaan`  
> **Active Branch:** `dev` (Synchronized with `master`); unmerged work: `claude/ui-gaps-students-settings` (Slice UI1, section 6)

---

## 1. Executive Summary & Architecture Overview

AlEemaan is a dedicated, single-tenant school management system built on Next.js, Prisma ORM, and PostgreSQL. It models a single educational institution operating across distinct physical branches (e.g., Primary, Secondary, Arabic branches).

### Key Architectural Tenets:
- **Tenant & Branch Isolation:** Unlike Octalve Edu's multi-tenant Row-Level Security (`app_user` with RLS policies), AlEemaan operates with application-level branch scoping using the `withBranch` combinator (ADR 0015). All academic and financial records enforce composite keys `(branchId, id)`.
- **Administrative Roles:**
  - `SUPER_ADMIN`: Cross-branch authority, manages global defaults, enforces system-wide policies, and is the sole authority permitted to grant or toggle self-approval for branch administrators.
  - `ADMIN`: Branch-scoped administrative authority.
  - `TEACHING_STAFF` / `NON_TEACHING_STAFF`: Staff records linked to branch memberships.
- **Audit Logging:** Single append-only `AuditLog` table capturing actor, action, diffs, and timestamp.

---

## 2. Milestone Alignment & Implementation Progress

### Completed Slices (Merged to `dev` & `master` Trunks)
| Milestone | Slice | Description | PR | Tests / Verification |
|---|---|---|---|---|
| 0001 | Phase 0.5.H | Users & Invitations Port | [PR #11](https://github.com/roji-tech/aleemaan/pull/11) | 811 tests passing |
| 0002 | Phase 0.5.2 | School Settings & Academic Sessions | [PR #13](https://github.com/roji-tech/AlEemaan/pull/13) | Passing |
| 0003 | Option 3 | Student Domain & Duplicate Override (ADR 0014) | [PR #14](https://github.com/roji-tech/AlEemaan/pull/14) | Passing |
| 0004 | Phase 1.3 | Attendance Domain & Touch Grid Port | [PR #15](https://github.com/roji-tech/AlEemaan/pull/15) | Passing |
| 0005 | — | Attendance Branch Scoping & Route-Role Guards | [PR #17](https://github.com/roji-tech/AlEemaan/pull/17) → #20 | Passing |
| 0006–0007 | S1–S8 | Branch Admins, Superadmins, & ADR 0014 acceptance | `claude/branch-admins-superadmins` | 1143 passing |
| 0008 | — | Input Hardening (ISS-0006, ISS-0007, ISS-0010) | `claude/hardening-iss-0006-0007` | 1149 passing |
| 0009 | — | Branch Combinator (`withBranch`, ADR 0015) | `claude/with-branch` | 1158 passing |
| 0010 | P1a | Classes, Arms, Subjects & Offerings | [PR #32](https://github.com/roji-tech/AlEemaan/pull/32) | 1164 passing |
| 0011 | P1b | Assessment Schemes & Grade Scales | [PR #34](https://github.com/roji-tech/AlEemaan/pull/34) | 1205 passing |
| 0012 | P1c | Staff Records & Teaching Assignments | [PR #35](https://github.com/roji-tech/AlEemaan/pull/35) | 1213 passing |
| 0013 | P1d | Academics Screens (Assessment, Grading, Staff) | [PR #36](https://github.com/roji-tech/AlEemaan/pull/36) | 1225 passing |
| 0014 | P2a | Results Tables, Entry & History | [PR #38](https://github.com/roji-tech/AlEemaan/pull/38) | 1242 passing |
| 0015 | P2b | Results Review Workflow (DRAFT → SUBMITTED → APPROVED → PUBLISHED → LOCKED) | [PR #39](https://github.com/roji-tech/AlEemaan/pull/39) | 1250 passing |
| 0016 | P2c | Report Cards, Remarks & Public Token Verification | [PR #40](https://github.com/roji-tech/AlEemaan/pull/40) | 1264 passing |
| 0017 | P2d | Results UI Screens (Entry Grid, Approval Console, ReportCardView, Print Styles) | [PR #41](https://github.com/roji-tech/AlEemaan/pull/41) | 1275 passing |
| 0018 | P2e | Settings + Approvals layer, CA schemes, report layouts, self-approval toggle | [PR #44](https://github.com/roji-tech/AlEemaan/pull/44) | Passing |
| 0019 | — | Attendance permissions (arm-scoped teacher role & grants with backfill) | [PR #45](https://github.com/roji-tech/AlEemaan/pull/45) | Passing |
| 0020 | — | PWA Foundation & Global Quick-Tools Dock | [PR #46](https://github.com/roji-tech/AlEemaan/pull/46) | Passing |
| 0021 | P3 | Timetable Canvas & Announcements Broadcast | [PR #47](https://github.com/roji-tech/AlEemaan/pull/47) | Passing |
| 0022 | P4 | Finance & Fee Invoicing Foundation with Paystack | [PR #48](https://github.com/roji-tech/AlEemaan/pull/48) | Passing |
| 0023 | P5 | Learning Management System (LMS) & Assignments | [PR #49](https://github.com/roji-tech/AlEemaan/pull/49) | Passing |
| 0024 | P6 | Multi-Channel Messaging & Communication Engine | [PR #50](https://github.com/roji-tech/AlEemaan/pull/50) | Passing |
| 0025 | P7 | Next-Term Student Promotion & Academic Rollover | [PR #51](https://github.com/roji-tech/AlEemaan/pull/51) | Passing |
| 0026 | P8 | Parent & Student Self-Service Portal | [PR #52](https://github.com/roji-tech/AlEemaan/pull/52) | Passing |
| 0027 | — | UI History Dialog in Review Tab & Results Branch Sync | [PR #55](https://github.com/roji-tech/AlEemaan/pull/55) | Passing |
| 0028 | — | Report Card Payment Gate & Standalone Document Export | [PR #56](https://github.com/roji-tech/AlEemaan/pull/56) | Passing |
| 0029 | Phase 7 | Legacy Data Migration Tooling & CLI Ingestion Engine | [PR #58](https://github.com/roji-tech/AlEemaan/pull/58) (`dev`), [PR #59](https://github.com/roji-tech/AlEemaan/pull/59) (`master`) | Passing |
| 0030 | — | Extended Staff HR Fields (`middleName`, `gender`, `dateOfBirth`, `designation`, `qualification`, `employmentDate`, `nextOfKin*`) | [PR #63](https://github.com/roji-tech/AlEemaan/pull/63) (`dev`), [PR #64](https://github.com/roji-tech/AlEemaan/pull/64) (`master`) | Passing |

---

## 3. Database Migrations Status (100% Deployed & Synchronized)

All 26 database migrations have been executed and validated against both local Docker and live production environments:

- **Local Docker Database:** `postgresql://aleemaan:aleemaan@localhost:5434/aleemaan` — 26 migrations applied.
- **Live Remote Database:** `postgres://...:5432/postgres?sslmode=require` (`db.prisma.io:5432`) — 26 migrations applied.
- **Latest Migration Applied:** `20261018150000_staff_extended_fields/migration.sql`

---

## 4. Architectural Blueprint: Phase 4 Operations & Admissions CRM

A detailed technical blueprint is documented in:
👉 **[`docs/tasks/0030-phase-4-operations-and-admissions-blueprint.md`](docs/tasks/0030-phase-4-operations-and-admissions-blueprint.md)**

### Modules Detailed in Blueprint:
1. **Extended HR & Payroll:** Multi-branch salary structures, allowances, statutory deductions (PITA PAYE, Pension Reform Act 2014, NHF 2.5%), monthly runs, payslips.
2. **Library Management:** Catalog-to-copy architecture, ISBN lookups, barcode tracking, loan checkouts, and overdue fines synced with student fee billing.
3. **Transport & Fleet Operations:** School buses, routes, ordered pickup/drop-off stops, passenger manifests, driver assignments, and term subscription fees.
4. **Inventory & Asset Management:** Fixed assets (lab apparatus, classroom furniture) vs. consumable inventory (uniforms, stationery), store requisitions, re-order threshold alerts.
5. **Government & Statutory Reporting:** Automated census data export conforming to Ministry of Education (MoE) and UBEC/NPA reporting requirements.
6. **Admissions Pipeline & CRM:** Public application portal, entrance tests, interview rubrics, offer letters, waitlist ranking, and atomic zero-rekeying conversion into permanent SIS records.

---

## 5. Verification & Test Suite Health

- **Suite Status:** 585 tests passing, 0 failures, 18 documented design skips.
- **Full Mutation Testing:** 45 mutations across Pagination (`P1`–`P19`), Validation (`V1`–`V8`), CSRF (`C1`–`C9`), and Password Policy (`W1`–`W9`) -> 100% caught.

---

## 6. Current work: Slice UI1, the Forms module and the question bank (2026-10-19) - START HERE

**Where the code is:** AlEemaan branch `claude/ui-gaps-students-settings`, 12+ commits ahead of `dev`, **not pushed, no PR yet**. Octalve branch `claude/ui-fixes-hydration-nav`, uncommitted/unpushed. Details: `AlEemaan/docs/tasks/0031-ui1-screens-and-security.md`.

**Migration order:** `20261019090000_hosted_schemes` (adds `AssessmentScheme.hosted`, rebuilds the one-live-scheme-per-scope index) must run on a live database BEFORE the code. Applied to the dev (:5434), `aleemaan_qa` and test databases only. The online test DB (db.prisma.io) was never reset (the reset was blocked by the permission system) and has the setup-wizard account from the first run.

**What UI1 did:** the Students screen, Approvals page, scheme levels, timetable batch, phone navigation, enforcement wiring for layouts and verification; portal hand-in and quiz taking; and closed cross-branch exposure (finance, coursework, announcements, timetable, communication, promotion, sessions), the answer-key leak, and "act as any pupil" on submissions. Product mismatches found: missing Students screen; phone More button hidden; class-arm route used by timetable/announcements did not exist; P2e APIs without screens; hosted-scheme index collision; layout PATCH failing on a fresh DB; wrong admin wording; silent unplaced class; role names that do not exist on the Coursework page; LMS/Communication using undefined design tokens (unstyled); Octalve Coursework unreachable.

**Rules learned (do not unlearn):**
- A pupil record has no login. Pupils and guardians act only through the portal (`/portal`, session cookie, admission number + guardian phone). STUDENT/PARENT staff-style memberships read published content only and cannot name a pupil.
- The app has no custom `dark:` variant: use the theme tokens (`text-ok-fg`, `bg-warn-bg`, `text-danger-fg`...). Tailwind classes such as `text-foreground`, `bg-primary`, `border-border` do NOT exist here or in Octalve.
- Routes that take a `branchId` from the query/body must use `withBranch` or `withAuthGated` (`src/lib/auth/branch-gate.ts`); `withAuth({ roles })` only means "a role in SOME branch".
- Published results are write-protected by a trigger: test cleanup must `resetDatabase()` (truncate), not `deleteMany`.
- A fixed date in a test ages out of the 7-day teacher attendance window.
- Do not run tests on `aleemaan_test` while a full suite runs; rebuild (`pnpm build`) before API/e2e runs, the servers under test are a production build.
- **The build script runs `prisma generate` first (2026-10-19).** Vercel restores a cached `node_modules` ("Already up to date"), so Prisma's install-time generate does not run again and a schema change builds against the OLD client: PR #67's preview failed type-checking (`'hosted' does not exist in type AssessmentSchemeCreateInput`) while the same code built locally. Reproduced by generating from `dev`'s schema and running `tsc` (5 errors, the same as the Vercel log), fixed by `"build": "prisma generate && next build"` (0 errors). `prisma generate` needs no `DATABASE_URL`. Octalve Edu has the same stale-cache failure on its `dev` (see its HANDOVER).

**Test state:** final full run on the final code (2026-10-19): 1538 passed, 2 failed, 18 skipped; both failures read, one fixed (a test that asserted the wrong element), one load-sensitive (`https/host-cookie`, passes alone); details in `docs/tasks/0031-ui1-screens-and-security.md`. Mutation passes still deferred to the end of Phase 2.

**Open / next (the maintainer decides order):**
1. Open the AlEemaan PR into `dev` (check `base.ref` is `dev` before merging) and the Octalve PR into octalve-core `dev`; never promote to master/prod without approval.
2. **Forms module** (decided 2026-10-19): kinds quiz / practice set / questionnaire / physical hand-in; audiences member and public chosen per form; anonymity chosen per form (responses unlinked, a separate "has answered" table); teacher marking per question or per attempt; physical hand-in is a roll-call the teacher closes, a pupil can only REQUEST to be marked. Write the design note first.
3. **Question bank** (requested 2026-10-19): questions reused in quizzes/tests/exams and in questionnaires (a separate bank), editable copies when used, saved in any format only after approval by an admin or people the admin assigns, class tags (several), pupils practise from the portal. Open design questions are listed in the conversation and must be answered before the note.
4. Portal sign-in secret = guardian phone: replace.
5. Rotate the DB/Redis credentials that were pasted in chat.
6. Octalve: support-grants route now reads the platform administrator through `lib/support/grants.ts`; 3 routes have no UI (higher-ed transcript, people/enrolment-counts, students/[id]/report-card).

### 6.1 Question bank - the maintainer's decisions (2026-10-19)
- Questions are chosen from the bank when setting a test, exam or quiz, and may be modified at will. A SEPARATE bank for questionnaires is allowed.
- Any format may be saved to the bank, but only after approval by an admin or the people the admin assigns: **general reviewers and per-subject reviewers**. Admins can always override.
- **Scope is chosen by the admin per question: general (all branches) or restricted to one branch.**
- Questions carry class labels, several allowed (a question may serve several classes).
- Used in a quiz/exam, a question is a **copy with a link back to the bank item** (edits never change past papers). A modified copy can be offered back to the bank as a NEW question and must be approved before it enters the bank.
- Pupils **practise from the portal** with bank questions by class and subject, see the right answer after trying, and a **practice history is kept** (progress over time; teachers may see class-level weak topics). Practice attempts are never marks.
- Design note first (plan-before-code), then build. Not started.

### 6.2 Question bank - second round of decisions and open points (2026-10-19)
- Pupil practice: the pupil chooses feedback timing (answer after EACH question, or after finishing the whole set) and the NUMBER of questions; the maximum is set by the SUPERADMIN (not the branch admin) with a default.
- Images on a question: at most 3 (maybe 4), each with a maximum size. Question types: single-choice AND multiple-selection (more than one right answer).
- Reports on questions ("report an issue", not a public thread): pupil reports shown to reviewers by SECTION only (e.g. "a pupil in JSS"), not the class. Separate on/off switches for teacher reports and pupil reports; admins set them per branch; the superadmin can switch either off school-wide or for a branch; a branch cannot override a school-wide off.
- Exam hold: see 6.3; the maintainer raised that hiding a held question is itself a signal to anyone who recognised it, and that a "similar to a held question" warning should go to the admin, not the uploader. Treated below in the design note.

### 6.3 Question bank - exam secrecy redesign (2026-10-19) - supersedes the "hold" idea in 6.2
- NO dynamic hold. A question the pupils could see must never disappear (a disappearing question tells anyone who knew it that an exam is near, and "question not available" is a disclosure). Rule: **a question may appear later, never disappear.**
- Visibility is static, set at approval by the approver: PRACTICE (pupils may practise), TEACHERS_ONLY (never shown to pupils; a class of questions that is always teacher-only), or TEACHERS_ONLY_UNTIL <date/exam close> (appears for practice later). The uploader only ever sees "approved".
- The "similar to a protected question" warning goes ONLY to the EXAM approving reviewer (a designated reviewer role), never the uploader or an ordinary reviewer. The approver can approve and keep the question out of the pupil pool until the exam closes.
- A practice-pool question later chosen for an exam is NOT hidden; the exam item records "exposed to practice" so the teacher sees the risk.
- A question created inside an exam is offered to the bank only when the teacher or an admin chooses.
- Practice size: pupil picks the number; max and default set by the SUPERADMIN. The maintainer finds 10 too small: proposed default 20, presets 10/20/30/50, max 100, plus a per-pupil daily cap (anti-scraping). Superadmin also sets the minimum pool size before practice is offered for a subject/class and the date ranges (small-bank and large-bank behaviour).
- Teachers' personal exam/test templates: a template used by a scheduled exam is hidden from sharing, copying and browsing until the exam closes.
- Printing: teachers cannot print exam questions in the "near exam" and "exam" window; the window length is set by the SUPERADMIN. Open: an exam officer (the exam approving reviewer) must still be able to print for the sitting, audited and watermarked; browser print/screenshots cannot be fully prevented, so the controls are server-side PDF, watermark with name and time, and an audit trail.

### 6.4 Question bank - reviewer scope and pupil printing (2026-10-19)
- The exam approving reviewer can be GENERAL (all subjects) or PER SUBJECT (like the ordinary reviewers). Several allowed.
- Pupil printing (proposed, awaiting the maintainer's confirmation): practice sets and a pupil's own finished practice may be printed any time (server-made PDF, pupil name and time watermark, counts toward the daily practice cap, answers only if already revealed); a quiz/assignment/exam the pupil has not yet submitted cannot be printed by the pupil (a teacher can release a printable handout for physical-hand-in work); after submission the pupil may print their own questions and answers; exam papers are never printable by pupils in the near-exam/exam window, and afterwards only when the teacher releases them.

### 6.5 Question bank - access switches, screenshots, and the state at handover (2026-10-19)
- The SUPERADMIN can disable access to the question banks per kind of person: pupils, staff, admins (each separately; and per branch). A disabled group sees no bank, no practice, no reports. Every switch change is audited.
- Screenshots/photos: a browser or installed web app (PWA) CANNOT prevent screenshots or photos of a screen. Only a native wrapper can partly: Android (FLAG_SECURE blocks screenshots and recording), iOS (can detect a screenshot or recording, cannot block it). A second device's camera can never be stopped. Controls we CAN build: watermarked server-made PDFs, audit trail, rate limits, no dynamic hold. For in-school computer-based exams the real answer is controlled devices / a lockdown browser (separate project). Tell the maintainer this plainly.
- "Log everything": every decision of this conversation is in sections 19.1-19.5 of this file; the build record is `AlEemaan/docs/tasks/0031-ui1-screens-and-security.md`.

**STATE AT HANDOVER (read first):**
1. AlEemaan: branch `claude/ui-gaps-students-settings` (14 commits ahead of `dev`, last code commit stage 7, then 2 docs commits). NOT pushed, NO PR. A full-suite run on the final commit was started in the background and its log is `full-ui1-final.log` in the session scratchpad (if the session is gone: re-run `TEST_DATABASE_URL=postgresql://roji:roji@127.0.0.1:5432/aleemaan_test pnpm exec playwright test --timeout=120000` after `pnpm build`, ~1.6 h; do not run anything else on `aleemaan_test` meanwhile). Before stage 7: 1526 passed, 5 failed (all explained and fixed or timing).
2. Octalve: branch `claude/ui-fixes-hydration-nav`, commit d5f1129, not pushed, no PR. Full suite 2069 passed, 13 failed, explained in its `docs/tasks/current-tasks.md`; 2 pre-existing failures on `dev` remain (phone More sheet Users tab; academics "staff may LOOK" Open button).
3. NOT done: opening the two PRs (check `base.ref` is `dev` before any merge; never promote to master/prod without approval); Forms module and question bank design note and build; portal sign-in secret replacement (limits and one failure message are in `claude/fail-closed-secrets`, the guessable secret itself is not changed); credential rotation (maintainer); online-DB reset (blocked by the permission system, needs the maintainer); mutation passes (deferred to the end of Phase 2).
4. Migration `20261019090000_hosted_schemes` must precede the AlEemaan code on any live database.
5. Order of work proposed: PRs -> design note for Forms + question bank (plan-before-code, one note) -> practice sets -> question bank -> questionnaires -> physical hand-in -> manual marking.


### 6.5b Question bank - last two answers (2026-10-19)
- "Teachers only until a date" can be set by the exam approving reviewer OR by the uploader's admin (not by the uploader).
- Pupil practice history is kept for the same retention as other pupil data. A pupil can only ARCHIVE entries (hide them from their own view), never delete them; archived entries stay under the normal retention and still feed the class-level summaries teachers see.
- With these answered, the design note for the Forms module and the question bank can be written (plan-before-code), then built in the order in 6.5.

### 6.5c The design note exists
`docs/development-history/forms-and-question-bank-design.md` is written (data model, permissions table, exam-secrecy rules, flows, API, settings keys, abuse controls, build order, tests). Task file: `docs/tasks/0032-forms-and-question-bank.md`. Start building at slice 1 only after the UI1 PR is merged. Small open items are listed in section 16 of the note.

### 6.6 How the maintainer wants hand-offs done
Use THIS file (`docs/HANDOVER.md` in each repository). Do not use `/home/rojitech/Desktop/CODEC/out/HANDOFF-FOR-NEXT-AI.md` any more (maintainer's instruction, 2026-10-19); it is kept only as history. Keep `docs/tasks/current-tasks.md`, `docs/open-items.md` and the task file in step with every real change.

### 6.7 Walkthrough videos and PDFs that double as a flow audit (2026-10-19) - runs LAST
- The maintainer wants, **for each project separately**, a video and a PDF with screenshots of every feature, made **only by what a person can do in a browser** (click, type, choose files, follow links): no SQL, no API calls, no deep-link jumps, no silent "if visible" skips, one continuous journey from a freshly set-up empty database. It doubles as a flow audit and **its findings get fixed**.
- Decisions: it runs **after all other tasks are done** (so after Task 0032); outside-the-browser steps use the in-app stand-ins (dev email inbox, mock payment, the on-screen two-step secret); **the full journey is recorded in all three: desktop light, desktop dark, phone**; defects and missing screens are fixed (with tests), product choices are asked, not guessed.
- The full specification, rules and guardrails are in `docs/tasks/0033-walkthrough-flow-audit.md`. Nothing is built.
- Answered the same day: **Octalve's question-bank parity (its own design note, then the build) comes BEFORE Octalve's walkthrough**; "all tasks" includes it.
- **Merging (maintainer, 2026-10-19): "yes merge".** The AI may merge the AlEemaan and Octalve PRs into `dev` once the full suite is green (for Octalve: no failure that is not already failing on `dev`) and `base.ref` is verified to be `dev`. Merging into `master`/`prod` still needs the maintainer's explicit approval.
- **Portal secret:** the maintainer runs the app locally and said to set `SESSION_SECRET` locally; done in the git-ignored `.env` and documented in `.env.example`. Then "go for it" (and "sync octalve and AlEemaan"): the hard-coded fallback is gone (branch `claude/fail-closed-secrets`): the server logs and exits with code 1 unless `SESSION_SECRET` is at least 32 characters with at least 10 distinct ones, and a signed portal token of the wrong shape is refused. **Deploy note: `SESSION_SECRET` and `PAYSTACK_SECRET_KEY` must be set wherever this is deployed** (without the second, online payments answer 503 and the webhook refuses everything; that is deliberate). The same branch ports Octalve's fail-closed payment modes (`resolvePaystackMode`) and hardens portal sign-in (limits, one failure message, exact admission-number match). `tests/support/env.ts` supplies fixed test values for both secrets. **Octalve sync (2026-10-19), checked, not affected:** Octalve has no guardian portal sign-in, no secret read with a string-literal fallback (a grep of `src` for `process.env.<...SECRET|KEY|TOKEN|SALT|PEPPER...> || or ?? "literal"` finds none; the Paystack key is read through an `env` object in `src/lib/finance/paystack.ts`, which that grep does not cover, but that file is the fail-closed design itself), and it already owns the payment design that AlEemaan was brought back to. A startup check for Octalve's own required secrets was not looked at; it is not part of this change.

### 6.8 Question bank - two design gaps found and decided (2026-10-19)
- Classes and subjects are per-branch rows, so a "general" (all-branches) question cannot point at them. **Decided: tags are text matched by normalised name** ("we'll just have to do some normalization"): a tag keeps the label as typed plus a `labelKey` from one pure `normalizeLabel()`; nothing is added to `ClassGroup` or `Subject` for tags; per-subject reviewers work the same way.
- "Section" (shown to reviewers instead of a class) had no source. **Decided: an optional `ClassGroup.section` the admin sets**; the branch name is shown when it is empty; it arrives with slice 5.
- Details and the slice 1 plan: design note section 16a and `docs/tasks/0032-forms-and-question-bank.md` section 4.

### 6.9 Standing rules added by the maintainer (2026-10-19, three messages)
- **Always search for bugs, potential issues, design gaps and user-flow gaps**, in every task, not only the ones named. Findings go in `docs/open-items.md` section 1b with severity and evidence; defects are fixed with a test seen to fail first; product choices are asked.
- **Also test edge cases and fuzz for security anomalies**: seeded, deterministic generators (no new dependency), random and hostile inputs, boundaries, malformed and oversized data, replays, concurrency. See `tests/unit/portal-token-fuzz.spec.ts` for the pattern.
- **Test UI gaps, UX issues and user-flow gaps, "test all"**: for every screen or flow touched and its neighbours: empty, loading, error and success states, wording, keyboard and focus, both themes, phone width, axe, dead ends, an API with no screen. The whole-product browser audit is Task 0033 (runs last); this applies to every slice before it.
- **Octalve and AlEemaan are kept in sync** (CLAUDE.md rule 7; Octalve's design is canonical for shared parts). A fix in one is checked against the other and the result recorded in both HANDOVER files, including "checked, not affected".
- **Do not run two full suites at once** on the same machine: the second one slowed the first enough to fail a 5 s assertion (open-items 1b).

