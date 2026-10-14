# [0016]: P2c - report card, remarks and public verification

- **Period / Focus:** 2026-10-14 (design: plan "Build design - Slice P2", merged as PR #37)
- **Status:** [~] In Progress - built; full suite **(running)**
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p2c-report-card` -> `dev`
- **Started:** 2026-10-14 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
A student's report card for a term (computed from published results), the teacher's and principal's remarks, and a public page that proves one published result is genuine without saying anything about its marks.

## 2. Work Breakdown
- [x] Migration `20261014140000_report_remarks` (additive; run before the code; applied to the test DB): `ReportRemark` - one row per student and term, in the student's branch (composite keys), lengths checked. "Editable until a result of that term is published" is a **service** rule (stated), not a database one.
- [x] `lib/academics/report-card-rules.ts` (pure, in integer hundredths of a percent): `percentHundredths`, `averageHundredths` (mean of the subject percentages, so a subject out of 50 weighs the same as one out of 100), `rankAverages` (standard competition ranking 1, 2, 2, 4 - the legacy "strictly higher + 1" gives the same numbers), `publicName` ("Amina Y."). Unit spec `tests/unit/report-card-rules.spec.ts` (7).
- [x] `lib/academics/report-card.ts`: `getReportCard` (published results only; an administrator's `preview=true` adds the unpublished; position among the arm's students counted over the same kind of results as the card; school header, student block, class, term, subjects with parts / exam / total / percent / grade / remark, summary, remarks, the grading legend, `allPublished`), `saveRemarks` (409 once a result of the term is published; audited), `verifyToken`, and `reportCardVisibleTo` - the one place the payment gate will plug in (finance F3); today staff always may.
- [x] Routes: `GET students/[id]/report-card` (any staff role in the student's branch; preview = administrators), `PUT students/[id]/report-remarks` (administrators), public `GET /api/v1/verify/[token]` (rate limited per client address; added to the route-role guard's public list with its reason) and the public page `/verify/[token]` (`noindex`, `no-referrer`).
- [x] **What the public sees (decision 7, clarified):** school, branch, class, term, **subject**, publish date and the pupil as first name + last initial - and that the result is genuine. No scores, grade, admission number, student id or last name. The subject was not in the design's list; it is added because a token verifies one subject's result and a printed card carries one token per subject. A test pins the answer to an exact allow-list of fields. A token that does not exist, is malformed, was never issued or was withdrawn (an unlock clears it) gets one and the same 404; a stored hash that no longer matches the content is reported as "does not match", never as genuine.
- [x] Tests: `tests/api/report-card.spec.ts` (6), `tests/integration/results.spec.ts` (+1 remarks, now 11), unit 7. NOT seen failing first (written with the code). Two test mistakes of mine were found and corrected (a miscounted number of audit rows - 3 saves succeeded, not 4 - and a fragile "answer must not contain 40" substring check that failed when a random class label contained those digits; replaced by an exact allow-list, which is stronger).
- [ ] Not done: the screens (report card view with a print stylesheet, remarks form, review queue UI - P2d), student/parent access, PDF download (print first), the payment gate (finance F3).

## 3. Verification
Targeted after `pnpm build`: API report-card 6 + integration results 11 + route guard + unit rules 7 passed; typecheck, lint, Prettier clean. Full suite: **(running)**. Mutation passes NOT RUN - pending, end of Phase 2 (targets: the ranking, the average, the published-only filter, the remarks freeze, the public allow-list).
