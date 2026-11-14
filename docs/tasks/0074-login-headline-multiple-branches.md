# 0074: The sign-in panel says "multiple branches", not "four branches"

- **Period / Focus:** 2026-11-14 (the maintainer, with a screenshot of the sign-in page: "can you change the 'Four branches' to 'multiple branches'")
- **Status:** Built and tested; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/login-headline-multiple-branches` / PR into `dev`
- **Started:** 2026-11-14

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

The headline on the sign-in page's brand panel (desktop, from 1024 px up) reads "One school, multiple branches, one login." instead of "One school, four branches, one login.", so the page does not promise a number that the school may outgrow.

## 2. What changed

- `src/lib/brand.ts`: `brand.login.headline` is the one string. Nothing else reads the old wording: the panel (`aside` on `/login`) and the public verification page's sign-in panel both take it from `brand.login`.
- `tests/e2e/brand.spec.ts` ("desktop: the brand panel is deep green with the artifact's headline, blurb and three points") asserts the new words.
- No migration, no API, no component change, no layout change: the new headline is a few characters longer on its line, and the panel's two-line headline wraps the same way.

## 3. Decisions

- **D1. Only the sign-in headline.** The maintainer's screenshot is the sign-in panel, so only that wording changed. The landing page (`brand.landing.description` and `lead`, "AlEemaan School ... has four branches") and the Arabic landing page (`src/lib/landing-ar.ts`) still say four: that is a fact about this school (the setup wizard seeds exactly four, and `landing-copy.spec.ts` holds the four names), not a promise on a sign-in page. If the maintainer wants those softened too, it is one more line each, plus the two unit specs that name the four cards.
- **D2. Historical records are not rewritten.** Task 0049 (section 2) and the design-language phase note quote the old headline; they describe what was true when written and stay as they are.
- **D3. The recorded walkthrough still shows the old headline** (the strict run of 2026-11-13 was recorded before this change). The next strict run, which is already planned, records the new one; nothing is re-recorded for this alone.

## 4. Tests

**Run (2026-11-14):** `tsc --noEmit` exit 0; eslint clean on the two changed files; Prettier `--check` clean on the two files and this record; the catalogue check (746 rows = 746 tracked files, none missing, none extra).

**Checked in a real browser, by a different route than the spec:** the production build could not be made on this machine today (the network was too slow for `next build` to download the Arabic page's Google font, "Noto Naskh Arabic"), and `tests/e2e/brand.spec.ts` starts `next start` on a build, so the spec itself did not run. Instead a development server was started on the branch and Chromium (1280 x 720) read the sign-in panel: it says "One school, multiple branches, one login." and the text "four branches" is not on the page; the blurb and the three points are unchanged. That is the same sentence the spec asserts; it is not the spec.

**Not run, and not claimed.** The spec `brand.spec.ts` (needs the production build, so it needs the network for the font); the phone project (the panel is desktop only: the spec skips it); the whole suite; mutation passes (deferred to the end of PHASE 2, the maintainer's call). The spec's change is one string mirrored from the product's, so it will fail on the old headline and pass on the new once the build can be made.
