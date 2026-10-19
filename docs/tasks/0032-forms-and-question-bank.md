# 0032: Forms module and Question Bank

- **Period / Focus:** designed 2026-10-19; build not started
- **Status:** Pending (design agreed, no code)
- **Priority:** High
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** to be created off `dev` after the UI1 PR is merged

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
Teachers reuse reviewed questions from a bank; pupils practise from the portal; questionnaires, practice sets and paper work are supported; exam questions stay secret without giving anything away.

## 2. Context & Related Docs
- Design: `docs/development-history/forms-and-question-bank-design.md` (read first; sections 2 and 7 are the rules that must not be broken).
- Decisions in the maintainer's words: `docs/HANDOVER.md` sections 6.1 to 6.5b.
- Builds on Slice UI1 (Task 0031): portal hand-in and quizzes, `withAuthGated`, theme tokens.

## 3. Work Breakdown
- [ ] 1 Foundation: models, migration, settings keys, reviewers, audit, route-guard entries
- [ ] 2 Bank core: submit, review queue, approve/reject/retire, class tags, images, scopes, visibility, overlap flags
- [ ] 3 Use in assessments: copy on use, offer-back, template hiding
- [ ] 4 Pupil practice: sessions, feedback timing, size and caps, history, archive
- [ ] 5 Reports on questions: queue, outcomes, switches, re-grade offer
- [ ] 6 Practice sets (ungraded forms)
- [ ] 7 Questionnaires: members, public, anonymous, summaries
- [ ] 8 Paper work: roll call, close, maximum duration, pupil request
- [ ] 9 Manual marking
- [ ] 10 Printing: server PDFs, windows, watermark, logs
- [ ] Mutation passes (deferred to the end of Phase 2)

## 4. Slice 1 plan (drafted 2026-10-19; build only after the UI1 PR is merged; the two decisions in the design note section 16a were answered by the maintainer the same day)

Scope of "foundation" (design note 13.1), refined by what the code already has:
- **Schema** (new `prisma/schema/question-bank.prisma`, one additive migration, deployed before the code): only the tables slices 1 and 2 need: `QuestionBankItem`, `QuestionBankImage`, `QuestionBankClassTag`, `QuestionBankReview`, `QuestionBankReviewer`, `QuestionOverlapFlag`, `QuestionBankAudit`. Forms, practice and report tables arrive in their own slices (4 to 8) so each migration stays reviewable. The enum for question types must not be called `QuestionType` (the quiz already owns that name): use `BankQuestionType`. Class and subject tags are TEXT (a label as typed plus a `labelKey`), not foreign keys (16a, decided: match by normalised name). **No existing table is changed in slice 1**; the optional `ClassGroup.section` (decided) arrives with slice 5, its only consumer.
- **Database rules (triggers):** image count per item (hard maximum 4; the superadmin setting, 3 or 4, is enforced in the service); `QuestionBankReview` and `QuestionBankAudit` are append-only (the `ResultAudit` pattern, migration `20261014120000_results`).
- **`normalizeLabel()`** (pure, in `src/lib/question-bank/labels.ts`): NFKC, lower-case, Arabic-Indic and Persian digits to ASCII, strip spaces, hyphens, dots, underscores and punctuation; used for items, tags, reviewers and matching a branch's class names. Unit tests first ("JSS 1", "JSS-1", "jss1", "J.S.S. 1" all give `jss1`; Arabic digits; it does NOT map "Junior Secondary 1" to "JSS 1").
- **Settings:** the `bank.*` keys of design section 6 stored in the existing `SettingValue` (scope GLOBAL or BRANCH), read through one resolver, `resolveBankSetting(key, branchId)`, which applies "a branch may only narrow": a school-wide off cannot be widened by a branch, a number can only go down. Validation with zod (bounds, `defaultQuestions <= maxQuestions`, presets sorted and at most the maximum, `images.max` 3 or 4). Every change is written to `QuestionBankAudit` (the existing `SettingAudit` has no append-only trigger, so it is not used for these).
- **Reviewers:** `GET/POST/DELETE /api/v1/question-bank/reviewers`: a branch administrator manages their own branch's reviewers, a superadmin any (and the general ones); the person must hold an ACTIVE staff membership (not STUDENT or PARENT) in the branch; kinds general, per subject, and the exam-approver flag; each change audited. Uses `withBranch` or `withAuthGated`, never `withAuth({ roles })` alone.
- **Screens** (an API without a screen was UI1's lesson): "Reviewers" and the superadmin "Question bank" settings, theme tokens only, both themes, desktop and phone, axe clean, added to `responsive-and-a11y.spec.ts`. Nav entries in `components/shell/nav.ts`.
- **Guard:** every new route in `tests/unit/route-role-guard.spec.ts` with its reason.
- **Tests first:** unit (resolver narrowing, validation bounds), integration (the two triggers refuse an update and a fourth or fifth image; the migration is additive), API (permission matrix per role including a branch administrator of ANOTHER branch, the cross-branch probe on every route, every change leaves an audit row), e2e (both screens).
- **Order of checks:** tsc, lint, build, then the tests; docs (this file, HANDOVER, open-items, current-tasks) in the same change.
- **Not in slice 1:** submitting, approving or listing questions (slice 2), any pupil-facing route, any Forms table.

## 5. Definition of done (every slice)
tsc, lint, build, then tests (in that order); tests for secrecy, permissions and cross-branch per the design note; axe in both themes at desktop and phone; docs (this file, HANDOVER, open-items) updated in the same change.
