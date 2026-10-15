# Open items (AlEemaan) - the one place to look

Updated 2026-10-15, after Slice P2d merged to `dev`. Octalve Edu's own list is in its `docs/tasks/0011-audited-support-access.md` §5-6 and `docs/tasks/0010-platform-followups.md`. When an item is done, tick it here and link the task or PR; when a new one appears, add it here first.

## 1. Waiting on the maintainer
- [ ] **Run `pnpm admins:list` against the LIVE AlEemaan database and say who stays a superadmin.** Blocks the live deploy of the branch-admins migration (ADR 0014, accepted with that condition).
- [ ] **The CA/exam split per branch** (legacy code: secondary 30/70, primary 40/60). Nothing is seeded; an administrator creates each branch's assessment scheme before teachers can enter marks. Say whether the two Arabic branches follow the English ones.
- [ ] **Report-card layout:** content only (built), the exact legacy look (needs a legacy card as a PDF or photo), or specific additions (logo, signature line, next-term date).
- [ ] **May an administrator approve their own entries?** Built: only a superadmin may. Alternatives: any administrator; never.
- [ ] **What may the public verification page show?** Built: school, branch, class, term, subject, publish date, the pupil as first name + last initial. Alternatives: no pupil name; full name.
- [ ] **Teachers and attendance:** may a teacher take attendance only for arms they are assigned to? Built: unchanged (any teacher of the branch). The accurate version needs a "form teacher of this arm" assignment (a small slice).
- [ ] **Go-ahead for finance F1** (fee structures and invoices); the design and your four answers are merged (plan "Build design - Slice P4: finance").
- [ ] Approval of any `dev` -> `master` PR (none is open) and any `prod` step.

## 2. Built on `dev`, not yet live: run the migrations BEFORE the code
None of these has been run on the live database by me (I never touch it); apply in this order with `pnpm exec prisma migrate deploy`, then deploy the code. All are additive.
1. `20261011120000_super_admin_flag` - **needs the `admins:list` answer first** (it backfills every current administrator as a superadmin).
2. `20261014090000_academic_structure` (classes, arms, subjects; backfills arms from the `className`/`arm` strings)
3. `20261014100000_assessment_grading`
4. `20261014110000_staff_assignments`
5. `20261014120000_results`
6. `20261014130000_results_workflow`
7. `20261014140000_report_remarks`

## 3. Not built
- [ ] Student and parent access to report cards (there is no parent-to-child link yet - a decision of its own).
- [ ] Promotion between classes (legacy: promote at average >= 50%, Third Term only; needs P2's averages).
- [ ] Import of the legacy English-branch results and students (Phase 7). The Arabic branches start fresh.
- [ ] PDF download of the report card (printing from the browser is built).
- [ ] A history dialog in the Review tab (the history API exists).
- [ ] **P3** timetable and announcements; **P4** finance F1-F4 (F4 online payment with Paystack is optional per branch).
- [ ] The payment gate for report cards: `reportCardVisibleTo` is a stub that always allows staff; the superadmin setting arrives with finance F3.
- [ ] The Review/Enter screens keep the branch choice per section; switching a tab resets it to the first branch.

## 4. Test debt (be honest about it)
- [ ] **Mutation passes: NOT RUN** for any slice - deferred by the maintainer to the end of Phase 2. Targets are listed in the plan under each slice (transition table, no-self-approval, the all-or-nothing count, the ranking, the published-only filter, the public field list, the immutability and session-close triggers, the lock triggers of P1b).
- [ ] Specs **not seen failing first** (written with or after the code): P1b integration and API, P1c integration and API, P1d e2e, P2a integration, P2b API, P2c unit/API, P2d e2e.
- [ ] The **18 skipped tests** in the full suite have never been individually re-examined.
- [ ] **Watch list (load-sensitive, not fixed, cause not proven):** `account-self-service.spec.ts:349` (median response time of a taken vs a free address must differ < 40 ms; failed in the P2b full run, passed 3/3 alone) and `account-self-service.spec.ts:22` / the sign-in helper's 5-second `/dashboard` check (failed once in the P2d full run, passed 3/3 alone). If either fails again on a quiet machine, treat it as a real bug (the first would be an enumeration oracle).

## 5. Decisions already made (so they are not re-asked)
Arabic branches start fresh (Phase 7 = the two English Firestore projects). The Octalve teacher-arm attendance rule stays in Octalve. Finance (2026-10-14): Paystack and its education rate optional per branch; cash / POS / transfer / online selectable per branch for every branch; blocking report-card downloads for unpaid fees is a superadmin setting (off by default); no BVN/NIN collection and no per-student virtual accounts. ADRs 0014, 0015, 0016 and 0017 are accepted.
