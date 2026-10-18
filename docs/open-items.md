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

- [ ] **Run `pnpm admins:list` against the LIVE AlEemaan database and say who stays a superadmin.** Blocks the live deploy of the branch-admins migration (ADR 0014, accepted with that condition).
- [x] **The CA/exam split per branch** — answered 2026-10-15: nothing is hard-coded; an administrator creates the branch's scheme (see P2e). The Arabic branches follow the same rule (start fresh). *(Was item in §1.)*
- [x] **Report-card layout** — answered 2026-10-15: fixed coded layouts, `legacy = true` for legacy ones; legacy sample still needed (PDF or photo from the maintainer). *(Was item in §1.)*
- [x] **May an administrator approve their own entries?** — answered 2026-10-15: only a superadmin may self-approve (unchanged built default); the superadmin toggles it per admin and may assign an unseen reviewer. *(Was item in §1.)*
- [x] **What may the public verification page show?** — answered 2026-10-15: bare minimum (school, branch, class, term, publish date, "valid") always; everything else is superadmin-configured per branch. *(Was item in §1.)*
- [x] **Teachers and attendance** — answered 2026-10-15: class/form teacher of the arm + explicit grants; backfill on deploy. *(Was item in §1.)*
- [x] **Go-ahead for finance F1** (fee structures and invoices); built in Slice P4 (`claude/p4-finance-billing`).
- [x] **Approval of `dev` -> `master` PR** — [PR #53](https://github.com/roji-tech/AlEemaan/pull/53) approved and merged into `master` on 2026-10-17.
- [ ] **Approval of `master` -> `prod` PR** — [PR #54](https://github.com/roji-tech/AlEemaan/pull/54) open and awaiting maintainer approval for live release v0.6.0.

## 2. Built on `dev` & `master`, not yet live: run the migrations BEFORE the code

None of these has been run on the live database by me (I never touch it); apply in this order with `pnpm exec prisma migrate deploy`, then deploy the code. All are additive.
1. `20261011120000_super_admin_flag` - **needs the `admins:list` answer first** (it backfills every current administrator as a superadmin).
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
- [ ] Import of the legacy English-branch results and students (Phase 7). The Arabic branches start fresh.
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


## 4. Test debt (be honest about it)

- [ ] **Mutation passes: NOT RUN** for any slice - deferred by the maintainer to the end of Phase 2. Targets are listed in the plan under each slice (transition table, no-self-approval, the all-or-nothing count, the ranking, the published-only filter, the public field list, the immutability and session-close triggers, the lock triggers of P1b).
- [ ] Specs **not seen failing first** (written with or after the code): P1b integration and API, P1c integration and API, P1d e2e, P2a integration, P2b API, P2c unit/API, P2d e2e.
- [ ] The **18 skipped tests** in the full suite have never been individually re-examined.
- [ ] **Watch list (load-sensitive, not fixed, cause not proven):** `account-self-service.spec.ts:349` (median response time of a taken vs a free address must differ < 40 ms; failed in the P2b full run, passed 3/3 alone) and `account-self-service.spec.ts:22` / the sign-in helper's 5-second `/dashboard` check (failed once in the P2d full run, passed 3/3 alone). If either fails again on a quiet machine, treat it as a real bug (the first would be an enumeration oracle).

## 5. Decisions already made (so they are not re-asked)

Arabic branches start fresh (Phase 7 = the two English Firestore projects). The Octalve teacher-arm attendance rule stays in Octalve. Finance (2026-10-14): Paystack and its education rate optional per branch; cash / POS / transfer / online selectable per branch for every branch; blocking report-card downloads for unpaid fees is a superadmin setting (off by default); no BVN/NIN collection and no per-student virtual accounts. ADRs 0014, 0015, 0016 and 0017 are accepted. CA/exam decisions confirmed 2026-10-15: parts not optional, default names "CA" / "Project" / "Exam", must total 100, private templates shareable to branch, fixed coded layouts with `legacy = true`, superadmin-only self-approval toggle per admin with optional unseen reviewer, attendance grant backfill on deploy.
