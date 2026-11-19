# 0109: The website's sign-in page hides the parent and student buttons while they are off

- **Period / Focus:** 2026-11-19 (maintainer request, sign-in)
- **Status:** In Progress
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

Filled from the run logs before merge.

## 5. Notes

- Two small reads per page view (a `findFirst` for each switch, each stopping at the first open branch). The page is public and dynamic already; no cache, so a switch turned on shows its card on the very next visit.
