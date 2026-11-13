# 0072: A pupil's and a guardian's report card in the portal is the card the school hands out

- **Period / Focus:** 2026-11-13 (found by the walkthrough's chapter C14, step 134 and its screenshot; the maintainer asked on 2026-11-12 for the inconsistencies found to be fixed)
- **Status:** Built and tested; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/portal-report-card` / PR into `dev`
- **Started:** 2026-11-13

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

What a pupil or a guardian reads under Academic Results, prints and downloads is the same report card the school's staff read (`ReportCard`, from `getReportCard`): the school's name, motto, branch, address and telephone; the pupil's name, admission number, class and arm ("Primary 1 A"), gender; every subject with its parts, total, percent, grade and remark; the total, average, position and class size; both remarks; the grading legend; and the verification address of each subject.

## 2. What was wrong (found by C14, 2026-11-13)

The portal built its own card from its own, smaller, answer (`getStudentPortalResults` in `src/lib/portal/service.ts`) and its own markup (`PortalResultsTab.tsx`). Beside the staff card it showed:

1. the heading in capitals was the **branch's** name ("PRIMARY (ENGLISH)"), where the staff card says the school's name, its motto, and the branch with the address and telephone;
2. "Class & Arm" said only the arm ("A"), where the staff card says "Primary 1 A";
3. the card it **downloads** was built in the browser from that smaller answer, with no principal, no motto, address or telephone, no position, no class size and no grading legend, so a downloaded card from the portal was not the card the school would print;
4. the table had no parts, no percent, no position or class size, and the verification addresses were not on the screen (the downloaded copy listed them);
5. **where no remark had been written the portal wrote one**: "Commendable performance and active classroom participation." in the class teacher's box and "Promising results. Keep working hard in subsequent terms." in the principal's, as if they had said it (found while reading the tab's code for this fix; the component catalogue had recorded it as a "generic placeholder"). A pupil's card must carry what the school wrote and nothing else, so the staff card's dash replaces it.

6. **found by this task's own browser test, on the first run (2026-11-13)**: the shared download builder, `generateReportCardHtml` (the staff's "Download" uses it too), never printed the principal's name (the on-screen card prints it beside the principal's remark) and, like the portal's screen, **wrote a remark where none had been written**: "Satisfactory academic performance." in the class teacher's box and "Promoted/Advanced to next academic term." in the principal's. Giving the portal the staff card's download would have carried both into every pupil's file.

The marks, grades, average and remarks were right; it is the card around them that differed.

## 3. Decisions

- **D1. One card, one builder.** `getStudentPortalResults` also returns, for every term with a published result, `card`: what `getReportCard(branchId, studentId, periodId, false)` returns (published results only, never a preview). The tab draws `ReportCard` with it, and Download uses `downloadReportCardHtml` with it, exactly as the staff screen does. The tab's own markup and its hand-made download card are deleted, so the two cannot differ again.
- **D2. The old fields stay.** `reportCards[].period`, `classArm`, `results`, `remarks`, `totalScore`, `average` and `subjectCount` are still sent (other code and the walkthrough read them); `card` is added beside them. Nothing is removed from the API.
- **D3. Nothing more is exposed than the staff card holds, and the gates are unchanged.** The portal route's own checks (who may read which child, the fee gate `block_unpaid_report_cards`, the Portal access setting) run before any of this, as before; a card is built only for the pupil whose results are being read; the card holds the school's public details, the pupil's own name, admission number, class and gender (all already on the portal's overview) and the class position (the staff card's own "card parents will see").
- **D4. No migration, no new route.**
- **D5. The downloaded card follows the screen card on remarks and the principal.** `generateReportCardHtml` names the principal beside the principal's remark ("Principal's Remark (Dr. A. Rahman)", no brackets when none is on file) and writes a dash where a remark was not written, exactly as `ReportCard` does. This changes the staff's downloaded card in the same two ways, on purpose: a card handed out must carry what the school wrote and nothing else, whoever downloads it. The signature boxes are unchanged.

## 4. Work breakdown

- [x] Design (this file).
- [x] `getStudentPortalResults` adds `card`.
- [x] `PortalResultsTab` draws `ReportCard`; Download uses `downloadReportCardHtml`; Print is unchanged.
- [x] New API spec (the portal's results carry the same card as the staff screen, for a pupil and for a guardian, and none for another pupil's id) and a browser check (the portal shows the school's name and "JSS … A").
- [x] `generateReportCardHtml`: the principal beside the principal's remark, a dash for an unwritten remark (D5), with two unit tests that failed on the unfixed export.
- [x] Docs: the components catalogue, the function catalogue, the tracker; the walkthrough chapter C14 asserts the school name and the class on the portal card after this is on `dev` (next walkthrough PR).

## 5. Not in this task

- The fee gate's wording, the term selector's wording, and the portal's page chrome.
- Mutation passes (deferred to the end of PHASE 2).

## 6. Build record and tests

Filled from the logs of 2026-11-13 (`/tmp/portalcard-*.log`), nothing from memory.

**Gates, in order, on the final tree:** `tsc --noEmit` exit 0; ESLint on the eight changed source and test files exit 0; Prettier `--check` clean on every changed file (`PortalResultsTab.tsx` was already clean on HEAD; `src/app/portal/page.tsx` and `src/lib/portal/service.ts` are not Prettier-clean on HEAD, so they were edited by hand and not reformatted); `pnpm build` exit 0, "Compiled successfully".

**The new tests failed on the unfixed code first.**

- `tests/api/portal-report-card.spec.ts` against the unfixed build: setup passed, **3 of 3 failed** (`card` undefined in the portal's answer).
- The two new unit tests in `tests/unit/report-card-payment-gate.spec.ts` against the unfixed export: **2 failed, the 2 older tests passed** (no principal beside the remark; the made-up sentences were there).
- The browser spec's second test, first run on the build with the portal fix but the old export: **2 failed** (desktop and phone), "Expected substring: Mrs Principal". That is how defect 6 was found; the test had expected the principal in the file and the shared builder never printed it. The other four browser tests of that spec passed.

**Final run**, one lane, one worker, built first: `setup`, `unit`, `api`, `e2e-desktop`, `e2e-mobile` over `tests/unit/report-card-payment-gate.spec.ts`, `tests/api/portal-report-card.spec.ts`, `tests/e2e/portal-report-card.spec.ts`, `tests/api/portal.spec.ts`, `tests/api/portal-access.spec.ts`, `tests/e2e/portal-access.spec.ts`, `tests/e2e/portal-a11y.spec.ts`, `tests/e2e/standing-and-payment-rules.spec.ts`, `tests/api/report-card.spec.ts`: **80 passed, 0 failed, 0 flaky (8.3 minutes)**: 1 setup, 4 unit, 27 API, 48 browser (24 desktop, 24 phone). The three new API tests, the three new browser tests (both projects) and the four unit tests are among them; `portal-a11y` and the new browser spec check WCAG 2.2 A/AA with axe, the new one in both themes.

**Not run:** the whole suites (only the specs above, which cover the portal, the report card, the standing rules and the card's builder); the staff's "Download" button in a browser (the unit tests cover the builder it shares, but no browser test downloads the staff's card); mutation passes (deferred to the end of PHASE 2); a hosted database or any deployed build.
