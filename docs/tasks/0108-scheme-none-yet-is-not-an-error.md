# 0108: A class with no assessment scheme yet is not an error (the red 404s on Assessment and grading)

- **Period / Focus:** 2026-11-19 (the maintainer, twice, with the network tab of production open: `GET /api/v1/academics/schemes/class-group/<id>` answers `404 Not Found`, `{"error":{"code":"NOT_FOUND","message":"Scheme not found"}}`; "I'm getting the error when I click on Assessment and grading")
- **Status:** Built; the record is section 4
- **Priority:** Medium (nothing was broken for a user; it looked broken)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/scheme-null` / PR into `dev`
- **Started:** 2026-11-19

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What was happening

Opening Academics > Assessment and grading draws the "Scheme levels" section, which asks for the assessment scheme of EVERY class of the branch, one request per class (`SchemeLevelsPanel`: ten classes, ten requests). A class that has not been given its own scheme yet (the normal state of a new school: marks fall back to the branch default, then the school-wide one) was answered `404 NOT_FOUND "Scheme not found"`. The screen read any answer that was not OK as "this class has none" and drew the right thing ("No assessment schemes yet"), so users saw nothing wrong; but the browser's network tab showed one red 404 for each such class, and the console counted them as errors. It reads as a fault, and a real fault would be hidden among them.

## 2. Decision

- **D1. "No scheme yet" is a state, not a missing thing.** `GET /api/v1/academics/schemes/class-group/[id]` answers `200` with `{ "scheme": null }` for a class of the caller's branch that has no live scheme. The 404 stays for what really is not found: a class that does not exist, or that belongs to another branch (answered exactly alike, so a response never confirms that a class exists elsewhere), as before.
- **D2. The one caller reads it as it already did** (`scheme: null` means none), with the type made explicit (`Scheme | null`).
- **D3. Not in this task:** the screen still makes one request per class. One request for the whole branch would be cheaper (ten requests become one); that is a change of the API's shape and is left for its own task.

## 3. Files

`src/app/api/v1/academics/schemes/class-group/[id]/route.ts` (GET), `src/components/academics/SchemeLevelsPanel.tsx` (the type), `docs/functions/school-app.md` (the route's row), `tests/api/scheme-none-yet.spec.ts` (new).

## 4. Build record and tests

**Batch run, 2026-11-19.**
- **Setup:** one local checkout merging #294 (17d147b), #295 (99c1656) and #296 (51d31f4) as f5e8be1, one production build, one worker on the shared test database.
- **Projects:** setup; unit (all); integration (session-lifecycle); api (scheme-none-yet, finance-stats, student-parent-login-switch, school-site, portals, login); browser on desktop and phone (info-tips, academics-grading-staff, scheme-levels, finance-overview, finance-a11y, finance-contrast, fees-bulk, finance-fee-edit, finance-refresh, standing-and-payment-rules, browser-security, school-site, portals, global-search, sign-in).
- **Result:** **1834 passed, 9 failed, 23 skipped** in 45.2 min.

The 9 failures:
- `portals.spec.ts:81` and `:99`, desktop and phone (4): known before this batch and recorded in earlier runs. The local portals server's `localhost` school address sends a website page back to itself. Not caused by these changes.
- `school-site.spec.ts:33`, desktop and phone (2): the test counted three Sign in buttons on a database an earlier spec had emptied. Fixed in the test (#296).
- `academics-grading-staff.spec.ts:57`, desktop, both themes (2): see the reruns.
- `academics-grading-staff.spec.ts:124`, phone, dark (1): the tap on the Staff tab did not register under load (load average about 13). It passed alone.

**Reruns on the same build:**
- **Rerun 1:** `school-site:33` passed on desktop and phone; `:124` passed. The grading spec, now naming the element in its axe report, failed target-size on `button[data-info-tip="academics.schemes"]`, which sat half under the sticky top bar after the page had scrolled. The test now scrolls to the top before that check.
- **Rerun 2:** academics-grading-staff + info-tips on desktop and phone: **45 passed, 0 failed**.

**For this task:**
- `tests/api/scheme-none-yet.spec.ts` (4) and `tests/e2e/scheme-levels.spec.ts` passed in the batch.
- `tests/e2e/info-tips.spec.ts` (24 px button, 16 px icon, -4 px margin) passed in the batch and in rerun 2.
- The axe report of `academics-grading-staff.spec.ts` now names the elements of each violation.
- **Lesson:** an element half under a sticky bar fails target-size whatever its size; scroll to the top before a whole-page axe check made after scrolling.
