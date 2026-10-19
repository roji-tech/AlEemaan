# Open items (AlEemaan) - the one place to look

Updated 2026-10-15 (second pass), after the maintainer answered all seven follow-up questions about P2e. Octalve Edu's own list is in its `docs/tasks/0011-audited-support-access.md` §5-6 and `docs/tasks/0010-platform-followups.md`. When an item is done, tick it here and link the task or PR; when a new one appears, add it here first.

## 0. Decided 2026-10-15 (maintainer) - to be designed and built; supersedes the matching items in section 1

Full detail: `docs/development-history/domain-implementation-plan.md` "Build design — Slice P2e". One shared settings-and-approvals layer (superadmin default, admin override, optional enforcement with approval-and-a-reason) carries all of the items below.

### 0a. Answers confirmed by the maintainer (2026-10-15) — all seven questions now answered

1. **Unapproved-scheme marks.** Marks may be entered and reviewed under an unapproved scheme but **cannot be published until the scheme is approved**. On rejection the marks stay as drafts; the teacher re-enters them under an approved scheme. ✔ Confirmed.
2. **Parts total.** CA parts + exam **must sum to exactly 100**. ✔ Confirmed.
3. **Template sharing.** Templates are **private to the creator by default**, with an option to share to the branch. ✔ Confirmed.
4. **Layouts.** **Fixed set of coded layouts** (with options: logo, signature line, next-term date), not a free-form layout editor. Legacy layouts are marked `legacy = true`. The legacy sample (PDF or photo) is still needed from the maintainer. ✔ Confirmed.
5. **Verification page minimum.** Always shown: school, branch, class, term, publish date, "valid". Everything else is selectable by the superadmin. ✔ Confirmed.
6. **Self-approval toggle.** **Only the superadmin can toggle self-approval, per admin.** The superadmin is the default approver for all admins. The superadmin may assign another person to review and approve (that reviewer is invisible to the admin being approved). This is a superadmin-only action; the 15.1 enforce/approve rule does not apply (there is no admin-level toggle here). ✔ Confirmed.
7. **Attendance grant backfill on deploy.** Each teacher's currently assigned arms are automatically backfilled as starting grants on deploy, so no one loses access on the day the rule ships. ✔ Confirmed.

### 0b. Items to design and build (in order)

- [x] **CA/exam scheme (slice P2e):** any number of CA parts (1, 2, 3 …) plus an exam; parts are **not optional** (at least one CA + the exam); CA parts may be named — **default names "CA", "Project", "Exam"**; parts must total exactly 100; scopes teacher-subject > class-group > branch > global; a teacher's subject scheme is usable while pending, stays a draft if rejected; marks under a pending scheme cannot be published until it is approved; superadmin may enforce on all branches (admin changes then need superadmin approval + reason); drafts and templates private by default, shareable to branch. Nothing is hard-coded to 30/70 or 40/60.
- [x] **Report-card layouts (P2e):** several fixed-coded layouts with options (logo, signature line, next-term date), chosen per branch by admin or superadmin; legacy layouts are coded and tagged `legacy = true`; the legacy sample is still needed from the maintainer (PDF or photo).
- [x] **Self-approval (P2e):** superadmin toggles it **per admin** (not a global setting); the superadmin is the default approver; the superadmin may assign an unseen reviewer in their place. Built default stays: only a superadmin may self-approve.
- [x] **Verification page (P2e):** bare minimum always shown (school, branch, class, term, publish date, "valid"); the superadmin selects additional fields (pupil name form, subject, marks, grade) per branch or for all branches; an admin's change to their branch requires superadmin approval. The existing test pinning an exact field list must become "minimum + configured fields", never looser than configured.
- [x] **Attendance permissions (own slice after P2e):** who may take attendance for an arm: (1) the class/form teacher of that arm (teaching or non-teaching staff), (2) anyone granted explicit permission by an admin or superadmin for named arms or groups of arms, (3) admins/superadmins always may; everyone else is refused. Deploy: backfill each teacher's currently assigned arms as starting grants so no one loses access on ship day.

## 1. Waiting on the maintainer

- [x] **Question bank, two gaps in the design (found 2026-10-19; answered the same day):** (1) tags across branches: match by normalised name text (`normalizeLabel`, no column added to ClassGroup or Subject; the typed label and a key are stored); (2) "section": an optional `ClassGroup.section` set by the admin (branch name when empty), added with slice 5. Design note section 16a.

