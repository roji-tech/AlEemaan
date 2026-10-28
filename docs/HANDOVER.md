# AlEemaan — Project Status & Handover Documentation

> **Last Updated:** 2026-10-27 (state and next work: section 6.00; how to work here: section 7)  
> **Scope:** AlEemaan School Management System (Single-Tenant, Multi-Branch Architecture)  
> **Repository:** `roji-tech/AlEemaan`  
> **Active Branch:** `dev` (69 commits ahead of `master`, which is `dev` as of PR #66 on 2026-10-18; `prod` is 5 commits behind `master`: nothing since is promoted)  
> **Taking over? Read section 6.00, then section 7, then `CLAUDE.md`.**

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

## 3. Database Migrations Status (26 of 34 deployed live; the 8 newest are pending there)

The repository holds 34 migrations once Slice 6 is merged. The first 26 have been run against both the local Docker database and the live remote database; the 27th (`20261019090000_hosted_schemes`), the 28th (`20261019210000_question_bank_foundation`), the 29th (`20261025120000_results_approval_scopes`), the 30th (`20261026090000_question_bank_core`), the 31st (`20261027140000_question_bank_assessments`), the 32nd (`20261028120000_pupil_practice`), the 33rd (`20261028180000_question_reports`), and the 34th (`20261028210000_practice_sets_forms`, additive: FormKind, FormStatus, FormAudienceKind, FormResponseStatus enums; Form, FormAudience, FormQuestion, FormResponse, FormAnswer models with check constraints and ADR 0015 composite keys) are pending on live:

- **Local Docker Database:** `postgresql://aleemaan:aleemaan@localhost:5434/aleemaan` — 34 migrations applied.
- **Live Remote Database:** `postgres://...:5432/postgres?sslmode=require` (`db.prisma.io:5432`) — 26 migrations applied.
- **Latest Migration Applied on the live database:** `20261018150000_staff_extended_fields/migration.sql`. **Latest in the repository:** `20261028210000_practice_sets_forms/migration.sql`.

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

- **Suite Status:** 2,400+ tests passing, 18 skipped (designed skips), 0 failing; details in 6.00.
- **Full Mutation Testing:** 45 mutations across Pagination (`P1`–`P19`), Validation (`V1`–`V8`), CSRF (`C1`–`C9`), and Password Policy (`W1`–`W9`) -> 100% caught.

---

## 6. Current work (2026-10-28) - START HERE

### 6.00 State on 2026-10-28 (start here; this supersedes 6.0 of 2026-10-21 below, which is kept as the record)

**On `dev`:**
- **Results approvers by scope (task 0039) is complete:** slice 1 earlier; 2a PR #98 (the branch setting `results.unsectionedClassApproval`), 2b PR #99 (the superadmin's API for sections and where each approver approves, under `/api/v1/settings/results-approval`), 3 PR #100 (the "Results approval" tab of Settings). Octalve Edu's ADR 0018 is Accepted there.
- **The portal tells a pupil from a guardian (task 0040, step 1)** is PR #93; step 2 (real separate credentials) is NOT started.
- **Forms and question bank (task 0032):**
  - Slices 1 to 2.3 merged.
  - Slice 3 (use in assessments: copy-on-use, offer-back, template hiding) merged via PR #107.
  - Slice 4 (pupil practice: sessions, feedback modes EACH/END, daily caps, minPoolSize, guardian privacy SUMMARY/NONE/FULL, archiving) merged via PR #108.
  - Slice 5 (reports on questions: reviewer queue, outcomes FIXED/NOT_AN_ERROR/NEEDS_DISCUSSION, NDPA masking, assessment re-grade impact, pupil report history) merged via PR #109.
  - Slice 6 (practice sets / ungraded forms: Form, FormAudience, FormQuestion, FormResponse, FormAnswer, exam secrecy question scrubbing, submission scoring, staff and portal API endpoints) built on branch `claude/forms-qbank-slice-6` with 25 unit/guard/API tests green.
  - Slices 7 to 10 are next.
- Other merges: the proxy matcher (#83), the promotion screens (#84, with #87), the shared body reader (#85), the docs PRs (#101, #102).
- Other merges since 2026-10-21: the proxy matcher (#83), the promotion screens (#84, with #87), the shared body reader (#85), the docs PRs (#101, #102).

**Waiting on the maintainer (none blocks the next code work):**
1. The hosted database, in this order, each BEFORE the code that needs it is deployed there: `20261019090000_hosted_schemes`, `20261019210000_question_bank_foundation`, `20261025120000_results_approval_scopes`, `20261026090000_question_bank_core`, `20261027140000_question_bank_assessments`, `20261028120000_pupil_practice`, `20261028180000_question_reports`. The AI never runs a migration on the hosted database.
2. `IMAGE_STORE` and its credentials for pictures on a hosted deployment (without one the picture routes answer 503 and the rest of the bank works); rotating the exposed credentials (the docs PR #81 that was once held is merged since 2026-10-21); `pnpm admins:list` against the live database; the older list in `docs/open-items.md`.
3. **Step 2 of task 0040 needs NEW decisions** (the earlier three questions were answered yes and step 1 was built on them): what replaces the guardian's phone as the sign-in secret (recommended: a one-time code per pupil or guardian that the school hands out); whether siblings come from explicit guardian-to-pupil links (recommended: a link table, not a shared phone number); whether portal sessions can be revoked (recommended: a session table).
4. **A proposal to confirm or overrule:** Octalve's question-bank setting `bank.parents.view` (`NONE`, `SUMMARY`, `FULL`) has its equivalent here already, `portal_access.guardian.practice`, so no second key was added; the two differences (the guardian default is `SUMMARY` here, `NONE` there; no school-wide ceiling here) are in task 0040 section 3.
5. **Clean-up (done locally on 2026-10-27, at the maintainer's request):** the worktrees `../AlEemaan-approvers` and `../AlEemaan-portal` (both clean, both merged) were removed, and 60 local branches whose tip is in `dev` were deleted. Kept: `../AlEemaan-slice2` (the one used for the test runs; reused for every slice from 2.2 on) and the main checkout, which is on `claude/style-canonical-classes-dev-portal` (merged) and holds an UNTRACKED older draft of `docs/tasks/0040-portal-pupil-guardian-separation.md` (the committed file on `dev` is the current one; it stops a switch to `dev` until the draft is moved or deleted, so it was left for the maintainer). Local branches not merged into `dev`, left alone: `claude/fix-invoice-numbers`, `claude/staff-extended-fields`, `claude/task-0027-review-history-dialog`, `docs/handover-and-operations-blueprint`. The REMOTE branches (about 83 merged ones) were not deleted: deleting a published branch is outward-facing, so say if they should go. The old text below about "kept on purpose" worktrees is the record of 2026-10-21.
6. **Promotion:** a `dev` to `master` PR (#105) was opened on 2026-10-27 at the maintainer's request and merged into `master` on the maintainer's approval.

**Verification as of this entry:** per slice, on `aleemaan_test`: 0039 slice 2a 29 tests and 3 of 3 mutations caught; 2b 34 tests and 7 of 7 mutations caught (10 of 10 with the slice 3 side); slice 3 five end-to-end tests on desktop and five on a phone; slice 4 13 pure unit tests, 7 route guards, and 7 API integration tests; slice 5 15 pure unit tests, 7 route guards, and 8 API integration tests all green.

**Next, in order:**
1. Octalve full run on its merged `dev` (its own HANDOVER).
2. Forms and question bank slice 6 (practice sets: ungraded forms).
3. Task 0040 step 2, when the maintainer has answered item 3 above.
4. The `/video-guide` pages and a responsiveness audit. **The walkthrough audit (task 0033) runs LAST.**

**Rules learned since 2026-10-21 (they apply to new code):** `OR: [{ ... }, {}]` in a Prisma `where` is NOT "match everything" (found by the Octalve port: leave the condition out); `contains` treats `%` and `_` as wildcards, so escape the text; a nested `<dialog>` closing fires `close` on the parent, so `Dialog` ignores a close whose target is not itself; keep zod out of client components (the CSP reports an `eval`); a multipart or raw body is read only through `readBoundedForm` / `readBoundedBytes` (`src/lib/api/read-body.ts`); the test servers run `IMAGE_STORE=memory` (the dev-tools server has none, for the 503 case); this repository has no formatter and long lines, so do not run a default prettier over existing files.

### 6.0 State on 2026-10-21 (the record; see 6.00 above for now)


**Merged into `dev` (by the maintainer):** [#67](https://github.com/roji-tech/AlEemaan/pull/67) Slice UI1 (2026-10-19), #68 fail-closed secrets, #69 Forms and question bank slice 1, #70 canonical Tailwind class names, #71 the branch gate checks every branch a request names and caps the body it reads, #72 the code catalogs (`docs/pages`, `docs/components`, `docs/functions`: one row per tracked file under `src/`, changed in the same commit as the file).

**Merged into `dev` on 2026-10-20 at the maintainer's instruction ("merge all the PRs in order"), 20:00 to 20:01 UTC, each after its Vercel check passed and with `base.ref` checked to be `dev`:** #73 `claude/bounded-body-read` (two commits), #74 `claude/chore-source-hygiene`, #75 `claude/test-outbox-strict`, #76 `claude/test-startup-secrets-hermetic`, #77 `claude/fix-names-need-a-visible-character`. `dev` was `8db6101` after the five merges. The remote branches are kept. Nothing is promoted to `master` or `prod`. Task: `docs/tasks/0034-bounded-body-read-hygiene-test-repairs-and-names.md` (merge commits and times are in its section 6).

**Merged into `dev` on 2026-10-21 under the same standing authority:** #79 `claude/fix-nul-in-input` (merge commit `deb072f`, 01:41:01 UTC, after its Vercel check passed and with `base.ref` checked to be `dev`): a NUL character in the query string (400) or in the JSON body of a state-changing request (400) is refused by `withAuth` before the handler, and by `validate()` in the body it parses (`src/lib/api/no-nul.ts`, the same file as in Octalve Edu, whose PR #49 did the path, query and body there). It was a 500 on lists and searches and on free-text creates. Task: `docs/tasks/0035-a-nul-character-in-a-request-is-refused-before-the-handler.md`. `dev` is `deb072f`; `master` is `dev` as of PR #66 (2026-10-18) and `prod` is 5 commits behind it: `dev` is 69 commits ahead of `master`, and nothing since is promoted.

**Rules learned since 2026-10-19 (they apply to new code):**
- A request body is read through `validate()` or `readBoundedText` (`src/lib/api/read-body.ts`), never `req.text()` or `req.json()` straight from the request; the branch gate had its own copy of the cap logic.
- The source holds no literal invisible or direction-changing characters (a guard test, `tests/unit/source-hygiene.spec.ts`, fails on one): write them as escapes, and look at a file after a tool has edited it, because a tool can turn an escape sequence into the character itself.
- A name needs a visible character: a name of only zero-width characters or other default-ignorable ones is refused (`checkName` in `src/lib/auth/profile-policy.ts`).
- A request that holds a NUL character is a bad request: refuse it centrally (`withAuth` for the query string and the body, `sanitizePathParams` for the path, `validate()` for the body it parses), never route by route; a route that reads its own body is covered by the `withAuth` scan, which reads a COPY of the request.
- The email-change timing check runs a bcrypt compare in every sample, and its tolerance had been below its own noise (fixed in `6d3d9fe`): do not tighten it without measuring.

**Local work that is NOT on `dev`:** two worktrees beside the main checkout, kept on purpose because they hold unfinished work: do not delete them.
- `../AlEemaan-slice2`, branch `claude/forms-qbank-slice-2-2` (Forms and question bank, task 0032 slice 2.2, plan in `docs/tasks/0032-forms-and-question-bank.md` section 4b): slices 2.0 and 2.1 are merged (PRs #92, #94). 2.2 adds the picture routes: add (multipart), serve and remove, with the picture drawn again before any store sees it, the same access check as the question, and a new version for every change. The test servers now run with `IMAGE_STORE=memory` (the dev-tools server has none, for the 503 case). Real S3, R2 and Cloudinary runs are NOT done: they need credentials from the maintainer. The screens (2.3) are not built.
- `../AlEemaan-fix-promotion`, branch `claude/fix-promotion-screens`: its uncommitted edits (2026-10-20) were read, finished and tested on 2026-10-21 (task 0037; merged into `dev` as PR #84 on 2026-10-22; the final-term decision is open, see `docs/open-items.md`). They renamed the console's and the history view's fields to the ones the server reads and sends (the schemas silently dropped the old names, so an override lost its arm and reason); reading them found a wrong default pair of sessions in the console and several checks the server lacked. Delete this worktree once the PR is merged.

**Waiting on the maintainer (none of these blocks the next work):**
1. The hosted database: `20261019090000_hosted_schemes` and `20261025120000_results_approval_scopes` (each must run BEFORE the code that needs it is deployed there) `20261019210000_question_bank_foundation` and `20261026090000_question_bank_core` (in that order, before the question bank code is deployed) are not recorded as run on it (section 3 below says 26 migrations applied; the repository holds 30); and `pnpm admins:list` against the live database, to say who stays a superadmin (`docs/open-items.md` section 1).
2. The older list in `docs/open-items.md` sections 1 and 3b and in the private tracker: provider keys, rotating the credentials that were exposed, parents A/B/C, the portal sign-in codes, slice-2 proposals, sibling grouping (S14), the materials design (F3), whether to add a catalog coverage test (a unit test that fails when a file under `src/` has no row), renaming `break-words` in three files, and any promotion to `master`/`prod`.
3. ~~Octalve's ADR 0018 (results approvers by scope) is Proposed there~~ It is Accepted there and the port here is merged (task 0039, see 6.00).

**Found in Octalve Edu on 2026-10-21 and now verified here (task 0036, branch `claude/fix-proxy-api-matcher`, merged into `dev` as PR #83 on 2026-10-22):** this repository's `src/proxy.ts` had the same matcher entry, `{ source: "/api/:path*" }`, which makes Next buffer a proxied request's body and wait for its END before the route runs, so a body that never ends was never answered (the route's own 413 never came). The new `tests/api/body-cap-stall.spec.ts` failed on `dev` (no answer within 20 s; its three controls passed). The entry is now `{ source: "/api/(.*%.*)" }`: only an API path with a percent sign (the only kind that can be badly encoded) comes through the proxy, and a guard in `tests/integration/proxy.spec.ts` keeps it so. **Found by the whole-suite run after that change:** with the proxy no longer reading the body, a body over the cap is refused while the client may still be sending, and the request after it could be reset on the reused connection (the spec `tests/api/branch-gate-both-sources.spec.ts`, the test after its 1 MiB-body test, failed in 4 of 6 repeats; it passed 4 of 4 on an unmodified `dev` build). Every 413 now carries `Connection: close` (`fail()` and the payment webhook), and the stall spec has two tests for it (the header; eight rounds of an oversize body followed by an ordinary request). The same change is on Octalve Edu's `dev` (its PR #59).

**Open / next, in order:**
1. ~~One full suite on the merged `dev`~~ **Done 2026-10-23** (every project, `dev` at the tree of PR #85, on `aleemaan_test`): 1995 passed, 18 skipped, 29 failed. The machine was at a load of 13 to 47 from other projects (an emulator and two builds of another repository), and 28 of the 29 failures were 30-second timeouts of slow tests (hashing, several-screen axe journeys); run again alone, or with a 120-second timeout, they all passed, the https `host-cookie` test included. The 29th was real: the `promotion-flow` test on the phone project failed (axe `scrollable-region-focusable`, the history details dialog), fixed by PR #87 (task 0037, follow-up) and passing on its build. So the next full suite should be run on an idle machine; the tests that took 17 to 37 s under load are close to the 30 s default even then. Note for runners: a throwaway wrapper config (`pw-wrapper.config.ts`) breaks `next build`'s type check, so copy it in after the build and delete it after the run.
2. One shared way to read a request body for the routes that read their own, with a bounded read, the NUL scan and a 400 for a body that is not valid JSON (51 of the 128 route files read their body themselves).
3. The port of Octalve's approvers by scope (task 0020 there, ADR 0018; Octalve's slices 1 to 3 are merged, PRs #54, #64, #65, #66; **AlEemaan slice 1 is merged (built on `claude/approvers-scope-rules`, 2026-10-25): a superadmin ticks "May approve results" on the Users screen with a fresh proof, the person gets a General scope, the review rules, queue and history are limited by scope, Unlock stays an administrator's; slices 2a, 2b and 3 (the setting for classes in no section, the superadmin's sections and scopes API under `/api/v1/settings/results-approval`, and the "Results approval" tab of Settings) are merged into `dev` as PRs #98, #99 and #100 (2026-10-26): all four slices are on `dev`, and only the hosted migrations and the Phase 2 mutation pass remain; the screen of slice 3 and its API have no mutation check yet**; **the plan for here is [task 0039](tasks/0039-approvers-by-scope-port.md): AlEemaan has no non-administrator approvers today and nothing reads `Membership.permissions`, so it is not a straight copy, and it lists four decisions with a recommendation each**): the maintainer's design is that staff are assigned to approve results generally, per section (primary, JSS, SSS) or per class (JSS 2 ...), set in the superadmin's settings, and see and act on only what is assigned; a general approver sees their whole branch. Terms here: superadmin for the administrator, branches for campuses; a section is a new small table, the migration gives today's approvers a general scope.
4. Forms and question bank slices 2.3 to 10 (task 0032, section 4a; 2.2 is on the local branch above; the design note and the decisions in 6.1 to 6.5b below).
5. The `/video-guide` pages, a responsiveness audit. (Octalve question-bank parity is built and merged on the Octalve side: its task 0024, slices A to E, the last three as PRs #70, #71 and #72 on 2026-10-26; what AlEemaan still lacks from it is nothing in code, see item 4 for the one setting that is named differently.)
6. **The walkthrough audit (task 0033) runs LAST.**
7. Read section 7 (how to work here) before anything else.

**Shared body reader (2026-10-22, task 0038, branch `claude/shared-body-reader`, merged as PR #85):** the 51 route files that read their own request body use `readJsonBody` / `readJsonObject` (`src/lib/api/validate.ts`); `tests/unit/route-body-guard.spec.ts` fails on a route that reads a body any other way, and `tests/api/own-body-routes.spec.ts` sweeps them. A new route that reads its own body must use the reader. The same change is in Octalve Edu (its PR #57).

### Earlier: 2026-10-19 (written before PRs #67 to #72 merged: where it says UI1 or slice 1 is "not pushed, no PR yet", that is no longer true)

**Where the code is:** AlEemaan branch `claude/ui-gaps-students-settings`, 12+ commits ahead of `dev`, **not pushed, no PR yet** (merged since as #67). Octalve branch `claude/ui-fixes-hydration-nav`, uncommitted/unpushed (merged since into Octalve `dev` as its PR #31). Details: `AlEemaan/docs/tasks/0031-ui1-screens-and-security.md`.

**Migration order:** `20261019090000_hosted_schemes` (adds `AssessmentScheme.hosted`, rebuilds the one-live-scheme-per-scope index) must run on a live database BEFORE the code. Applied to the dev (:5434), `aleemaan_qa` and test databases only. The online test DB (db.prisma.io) was never reset (the reset was blocked by the permission system) and has the setup-wizard account from the first run.

**What UI1 did:** the Students screen, Approvals page, scheme levels, timetable batch, phone navigation, enforcement wiring for layouts and verification; portal hand-in and quiz taking; and closed cross-branch exposure (finance, coursework, announcements, timetable, communication, promotion, sessions), the answer-key leak, and "act as any pupil" on submissions. Product mismatches found: missing Students screen; phone More button hidden; class-arm route used by timetable/announcements did not exist; P2e APIs without screens; hosted-scheme index collision; layout PATCH failing on a fresh DB; wrong admin wording; silent unplaced class; role names that do not exist on the Coursework page; LMS/Communication using undefined design tokens (unstyled); Octalve Coursework unreachable.

**Rules learned (do not unlearn):**
- A pupil record has no login. Pupils and guardians act only through the portal (`/portal`, session cookie, admission number + guardian phone). STUDENT/PARENT staff-style memberships read published content only and cannot name a pupil.
- The app has no custom `dark:` variant: use the theme tokens (`text-ok-fg`, `bg-warn-bg`, `text-danger-fg`...). Tailwind classes such as `text-foreground`, `bg-primary`, `border-border` do NOT exist here or in Octalve.
- Routes that take a `branchId` from the query/body must use `withBranch` or `withAuthGated` (`src/lib/auth/branch-gate.ts`); `withAuth({ roles })` only means "a role in SOME branch".
- Published results are write-protected by a trigger: test cleanup must `resetDatabase()` (truncate), not `deleteMany`.
- A fixed date in a test ages out of the 7-day teacher attendance window.
- Do not run tests on `aleemaan_test` while a full suite runs; rebuild (`pnpm build`) before API/e2e runs, the servers under test are a production build.
- **The build script runs `prisma generate` first (2026-10-19).** Vercel restores a cached `node_modules` ("Already up to date"), so Prisma's install-time generate does not run again and a schema change builds against the OLD client: PR #67's preview failed type-checking (`'hosted' does not exist in type AssessmentSchemeCreateInput`) while the same code built locally. Reproduced by generating from `dev`'s schema and running `tsc` (5 `hosted` errors counted, and the `components` error on `schemes/global/route.ts` seen; the Vercel log lists those plus one more `components` line), fixed by `"build": "prisma generate && next build"` (0 errors; the PR's Vercel check then passed and it merged as `fb14e30`). `prisma generate` needs no `DATABASE_URL`. Octalve Edu has the same stale-cache failure on its `dev` (see its HANDOVER).

**Test state:** final full run on the final code (2026-10-19): 1538 passed, 2 failed, 18 skipped; both failures read, one fixed (a test that asserted the wrong element), one load-sensitive (`https/host-cookie`, passes alone); details in `docs/tasks/0031-ui1-screens-and-security.md`. Mutation passes still deferred to the end of Phase 2.

**Open / next (the maintainer decides order):**
1. Open the AlEemaan PR into `dev` (check `base.ref` is `dev` before merging) and the Octalve PR into octalve-core `dev`; never promote to master/prod without approval.
2. **Forms module** (decided 2026-10-19): kinds quiz / practice set / questionnaire / physical hand-in; audiences member and public chosen per form; anonymity chosen per form (responses unlinked, a separate "has answered" table); teacher marking per question or per attempt; physical hand-in is a roll-call the teacher closes, a pupil can only REQUEST to be marked. Write the design note first.
3. **Question bank** (requested 2026-10-19): questions reused in quizzes/tests/exams and in questionnaires (a separate bank), editable copies when used, saved in any format only after approval by an admin or people the admin assigns, class tags (several), pupils practise from the portal. Open design questions are listed in the conversation and must be answered before the note.
4. Portal sign-in secret = guardian phone: replace. Step 1 is merged (PR #93, 2026-10-26, built on `claude/portal-actor-and-access`): [task 0040](tasks/0040-portal-pupil-guardian-separation.md) (maintainer's answers of 2026-10-25: the access table is right, a guardian sees a practice summary, step 1 now and separate credentials later, and the access is an admin setting per branch). **Octalve's `bank.parents.view` (what a parent account sees of the question bank: NONE, SUMMARY or FULL) has its equivalent here already, so none was added (a proposal of 2026-10-26 for the maintainer to confirm or overrule): `portal_access.guardian.practice` is the same three levels, per branch, superadmin-only, audited, with a rise marked `CHANGED_WIDENING`.** The two differences are deliberate: the default (here a guardian gets SUMMARY, the maintainer's table of 2026-10-25; Octalve gives a parent NONE until the school turns it on) and the school-wide ceiling (Octalve's campus may only choose less than its school; here the setting is per branch only, and a superadmin sets each branch). Nothing reads `practice` yet: it is used when pupil practice arrives (task 0032 slice 4).
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

### 6.8a Question bank slice 1 (2026-10-19)
- Built on `claude/forms-qbank-slice-1`: the schema and additive migration `20261019210000_question_bank_foundation`, the 15 `bank.*` settings (a branch may only narrow), reviewers, the append-only audit, and the admin screen `/question-bank` (More menu). What is in it, where it differs from the plan, and the notes for slice 2 are in `docs/tasks/0032-forms-and-question-bank.md` section 4a.
- Four defaults the design note never gave (daily cap 100, minimum pool 20, near-exam days 7, summary threshold floor 3) were confirmed by the maintainer on 2026-10-19.
- **Images go through a storage adapter** (maintainer, 2026-10-19): Cloudinary, Cloudflare R2 and Amazon S3 are the first backends, chosen by environment, one per deployment, failing closed; served only through our own access-checked route; design in the task file section 4a. Octalve uses the same adapter. Octalve parity decisions answered the same day: "general" is school-wide only; settings changes there need the fresh re-authentication; parents' access is still open (note in the Octalve repo, `docs/development-history/forms-and-question-bank-parity.md`).
- A shared-code bug found on the way: `withAuthGated` turned a NUL byte in `?branchId=` into a 500. Fixed in `src/lib/auth/branch-gate.ts`.

### 6.9 Standing rules added by the maintainer (2026-10-19, three messages)
- **Always search for bugs, potential issues, design gaps and user-flow gaps**, in every task, not only the ones named. Findings go in `docs/open-items.md` section 1b with severity and evidence; defects are fixed with a test seen to fail first; product choices are asked.
- **Also test edge cases and fuzz for security anomalies**: seeded, deterministic generators (no new dependency), random and hostile inputs, boundaries, malformed and oversized data, replays, concurrency. See `tests/unit/portal-token-fuzz.spec.ts` for the pattern.
- **Test UI gaps, UX issues and user-flow gaps, "test all"**: for every screen or flow touched and its neighbours: empty, loading, error and success states, wording, keyboard and focus, both themes, phone width, axe, dead ends, an API with no screen. The whole-product browser audit is Task 0033 (runs last); this applies to every slice before it.
- **Octalve and AlEemaan are kept in sync** (CLAUDE.md rule 7; Octalve's design is canonical for shared parts). A fix in one is checked against the other and the result recorded in both HANDOVER files, including "checked, not affected".
- **Do not run two full suites at once** on the same machine: the second one slowed the first enough to fail a 5 s assertion (open-items 1b).

---

## 7. How to work here: authority, habits, running the tests, clean-up (2026-10-21)

This section is the portable copy of what the previous AI session knew from the maintainer's instructions. It does not replace the working rules in [`CLAUDE.md`](../CLAUDE.md) or section 6.6 (how hand-offs are done) and 6.9 (the standing rules of 2026-10-19: always hunt for bugs, fuzz and edge-test, test the UI and the flow, keep the two products in step, do not run two full suites at once); it adds the rules that were given in conversation since and the practical knowledge of running this repository's tests on a shared machine. A session that starts from this repository alone (another AI, another tool, or a person) has everything it needs here and in the files this section names. The same section exists in Octalve Edu's `docs/HANDOVER.md`.

### 7.1 Who may do what

- **The maintainer** is the git user `roji-tech`. Product decisions are theirs. When a decision is genuinely theirs, ask one question and lead with a recommendation; when a conventional default exists, take it and say so in the PR.
- **Merging into `dev`:** the AI may merge a PR into `dev` after its checks pass, as a MERGE COMMIT, and keeps the remote branch. The gate is: the PR is open, `base.ref` is `dev`, the head is the commit that was tested, the Vercel check is `SUCCESS`, and GitHub says `MERGEABLE`. The helper that checks all five and then merges is `bash /home/rojitech/Desktop/CODEC/out/tools/guarded-merge.sh roji-tech/AlEemaan <pr> <tested-head-sha-prefix>`.
- **Never without the maintainer's explicit approval, each time:** merging or promoting into `master` or `prod`; accepting an ADR (an agent may draft one, only a person accepts it, so it stays "Proposed"); running a migration on a hosted database or writing a Vercel secret (the AI is blocked from both anyway: a PR that ships a migration says so and gives the run order).
- **Pushing:** "push it" means push and nothing more. Pushing a branch and opening a PR are part of the normal flow; merging is only under the rule above.
- **Not yours to touch:** the maintainer's own checkout and processes, and the local database containers. Remove only what you made (7.4).
- **A refusal by the permission system is not an obstacle to route around:** reword or stop, and tell the maintainer exactly what was blocked and the command they can run themselves.
- **Task 0033** (the walkthrough video and PDF that double as a flow audit) runs LAST, after all other tasks.

### 7.2 Habits that apply to every task

1. **Hunt for bugs, design gaps and user-flow gaps** in every task, not only the ones named; **fuzz and edge-test anything security-relevant**; **test the UI and the user flow** of every screen touched and its neighbours (6.9 lists what to look at). Report what you found, including what you did not fix.
2. **A test is seen to fail first.** Run every new test on an UNFIXED production build (a worktree of `dev` with only the new specs and helpers) and check that it fails for the intended reason, with the controls passing; record the counts. If a failing-first run is impossible (a new table), say so in the PR.
3. **Comprehensive commit messages and PR bodies (ADR 0013):** What, Why, Decisions, the bugs found on the way, and the tests: what failed first, what ran (names and counts), and what was NOT run. Commits end with the `Co-Authored-By:` trailer of the model that wrote them; PR bodies end with the "Generated with Claude Code" line.
4. **Docs in the same pass:** with every batch update the task file and `docs/tasks/current-tasks.md`, the progress tracker (`docs/development-history/aleemaan_progress.md`), `docs/open-items.md`, section 6 of this file, the `CLAUDE.md` banner, and the code catalogs (`docs/pages`, `docs/components`, `docs/functions`: one row per tracked file under `src/`, in the same commit as the file; `python3 /home/rojitech/Desktop/CODEC/out/tools/verify_catalogs.py <repo>` checks them; a file that is not yet `git add`ed shows as EXTRA). The private tracker `/home/rojitech/Desktop/CODEC/out/tasks.md` gets an entry as well. Docs go on a docs-only branch off `dev`.
5. **Both repositories are PUBLIC; neither product is live (maintainer, 2026-10-21).** In anything pushed (commit, PR, code comment, test name, catalog row, `docs/issues` row) describe the rule the code now enforces, in neutral words, never a way to exploit the old behaviour: no reproduction steps, no secrets. Exploit detail goes in the private tracker only (`/home/rojitech/Desktop/CODEC/out/tasks.md`, and for Octalve `octalve-review-leads-2026-10-20.md`, both outside git). `docs/issues`: write a row the moment a problem is suspected (where, what, status, and an honest `Live?` column); the maintainer chose that on 2026-10-21 (option C).
6. **No fallback secrets in source:** a missing secret fails closed (PR #68). Keep this repository in step with Octalve Edu (its design is canonical for shared parts, AlEemaan is the stricter of the two where they differ); a fix in one is checked against the other and the result recorded in both HANDOVER files, including "checked, not affected".
7. **Do not run two full suites at once** (there are no lanes here: 7.3).
8. **Always clean up when done (7.4).**

### 7.3 Running the tests here

- **The servers under test are a production build** (`next start`): run `pnpm build` after any source change or the specs test the old code. `pnpm build` runs `prisma generate` first and type-checks the tests and any `.ts` file at the repository root, so a throwaway config must NOT be in the tree while it builds. `tsc --noEmit` alone shows only `LayoutProps` (a Next type that exists after a build): that is not an error.
- **No lanes: one run at a time.** The ports are fixed (`tests/support/env.ts`: 3200 the plain-HTTP app, 3201 the same build behind the TLS proxy on 3543, 3202 the dev-tools server, 3203 the breach server, 3204 the breached-password stand-in) and the test database is `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` appended to the database name; the `setup` project creates, migrates and empties it. A second run collides on both.
- **Playwright projects:** `setup`, `unit`, `integration`, `api`, `e2e-desktop`, `e2e-mobile`, `https` (`pnpm test:unit`, `test:api`, `test:e2e`, `test:https`). A whole `setup` + `unit` + `integration` + `api` run is about 45 minutes at load 8 to 20.
- **The shared machine is often loaded:** run with `--timeout=120000`, and raise the web servers' START-UP wait from 60 s to 240 s with a throwaway config that changes nothing else: `/home/rojitech/Desktop/CODEC/out/tools/pw-wrapper.config.ts`, copied into the worktree as `pw-wrapper.config.ts` for the run and deleted afterwards (`/home/rojitech/Desktop/CODEC/out/tools/run-lane.example.sh` shows the shape; drop its `TEST_LANE`). Example: `nice -n 5 pnpm exec playwright test --config=pw-wrapper.config.ts --timeout=120000 --reporter=list --project=setup --project=api tests/api/<spec>`. A test that fails only under load must be shown to pass alone before it is called load-sensitive, and then repaired (task 0034 and Octalve's task 0019 are the pattern), not retried.
- **Long jobs:** start them in the background (`run_in_background`) with a log, wait for the log's own `== run done` marker with an `until grep ...; do sleep 5; done` loop, and trust that marker, not the launcher's "completed". A log that contains a NUL character is binary to `grep`: use `grep -a` or `tr -d '\000'`.
- **Local database:** `docker-compose.yml` (connection details: section 3). Scratch databases you create for a run are dropped at the end (7.4).

### 7.4 Clean-up checklist (after every batch)

1. Remove the worktrees you made once their branch is merged or dropped (`git worktree remove`; a refusal by the permission system means: give the maintainer the exact command). KEEP a worktree that holds unmerged work (6.0 names the two that exist).
2. Delete the merged LOCAL branches you made. Never delete a remote branch.
3. Stop your own processes (never `pkill -f` or `pgrep -f` with a pattern that appears in the same command line: it matches itself). Do not touch the maintainer's processes.
4. Drop your scratch databases; delete throwaway configs (`pw-wrapper.config.ts`, `.env` copies), `test-results`, `playwright-report` and `.next` in your worktrees.
5. At the very end of a long session clear the big scratchpad files.

### 7.5 Tool habits that cost time when forgotten

- A Write, Edit or Bash call can turn a backslash-u escape sequence in the text you send into the real character. Write such sequences with a doubled backslash, look at the result with `git diff`, and keep `tests/unit/source-hygiene.spec.ts` green.
- The Edit tool needs the file to have been Read in the same session; `sed` does not count.
- Run `pnpm exec prettier --check` on every file you changed before committing.
- A new local branch made from `origin/dev` tracks `origin/dev`: `git branch --unset-upstream`, then `git push -u origin <branch>`.
- `git log --format=%h`, not `--format=x`. Use the scratchpad directory for your own files, not `/tmp`.

### 7.6 Where the things that are not in git live

- `/home/rojitech/Desktop/CODEC/out/tasks.md`: the maintainer's single task tracker for both repositories (an entry per session, with the private findings).
- `/home/rojitech/Desktop/CODEC/out/octalve-review-leads-2026-10-20.md`: unverified review leads from the Octalve catalog run (PRIVATE); AlEemaan is the twin of Octalve, so a lead there is worth checking here.
- `/home/rojitech/Desktop/CODEC/out/tools/`: the helper scripts named above, with a README.
- The previous AI session's own memory notes live in the maintainer's Claude Code profile and load only into a Claude Code session started in this project. Everything in them that matters is in this section and in section 6.
