# 0037: The promotion screens send the fields the server reads, start on the right sessions, and the server refuses a rollover that cannot be right

- **Period / Focus:** 2026-10-21 (finishing the uncommitted edits found in the worktree `../AlEemaan-fix-promotion`, branch `claude/fix-promotion-screens`, last touched 2026-10-20)
- **Status:** Completed on the branch (verified below; PR open). One decision is left to the maintainer (the final-term check).
- **Priority:** High (an administrator who overrides a pupil's decision loses the arm and the reason; the console's default sessions enrol pupils into the OLDER session)
- **Assignee:** Agent (Claude)
- **Target Branch / PR:** `dev`; branch `claude/fix-promotion-screens`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
(a) The promotion console sends the field names the server reads (`targetClassArmId`, `overrideReason`) and the history screen reads the field names the server sends (`executedBy`, `overallAverage`, `decision`, `decisionMode`, `targetEnrollment`). (b) The console starts on the right pair of sessions and cannot offer a pair that makes no sense. (c) The server refuses a rollover that cannot be right instead of writing it. (d) Two administrators pressing the button at the same moment cannot process a pupil twice.

## 2. Why the uncommitted diff changed field names (the question in the hand-off)
The edits in the worktree renamed what the console SENDS and what the history view READS to match the server's request schema (`studentPromotionOverrideSchema`) and the shape `getPromotionBatch` returns. Before the rename the zod schemas, which are not strict objects, silently dropped the console's `targetArmId` and `reason`: an override reached the record without its arm and without its reason, and the history view read fields that do not exist (`initiatedByUser`, and so on), so its columns were empty. The diff was therefore a bug fix, not a taste change. It was never run or committed.

## 3. What reading the diff and the service found beyond the rename
| # | Finding | Effect |
|---|---|---|
| 1 | The console picked the session list's first two entries as source and target without looking at dates. The list comes newest first, so it EVALUATED the newer session and ENROLLED pupils into the older one | A rollover run on the defaults went backwards |
| 2 | The server accepted a target session that is the source itself, begins before it, or belongs to another branch | Nothing refused it; a foreign session id was written into the batch |
| 3 | An override could name a pupil who is not in the class, an arm of another class, an archived arm, or an arm for a pupil who is not moving | The record was written with an arm that does not fit |
| 4 | PROMOTED was accepted for a pupil of the last class (there is no next class) | An enrolment with no class |
| 5 | A repeat-to-promote override with no arm chosen kept the pupil's OLD arm (the arm of the class they are leaving) | The pupil landed in a wrong-class arm |
| 6 | Two requests for the same class at the same moment both read the roster as ACTIVE (a repeat run later reads an empty roster, so only the simultaneous case is open) and both wrote | A pupil processed twice: two records, the enrolment written twice. With the fix the second request finds the pupils already dealt with and records none (its batch header is still written, empty, as a later re-run's is) |
| 7 | An unknown class was a 500 | |
| 8 | A page left open while an administrator added or reordered classes could send a stale `targetClassGroupId` | The pupils were enrolled into a class that is no longer the next one |
| 9 | The history screen had no way to say what the rule advised against what was done | `getPromotionBatch` now returns `recommendedDecision` per record, recomputed from the stored average, the pass mark and the terminal flag |

## 4. Work Breakdown
- [x] `src/lib/promotion/rules.ts`: `sessionAfter`, `defaultPromotionSessions` (source = the latest ACTIVE session, else the second newest, else the only one; target = the session that begins right after the source) and `sessionPairProblem` (the same session, or a target that does not begin after the source).
- [x] `src/lib/promotion/service.ts`: `PromotionError` (400, 404 or 409); `previewPromotion` checks the sessions belong to the branch and make a valid pair, an unknown class is 404; `executePromotion` refuses a stale target class (409), an override for a pupil not in the roster (409), PROMOTED with no next class, an arm that is not an active arm of the destination class, and an arm for a pupil who is not moving; the arm of a pupil who ends up PROMOTED is resolved from the FINAL decision (the same arm name in the next class, else its first arm); each pupil is processed with a compare-and-set `updateMany` on the ACTIVE status and counted, so two simultaneous rollovers process each pupil once; `getPromotionBatch` returns `recommendedDecision`, and null for a batch that is not there.
- [x] Routes `preview` (GET, POST) and `execute` map `PromotionError` to the standard failure with `PROMOTION_REFUSED` and its status.
- [x] Console: the override payload uses `targetClassArmId` and `overrideReason`; starts on `defaultPromotionSessions`; the target list offers only sessions after the source; a hint when none exists; the preview is discarded on any change of selection; a warning when the current term is not the session's last.
- [x] Preview table: sends an arm only when the administrator chose one (the server then resolves the arm by the final decision); shows the arm name; theme tokens.
- [x] History view: `executedBy`, `overallAverage`, `decision`, `OVERRIDDEN`, "Moved To" from `targetEnrollment`, the advised decision next to the one made, a Try again on a failed detail load; theme tokens instead of fixed colours.
- [x] Confirm modal: says when it is not the final term, and that a repeated run is safe.
- [x] Tests: `tests/unit/promotion-rules.spec.ts` (+6), `tests/api/promotion-checks.spec.ts` (new, 7 tests), `tests/e2e/promotion-flow.spec.ts` (new, 3 tests).
- [x] Catalog rows (`docs/functions/school-app.md`), `docs/HANDOVER.md` section 6.0, `docs/open-items.md`, the progress tracker.
- [x] Follow-up (2026-10-23): the full suite on the merged `dev` found, in the e2e-mobile project that this task had not run, an accessibility violation (axe `scrollable-region-focusable`) in the history details dialog: its table of records scrolls at phone width and a region that scrolls must be reachable by keyboard. The three tables of the promotion screens (preview, history batches, a batch's records) are now labelled regions with `tabIndex={0}` and a visible focus ring, as the marks-entry table already was; the records table scrolls in both directions. The existing `promotion-flow` mobile test is the regression test: it failed on unmodified `dev` (twice, in the full run and alone) and passes on the branch.
- [ ] Open, the maintainer's decision: the final-term `eligibility` flag is still only SHOWN (a warning in the preview and the confirm dialog), not enforced by the server. A school may legitimately promote early (a transfer, a mid-year restructure); enforcing it would remove that. Say if it should become a refusal that an administrator can override with a reason.

## 5. Unified Verification & Quality Gates
- Order: `tsc` (ignoring the known `LayoutProps` error), eslint, prettier check, `pnpm build`, then the specs.
- Failing first: the new unit, api and e2e specs (together with the reader specs of task 0038) run against a production build of unmodified `dev` (3fff09e): 20 failed and 22 passed (the setup test and the existing promotion-rule tests as controls). Every new promotion test failed there.
- On the branch (production build; setup, unit, api and e2e-desktop projects, the three promotion specs): 36 passed, 0 failed. `tsc` (ignoring the known `LayoutProps` error), eslint, prettier and the catalogs (396 rows) clean; `pnpm build` clean.
- Not run at the time: the e2e-mobile and https projects; the whole setup, unit, integration and api projects on the branch; a full suite of every project on the merged `dev`. The full suite was run afterwards and found the mobile violation fixed by the follow-up above; the promotion-flow spec passes on desktop and phone on the fixed build (7 passed with the setup test).

## 6. Notes
- The server is the authority: the console's defaults and its hint are a convenience; every rule above is checked again on the server.
- A request that names a session of another branch is answered as a missing session (no hint that it exists elsewhere).