- [ ] **Run `pnpm admins:list` against the LIVE AlEemaan database and say who stays a superadmin.** Blocks the live deploy of the branch-admins migration (ADR 0014, accepted with that condition).
- [x] **The CA/exam split per branch** — answered 2026-10-15: nothing is hard-coded; an administrator creates the branch's scheme (see P2e). The Arabic branches follow the same rule (start fresh). *(Was item in §1.)*
- [x] **Report-card layout** — answered 2026-10-15: fixed coded layouts, `legacy = true` for legacy ones; legacy sample still needed (PDF or photo from the maintainer). *(Was item in §1.)*
- [x] **May an administrator approve their own entries?** — answered 2026-10-15: only a superadmin may self-approve (unchanged built default); the superadmin toggles it per admin and may assign an unseen reviewer. *(Was item in §1.)*
- [x] **What may the public verification page show?** — answered 2026-10-15: bare minimum (school, branch, class, term, publish date, "valid") always; everything else is superadmin-configured per branch. *(Was item in §1.)*
- [x] **Teachers and attendance** — answered 2026-10-15: class/form teacher of the arm + explicit grants; backfill on deploy. *(Was item in §1.)*
- [x] **Go-ahead for finance F1** (fee structures and invoices); built in Slice P4 (`claude/p4-finance-billing`).
- [x] **Approval of `dev` -> `master` PR** — [PR #53](https://github.com/roji-tech/AlEemaan/pull/53) approved and merged into `master` on 2026-10-17.
- [x] **Approval of `master` -> `prod` PR** — [PR #54](https://github.com/roji-tech/AlEemaan/pull/54) and [PR #60](https://github.com/roji-tech/AlEemaan/pull/60) merged into `prod` (Release v0.7.0).

## 1b. Found by the bug hunt, 2026-10-19 (standing rule: always search for bugs, gaps, and fuzz/edge-test for security; see HANDOVER 6.9)

Severity is the author's judgement; evidence is what was read or run. "Branch" = where the fix is.

**Portal sign-in (`POST /api/v1/portal/session`, `lib/portal/*`)**
- [ ] **HIGH: no rate limit and a guessable "secret".** The route does CSRF and nothing else. The secret may be the pupil's date of birth (about 5,500 candidates), **the last 4 or more digits of the guardian phone** (`matchesPhone`, 10,000 candidates, not the whole number), or the guardian's email; admission numbers come from a sequential counter. Anyone who can reach the site can try every pupil. Fix proposed: a limiter on sign-in (per client and per admission number, using `lib/auth/rate-limit.ts`) and a minimum suffix length; what the secret SHOULD be (a real secret or a magic link by default) is the maintainer's open decision above.
- [ ] **HIGH: admission numbers can be enumerated** ("No active student found with this admission number" versus "Verification failed..."). Fix: one message and similar timing.
- [ ] **MEDIUM-HIGH: siblings are inferred from an EQUAL guardian phone or email** (`findSiblingStudentIds`), so a shared or placeholder number gives one login access to unrelated children's results and invoices; the list is also put in a cookie (a browser drops one over 4 KB, so a big group silently cannot sign in). Needs a design decision (explicit guardian links).
- [ ] **MEDIUM: portal sessions are stateless 7-day cookies with no revocation**: signing out only clears the browser's copy, and a changed phone number revokes nothing. The cookie also carries the guardian's phone and email in a readable (signed, not encrypted) payload.
- [x] fixed in branch `claude/fail-closed-secrets`: the signing secret had a hard-coded fallback (see section 3b); a signed token of the wrong shape (for example `expiresAt: "abc"`, which never expired) was accepted.

**Payments (`lib/finance`, `POST /api/v1/webhooks/paystack`)**
- [ ] **HIGH: the public webhook verified its signature with `PAYSTACK_SECRET_KEY || "mock_secret"`**; with the key unset (the local `.env` has it empty) anyone who knows a payment reference could sign a `charge.success` and mark an invoice paid. Octalve already fixes this (`resolvePaystackMode`): AlEemaan had drifted. Fix in branch `claude/fail-closed-secrets`.
- [ ] **MEDIUM: the webhook wrote its audit ledger BEFORE checking the signature**, keyed by an event id the sender chooses: unsigned requests fill the table and can overwrite a genuine event's row to `signatureValid=false`. Octalve: an unsigned delivery writes nothing. Same branch.
- [ ] LOW: starting an online payment calls the gateway inside an open database transaction (a network call while the transaction is held).
- [ ] LOW: `verifiedServerSide = true` is set from the webhook signature alone; the gateway's `verifyTransaction` is never called, so the field name overstates what was verified.
- [ ] **GAP (needs the maintainer): online fee payment has no screen in AlEemaan.** The API (`POST /finance/invoices/[id]/pay` and the webhook) exists; the portal tells parents to pay by bank transfer or cash; the mock gateway's checkout URL is the hard-coded `http://localhost:3000/checkout/mock/<ref>` and no such page exists. Octalve has `PaystackMockModal` and the flow. Decide whether online payment is wanted in AlEemaan; Task 0033 assumed a mock checkout exists.

**Process and tests**
- [x] fixed in branch `claude/fail-closed-secrets`: when a startup hook throws, Next 16 keeps the process running and answers every request 500 (verified); the secret check now logs and exits with code 1.
- [x] fixed: `tests/e2e/approvals-screen.spec.ts` asserted the page description instead of the request (a vacuous pass on desktop, a strict-mode failure on the phone).
- [ ] `tests/https/host-cookie.spec.ts` is load-sensitive: its login redirect can exceed the 5 s URL assertion (about 12 s alone); it failed once while two suites shared the machine. Do not run two suites at once.

## 2. Remote Database Migrations (Deployed to db.prisma.io)

All 25 migrations have been successfully executed and applied to the remote database on `db.prisma.io` via `pnpm exec prisma migrate deploy`. Schema is 100% up to date.

2. `20261014090000_academic_structure` (classes, arms, subjects; backfills arms from the `className`/`arm` strings)
3. `20261014100000_assessment_grading`
4. `20261014110000_staff_assignments`
5. `20261014120000_results`
6. `20261014130000_results_workflow`
7. `20261014140000_report_remarks`
8. `20261015100000_p2e_settings_and_approvals`
9. `20261015110000_attendance_permissions`
10. `20261016100000_p3_timetable_and_announcements`
11. `20261016120000_p4_finance_and_billing` (Fee structures, invoices, payments, discounts, webhooks)
12. `20261017100000_p5_lms_and_assignments` (Assignments, submissions, learning materials, quizzes, questions, attempts)
13. `20261017120000_p6_communication_messaging` (Notification templates, dispatches, guardian link tokens, audit logs)
14. `20261017140000_p7_student_promotion` (Promotion batches, promotion records, enrollment status transitions)

## 3. Not built

- [x] Student and parent access to report cards, attendance, fees, and LMS coursework — built in Slice P8 ([PR #52](https://github.com/roji-tech/AlEemaan/pull/52)).
- [x] Promotion between classes (legacy: promote at average >= 50%, Third Term only; needs P2's averages) — built in Slice P7 ([PR #51](https://github.com/roji-tech/AlEemaan/pull/51)).
- [x] Import of the legacy English-branch results and students (Phase 7). The Arabic branches start fresh. Built in Task 0029 (`src/lib/migration/legacy-mapper.ts` and `scripts/migrate-legacy-firestore.mjs`).
- [x] PDF / standalone document download of the report card (built in Task 0028 with A4 styling & print optimizations).
- [x] A history dialog in the Review tab (the history API exists) — built in Task 0027.
- [x] **P2e** settings + approvals layer, scheme levels, layouts, verification fields, self-approval toggle (PR #44).
- [x] **Attendance-permissions slice** (PR #45).
- [x] **P3** timetable and announcements (Task 0021: Completed, PR #47 to dev).
- [x] **P4** finance F1-F4 (fee structures, batch invoicing, manual recorded payments, receipting, dual-mode Paystack checkout, webhooks) (PR #48).
- [x] **P5** learning management system (LMS) & assignments (Task 0023: Completed, PR #49 to dev).
- [x] **P6** multi-channel messaging & communication engine (Task 0024: Completed, [PR #50](https://github.com/roji-tech/AlEemaan/pull/50)).
- [x] **Slice P8** parent & student self-service portal (Task 0026: Completed, [PR #52](https://github.com/roji-tech/AlEemaan/pull/52)).
- [x] The payment gate for report cards: `reportCardVisibleTo` supports `block_unpaid_report_cards` superadmin setting, enforces zero unpaid invoices for portal viewers while preserving unblocked staff access (built in Task 0028).
- [x] The Review/Enter screens keep the branch choice per section; switching a tab resets it to the first branch — fixed in Task 0027 with synchronized `selectedBranchId`.


- [x] **Slice UI1** (Task 0031): Students screen, Approvals page, scheme levels, timetable batch, portal hand-in and quizzes, and the security fixes found by the browser run. Committed on `claude/ui-gaps-students-settings`; PR to `dev` pending. Migration `20261019090000_hosted_schemes` must run before the code.

## 3b. Not built yet (decided, waiting for a go)

- [ ] **Forms module**: quizzes stay as they are; new practice sets, questionnaires (member audiences, then public and anonymous, chosen per form), physical hand-in roll-call, manual marking.
- [ ] **Question bank**: shared questions with class tags, admin approval, reuse in quizzes and forms, practice from the portal. Maintainer's decisions recorded in docs/HANDOVER.md section 6.1-6.5 (reviewers: general + per subject; scope general or branch; copy-on-use with offer-back; practice history). Design note written: docs/development-history/forms-and-question-bank-design.md (Task 0032).
- [ ] Operations modules (admissions first). See Task 0030.
- [ ] Portal sign-in secret is the guardian's phone number (weak).
- [ ] **Portal cookie signing secret has a hard-coded fallback** (`src/lib/portal/auth.ts`, `getPortalSecret()`: `SESSION_SECRET || AUTH_SECRET || "<string in the source>"`; `AUTH_SECRET` was removed in 0.5.1.5 and `.env.example` documents neither). Found 2026-10-19. The maintainer runs the app locally only, and said to set it locally: done 2026-10-19 (`SESSION_SECRET`, 64 characters, in the git-ignored `.env`; it takes precedence over the older 28-character `AUTH_SECRET` that was already there; `.env.example` now documents it). **Still open:** the fallback string is still in the code; any other environment that sets neither variable can have a portal session forged. Proposed fix, not made (changes behaviour and needs `tests/support/env.ts` to supply a test secret): refuse to start without a secret of at least 32 characters, plus a test. **Maintainer said "go for it" (2026-10-19): done in branch `claude/fail-closed-secrets` (the server exits without a 32+ character `SESSION_SECRET`; tests incl. fuzz).**
- [ ] **Walkthrough videos and PDFs that double as a flow audit** (Task 0033): for each project, one continuous browser-only journey from a freshly set-up empty database, in desktop light, desktop dark and phone; findings fixed. Decided 2026-10-19 to run LAST, after all other tasks. Spec: docs/tasks/0033-walkthrough-flow-audit.md.

## 4. Test debt (be honest about it)

- [x] **Mutation passes (0.5.G & Phase 2 baseline):** Executed full suite (45 mutations across Pagination P1–P19, Validation V1–V8, CSRF C1–C9, Password Policy W1–W9) -> **45/45 CAUGHT, 0 SURVIVED, 0 ERRORS** (recorded in `out/mutations.jsonl`).
- [ ] Specs **not seen failing first** (written with or after the code): P1b integration and API, P1c integration and API, P1d e2e, P2a integration, P2b API, P2c unit/API, P2d e2e.
- [x] The **18 skipped tests** in the full suite re-examined: all are intentional viewport-conditional skips (`test.skip(isMobile)` or `test.skip(!isMobile)`) separating desktop vs mobile phone layouts (sidebar vs tab bar, desktop keyboard navigation vs phone sheet, brand panel vs compact header).
- [x] **Watch list (investigated and resolved):** Both items resolved: (1) `account-self-service.spec.ts:349` was exceeding Playwright's default 30s timeout under load because 18 users and 36 bcrypt hashing passes take ~58s; marked with `test.slow()` giving 90s, passed cleanly (< 40 ms non-leak verified with no timing oracle); (2) `helpers.ts:30` increased `signInThroughUi` URL expectation timeout to 15s to withstand heavy multi-suite test load.

## 5. Decisions already made (so they are not re-asked)

Arabic branches start fresh (Phase 7 = the two English Firestore projects). The Octalve teacher-arm attendance rule stays in Octalve. Finance (2026-10-14): Paystack and its education rate optional per branch; cash / POS / transfer / online selectable per branch for every branch; blocking report-card downloads for unpaid fees is a superadmin setting (off by default); no BVN/NIN collection and no per-student virtual accounts. ADRs 0014, 0015, 0016 and 0017 are accepted. CA/exam decisions confirmed 2026-10-15: parts not optional, default names "CA" / "Project" / "Exam", must total 100, private templates shareable to branch, fixed coded layouts with `legacy = true`, superadmin-only self-approval toggle per admin with optional unseen reviewer, attendance grant backfill on deploy.
