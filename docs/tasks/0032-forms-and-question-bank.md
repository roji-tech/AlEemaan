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

## 4. Definition of done (every slice)
tsc, lint, build, then tests (in that order); tests for secrecy, permissions and cross-branch per the design note; axe in both themes at desktop and phone; docs (this file, HANDOVER, open-items) updated in the same change.
