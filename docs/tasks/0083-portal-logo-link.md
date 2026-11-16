# 0083: The portal's logo is a link to the start page

- **Period / Focus:** 2026-11-16 (the maintainer: "make the logo a link", about `PortalHeader.tsx`, with a screenshot of the sign-in card)
- **Status:** Built (the record is section 4)
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/portal-logo-link` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

On `/portal`, a visitor who clicks the logo goes to the start page (`/`), in the signed-in view (the header) and on the sign-in card.

## 2. Decisions

- **D1. Two places, one destination.** The maintainer named `PortalHeader.tsx`, and the screenshot shows the sign-in card's logo tile, which is a different component (`PortalLoginCard.tsx`). Both are links to `/`: a portal visitor who is not staff sees the school's own site there (task 0080), and a signed-in staff member is sent to the dashboard.
- **D2. The header link covers the logo and the name.** The "AE" badge and "AlEemaan Portal" form one link, so there is one link in the header rather than two with the same target (a screen reader would announce it twice). The badge is `aria-hidden`, so the link's name is "AlEemaan Portal". The branch pill and "Student & Guardian Self-Service" stay outside the link; they describe the pupil, not the site.
- **D3. The card's logo tile has no text,** so the link has `aria-label="AlEemaan School website"`. The icon inside is already `aria-hidden`.
- **D4. `next/link`, no new style.** A hover opacity and the focus outline of the rest of the design are used; there is no new colour, so the axe contrast checks are not affected.

## 3. Findings

None beyond D1.

## 4. Build record and tests

- Failing first (old markup): the two new tests in `tests/e2e/portal-access.spec.ts` failed, the third (nothing else changed) passed: 2 failed, 1 passed.
- With the change: `portal-access.spec.ts` and `portal-a11y.spec.ts`, desktop and phone projects: **21 passed** (1.9 minutes), against a test database `aleemaan_portallogo_test` built for this task.
- The new tests: the sign-in card's logo link has `href="/"`, is reachable by keyboard, and a click lands on the school site's heading; the header link is named "AlEemaan Portal" and is the only link in the header.
- Gates: see the pull request (typecheck, lint, Prettier `--check` on the changed files, build).

**Not run, and not claimed:** the rest of the browser suite (the change touches two components and one spec); mutation passes (deferred to the end of PHASE 2).
