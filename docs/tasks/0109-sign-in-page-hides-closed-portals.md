# 0109: The website's sign-in page hides the parent and student buttons while they are off

- **Period / Focus:** 2026-11-19 (maintainer request, sign-in)
- **Status:** Built; the record is section 4
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/signin-hide-closed` / PR to `dev`
- **Started:** 2026-11-19

---

## 1. Objective

The maintainer, 2026-11-19, with a screenshot of the website's **Sign in** page (`/select-role`: Parent, Student and Staff cards): "the parent and student should not be displayed if it's off".

The page now shows the **Parent** card only while at least one branch has parent sign-in on, and the **Student** card only while at least one branch has student sign-in on (the switches of task 0091, Settings > Sign-in access). **Staff** is always shown.

## 2. Context

- The switches are per branch and OFF by default (task 0091). Until now they closed the sign-in itself (a closed student or parent with the right password is told it is closed) and the parent./student. portal's own `/login` page showed a "closed" notice, but the website's chooser always offered all three cards. A parent who clicked theirs reached a form that turned them away.
- The page cannot know a visitor's branch before they sign in, so it uses the same rule as the portal notice: a card is shown while **any** branch has that switch on (`loginOpenAnywhere`). With several branches, a card can show while the visitor's own branch is still closed; their sign-in then gets the plain "closed" message, as before.
- This is about presentation only. The sign-in refusal, the per-request session check and the switch API are unchanged.

## 3. Work breakdown

- [x] `signInChoices(openAnywhere)` in `src/lib/auth/login-switch-rules.ts` (pure): parent and student only while open somewhere, staff always, in the school's order.
- [x] `src/app/(marketing)/(site)/select-role/page.tsx`: reads `loginOpenAnywhere()` on every request (the page was already `force-dynamic`). If that read fails it treats both as closed, which is what every branch starts as, and still shows Staff. The grid's width and columns follow the number of cards (one, two or three), so a shorter list stays centred.
- [x] Tests: unit `tests/unit/login-switch-rules.spec.ts` (all four combinations); API `tests/api/student-parent-login-switch.spec.ts` (the real page on the school's host with the portals on and on the plain server: closed → Staff only; one branch opens students → Student, Staff; another opens parents → all three).
- [x] Docs: `docs/functions/shared.md`, `docs/DEPLOYMENT.md`.

Existing specs that expect three cards (`school-site`, `portals`, `sign-in`) still hold: the shared test helpers turn both switches ON for every branch unless a spec manages them itself.

## 4. Verification

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

**For this task:** the unit rule (`login-switch-rules`), the new API test in `student-parent-login-switch.spec.ts` (the real page on the school's host with the portals on and on the plain server), `tests/api/school-site.spec.ts` and the browser `portals.spec.ts` test that counts three buttons all passed. `tests/e2e/school-site.spec.ts:33` now seeds the instance first (the shared helper makes the branches with both switches on) and passed on desktop and phone in rerun 1.

## 5. Notes

- Two small reads per page view (a `findFirst` for each switch, each stopping at the first open branch). The page is public and dynamic already; no cache, so a switch turned on shows its card on the very next visit.
