# [0014]: P2a - results: tables, entry and history

- **Period / Focus:** 2026-10-14 (design: plan "Build design - Slice P2", merged as PR #37)
- **Status:** [~] In Progress - built; full suite **(running)**
- **Priority:** High
- **Assignee:** Claude Agent / Maintainer
- **Target Branch / PR:** `claude/p2a-results-entry` -> `dev`
- **Started:** 2026-10-14 UTC
- **Ended:** -
- **Duration:** -

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
A teacher (or administrator) can enter a subject's marks for an arm and term; the numbers come from the scheme and the grade scale; the first result locks both; everything is in the history. The review workflow is P2b.

## 2. Work Breakdown
- [x] Design committed alone first and merged (PR #37).
- [x] Migration `20261014120000_results` (additive; run before the code; applied to the test DB): `Result`, `ResultAudit`, enum `ResultStatus`, plus `UNIQUE (branchId, id)` on `StudentRecord` and `AcademicPeriod` (ids are already unique, so it cannot fail on live rows). Composite keys keep a result's student, subject, term, arm, scheme and scale in its branch; one live result per student x subject x term; CHECKs for the numbers (parts + exam = total, within the maximum), a filled grade, and **each status having exactly its dates and people**, and a verification token existing only while published; triggers: student/subject/term/branch never change, the content and snapshot change only while DRAFT, only a DRAFT can be deleted, `ResultAudit` refuses UPDATE and DELETE (TRUNCATE is left alone on purpose so test resets work - the limit is stated in the migration and the plan).
- [x] `lib/academics/results.ts`: `getSheet` (the arm's students for the term, the scheme's parts, what is entered), `saveSheet` (validate everything first, then one transaction: enter / edit / remove drafts, `ResultAudit` row for each, `lockScheme` + `lockScale` on the first result), `mayEnterResults` (administrator of the branch, or a teacher with a live staff record linked to their account and an assignment for exactly that subject and arm - **results only**; attendance unchanged). A class's own scheme wins over the branch default; the grade is looked up on the percentage. A bad row refuses the whole sheet with its own sentence (400); an unknown student, a missing scheme or scale, a closed session, an unoffered subject, a submitted result are 409.
- [x] Routes through `withBranch(as: "staff-write")`: `GET` and `PUT /api/v1/academics/result-sheets`. Anyone else in the branch is 403; another branch's arm is the same 404 as an unknown one.
- [x] Tests: `tests/integration/results.spec.ts` (9), `tests/api/results-entry.spec.ts` (10), shared `tests/support/results-world.ts`. The integration spec was NOT seen failing first (passed on its run after one fixture fix); the API spec **was seen failing once for a real bug**: saving unchanged marks wrote a second EDITED history row, because the database returns JSON with its keys reordered and I compared the text - now compared by value, re-run green.
- [ ] **Deviations from the design:** `ReportRemark` moves to P2c (it belongs with the report card); no single-result route yet (the sheet is the only entry point in P2a). Both are additive later.
- [ ] Not done here: the status machine beyond DRAFT (P2b), the report card (P2c), the screens (P2d).

## 3. Verification
Targeted after `pnpm build`: integration 9 + API 10 + route guard passed; typecheck, lint, Prettier clean. Full suite: **(running)**. Mutation passes NOT RUN - pending, end of Phase 2.
