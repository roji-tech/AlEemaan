# 0047: The logo on the signed-out screens goes back to the start page

- **Period / Focus:** 2026-11-10 (a small change to one shared layout, `AuthShell`)
- **Status:** Built; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/logo-home-link` / PR into `dev`
- **Started:** 2026-11-10

---

## 1. Objective

On every signed-out screen (`/login`, `/setup`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/confirm-email`, `/verify/[token]`) the product logo (the cap icon and the name, in the brand panel on large screens and in the compact header on phones) is a link to `/`, the start page. Asked for by the maintainer on 2026-11-10 ("make the logos go back to landing page", with a screenshot of the brand panel's logo). The same change is made in Octalve Edu (its own task record there).

## 2. Context

- `AuthShell` (`src/components/auth/AuthShell.tsx`) draws the logo twice and neither is a link. The brand panel is `<aside aria-hidden="true">` as a whole, because it is decorative; **a link cannot live inside an `aria-hidden` region** (it would be focusable but hidden from assistive technology: axe's `aria-hidden-focus`), so the hiding moves from the whole panel to its decorative parts (the grid pattern, the headline block, the copyright line) and the panel itself becomes `role="none"` (no "complementary" landmark that holds one link).
- **What `/` is.** There is no marketing landing page: `/` is a router that never draws anything (`src/app/page.tsx`): a signed-in visitor goes to `/dashboard`, a visitor while first-run setup is unfinished to `/setup`, anyone else to `/login`. So the logo, which points at `/`, ends on the sign-in page for a signed-out visitor, and **on `/login` itself it simply reloads the sign-in page**. It is the right target for the day a landing page exists at `/`, and useful already from the other screens (reset, invitation, confirmation, verification). Building a landing page is a separate product decision (not part of this task).
- Tests that pin the layout: `tests/e2e/brand.spec.ts` (`aside` visible on desktop with the headline, blurb and points; hidden on a phone; the brand name visible inside `main` on a phone) must keep passing unchanged.

## 3. Decisions

- **D1.** Both logos link to `/` (not `/login`): it is "the start", and it keeps working if `/` becomes a landing page.
- **D2.** The desktop logo is in the DOM before the form, so it is the first tab stop on large screens; on phones the panel is `display: none`, so the compact header's link is the only one: never two links at once.
- **D3.** The link's name is its visible text (the product name), so no `aria-label` is needed and "label in name" holds. The cap icon is decorative (`aria-hidden`).
- **D4.** Focus ring: white on the dark brand panel, the usual ring colour on the phone header. Hover dims the logo slightly.

## 4. Work breakdown

- [x] `AuthShell`: both logos are links to `/`; the panel is `role="none"` with its decorative parts `aria-hidden`.
- [x] A browser spec: on desktop and phone the logo is a link to `/`, reachable by keyboard with a visible focus ring, there is exactly one visible logo link, and from `/forgot-password` it takes the visitor back to the sign-in page; Axe in both themes on the pages with the link.
- [x] Docs: this record, the component catalogue row, the tracker.

## 5. Not in this task

- A landing page at `/`. The logos of the signed-in shell (they live in `AppShell`).

## 6. Build record and tests (2026-11-10)

**What changed.** `src/components/auth/AuthShell.tsx` only (the same edit in both products), plus `tests/e2e/auth-logo.spec.ts` (new), this record, the component catalogue row and the tracker. No other source file, no migration.

**Gates (order tsc, lint, build, tests).** tsc clean; eslint 0 errors; `pnpm build` OK; Prettier clean (`AuthShell.tsx` was clean at `dev`); catalogues in sync.

**Tests.** The new spec runs on the desktop and the phone project. The browser specs that visit the signed-out screens (`brand`, `accept-invite`, `account-self-service`, `csp`, `dev-inbox`, `setup-handoff`, `sign-in`, `password-reset`, `responsive-and-a11y`, `theme`, `two-step`, `users`, and in AlEemaan also `browser-security`) were run on the built change: **357 passed, 1 failed, 7 skipped (18 minutes)**. The one failure was this task's own keyboard test on the phone project, and it was a flaw in the test, not in keyboard access: the first field is autofocused, so Tab starts mid-page (field, button, link, then round to the top), and the logo is the 4th stop on a large screen but the 5th on a phone (after the theme button), where the test allowed four presses. It now takes a full trip round the page (up to eight presses). After the fix `auth-logo` and `brand` pass on both projects (16 passed; the skips are the tests that apply to one layout only). The rest of those specs were not re-run after the fix, which touches only the new spec. **Not run:** the rest of the suite, the HTTPS project, anything against a hosted database; no failing-first run, since a link that was not there has no old behaviour to fail.
