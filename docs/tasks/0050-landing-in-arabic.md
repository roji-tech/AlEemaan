# 0050: The landing page in Arabic, right to left, at `/ar`

- **Period / Focus:** 2026-11-11 (public pages; the Arabic version of task 0049's page, the third item of the maintainer's "not built" list: "AlEemaan's landing page has no Arabic version")
- **Status:** Built and tested; in review (PR into `dev`). **The Arabic words must be read by a reader of Arabic before the page is public.**
- **Priority:** Medium
- **Assignee:** Claude (a reader of Arabic must review the words before the page is public)
- **Target Branch / PR:** `claude/arabic-landing` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A parent who reads Arabic can open the school's front page in Arabic: the same page as `/`, right to left, in an Arabic typeface, with its words in Arabic, reachable from the English page by a link in its header and back by a link in its own. Two of the school's four branches teach in Arabic; their families should not have to read the front page in a second language.

## 2. Context

- Task 0049 made the English page about the school (`brand.landing`). Octalve Edu's task 0044 made the shared `LandingPage` take its words, language and direction as props (`copy`, `name`, `labels`, `lang`, `dir`, `switchTo`) and keep to direction-neutral styles (a unit test holds that), so the same component draws a right-to-left page.
- `src/app/page.tsx` decides who is shown the page: a signed-in person is sent to `/dashboard`, an instance whose set-up is not finished to `/setup`; everyone else sees the page.
- The root layout fixes `<html lang="en">` and loads Geist (Latin only). The page policy allows fonts from this site only (`font-src 'self'`); `next/font` self-hosts at build.
- The application's own screens (sign-in, the portal, the dashboard) have no Arabic version: everything after the landing page is English.
- Nobody on this project reads Arabic well enough to vouch for the words. They are translated by an AI from the English page, which is the page's only source, and are flagged for review in the file that holds them.

## 3. Decisions

- **D1. A second page at `/ar`, linked both ways; no detection, no memory.** The English header gets a quiet link "العربية" (marked `lang="ar"` and `hreflang="ar"`); the Arabic header has "English" (marked `lang="en"` and `hreflang="en"`). There is no redirect by the browser's language, no cookie and no stored choice: each page is a plain address that a person, a link and a search engine can name.
- **D2. `/ar` decides exactly as `/` does.** One function, `leaveUnlessVisitor()` (`src/lib/landing/start.ts`), holds the decision for both pages: signed in goes to `/dashboard`, set-up not finished to `/setup`, anyone else sees the page.
- **D3. The words are `src/lib/landing-ar.ts`** (`landingAr`, `labelsAr`, `nameAr`), the same shape and the same claims as the English page, and no more; nothing about admissions, contacts, history or fees (task 0049, section 5). The file says at its top that it is AI-translated and must be reviewed by a reader of Arabic, and names what to check: the register, the branch names, the school's name in Arabic ("الإيمان") and the word for the portal.
- **D4. Direction and language on the page's own element.** `lang="ar" dir="rtl"` are props of the component, written on its outer element; the layout's `<html lang="en">` is shared by every page and is not touched, so the document's language stays English while the page's content is Arabic for a screen reader. (A page-level `html` language would need the layout to know the route: a larger change for little.)
- **D5. An Arabic typeface for this page only.** Noto Naskh Arabic through `next/font/google` (subset `arabic`, self-hosted at build, `display: swap`), applied by a wrapper on this page; the English page does not load it. The few Latin words on the Arabic page (the "English" link) fall back to the system sans. *Cost:* one more font file, only on `/ar`. *Alternative:* the system's Arabic font, which varies from device to device.
- **D6. Metadata.** The tab is the Arabic title (absolute, as the English page's is) and the description is Arabic; the page is open to search engines. No `alternates`/`hreflang` links in the head: they need an absolute base address (`metadataBase`) that the project has not set; the visible links carry the language marks.
- **D7. Everything after the landing page stays English.** "تسجيل الدخول" leads to the English sign-in page. This is stated here and in the HANDOVER; an Arabic sign-in is a larger task (the whole application's strings) and is not started.
- **D8. Tests.** Unit: the Arabic words keep the English page's shape and rules. API: what `/ar` answers (the page, in Arabic and right to left; no cookie; the links; signed in goes to the dashboard; set-up not finished to the wizard) and the new link on `/`. Browser (desktop and phone): language and direction, the headings, mirroring measured with boxes, the Arabic font loaded from this site, the two links both ways, the four sign-in links in Arabic, the theme button's name, keyboard order, Axe and overflow in both themes also at 320 px and with larger text (for the Arabic page and for the English page with its new link), no script, a signed-in person.
- **D9. Nothing else changes:** no migration, no new component, no change to what `/` says.

## 4. Work breakdown

- [x] Design (this file).
- [x] `leaveUnlessVisitor`; `/` uses it and links to `/ar`; `src/app/ar/page.tsx`; `landing-ar.ts`.
- [x] Tests (D8) and the specs of tasks 0048 and 0049 pass (the English page now has a third link).
- [x] Docs: `docs/pages/public.md`, the components catalogue, tracker, HANDOVER, CLAUDE.md banner.
- [x] Mutation check; regression.

## 5. Not in this task

- A reader of Arabic going through the words (the maintainer's to arrange).
- An Arabic sign-in page, portal or dashboard.
- Arabic digits, a language chooser, detection by `Accept-Language`, `hreflang` links in the head.
- The page's Arabic words for anything the school adds later (admissions, contacts, history): each is added in both languages.

## 6. Build record and tests

**Built on** `claude/arabic-landing`. No migration; no new component (the shared `LandingPage.tsx` is Octalve Edu's, unchanged and byte-identical). New: `src/lib/landing/start.ts` (10 lines: `leaveUnlessVisitor()`), `src/app/ar/page.tsx` (30 lines), `src/lib/landing-ar.ts` (41 lines: `landingAr`, `labelsAr`, `nameAr`). Changed: `src/app/page.tsx` (uses `leaveUnlessVisitor()` and passes `switchTo`), and the specs and docs named below.

**Tests.**
- Unit `landing-ar-copy` (new, 11 tests): the same shape as the English page (four branches, four kinds of people, the same links, no "how it is run" section, no icons), the four branch names in the school's order, every text Arabic with no Latin letter, no figure and no offer the product does not make, sentences ending with a full stop, a title and a description of a length a tab and a search result can show.
- API `landing-router` (extended, 14 tests): `/` now links to `/ar` and the link says so in Arabic and is marked as Arabic; `/ar` answers 200 in Arabic and right to left with its own title and description, sets no cookie and writes nothing, a forged cookie is a visitor, signed in goes to `/dashboard`, set-up not finished goes to `/setup`, finished shows the page, its links are `/login`, the portal and the English page.
- Browser `landing-ar-screens` (new, 15 tests, desktop and phone): language and direction on the page's own element while the document stays English; the headings in order and the landmarks; mirroring measured with boxes (the name at the right and the way in at the left, the hero's words from the right edge, the first branch to the right of the second, the buttons in the order of the reading); Noto Naskh Arabic loaded from this site (a response under `/_next/static/media/`, status `loaded`); the language links both ways; the four sign-in links in Arabic and the theme button's name; keyboard order and focus rings; Axe and horizontal overflow in both themes, at 320 px, and with text a third bigger; no script; a signed-in person. `landing-screens` (task 0049): its keyboard-order test now starts with the language link; the English page's Axe and overflow with its new link are checked in `landing-ar-screens`.

**The first run had four failures, all wrong expectations in my tests, not bugs in the page.** 171 passed, 6 skipped, 4 failed (two tests, desktop and phone): (1) the font test looked for `Noto_Naskh_Arabic`, but the browser reports the family with spaces, `"Noto Naskh Arabic", "Noto Naskh Arabic Fallback"`; (2) the keyboard-order test of the English page did not know that the English header now starts with the "العربية" link, so the list of stops was one short. Both were corrected (the English page's first tab stop is now the language link, an intended change). Rerun: 175 passed, 6 skipped (the skips are by design: a phone-only or desktop-only check in a project it does not apply to).

**Mutation check.** Twelve changes, each applied alone to the code, the build redone, and the four landing specs run (`landing-ar-copy`, `landing-router`, `landing-screens`, `landing-ar-screens`; 82 tests per run, counting both browser projects). Every one was caught, by tests of its own:

| | Change | Tests that failed |
| --- | --- | --- |
| A1 | `leaveUnlessVisitor` no longer sends a signed-in person to `/dashboard` | 6: API `/` and `/ar` signed-in; browser `/` and `/ar` signed-in, desktop and phone |
| A2 | it no longer sends an unfinished instance to `/setup` | 2: API `/` and `/ar` set-up |
| A3 | `/ar` does not call `leaveUnlessVisitor` | 4: API `/ar` signed-in and set-up; browser `/ar` signed-in (2) |
| A4 | `dir="rtl"` becomes `ltr` | 8: API `/ar`, the element's language and direction (2), mirrored header (2), hero words and buttons (desktop), Axe and overflow (2) |
| A5 | `lang="ar"` becomes `en` | 3: API `/ar`; the element's language and direction (2) |
| A6 | the Arabic font class removed | 2: the font test, desktop and phone (nothing else notices) |
| A7 | the English link on `/ar` points to `/ar` | 5: API links; "the English link says English, is marked as English and opens the English page" (2); no-script links (2) |
| A8 | no `switchTo` on `/` | 6: API links (2); "the Arabic link says Arabic in Arabic, is marked as Arabic" (2); the English page's keyboard order (2) |
| A9 | `/ar` has an English title | 3: API `/ar`; "its own Arabic title, one h1, headings in order" (2) |
| A10 | the Arabic copy loses its fourth branch | 2: unit "same number of branches" and "the four branch names in the school's order" |
| A13 | the English page marks its Arabic link `lang="en"` | 3: API; "the Arabic link says Arabic in Arabic" (2) |
| A14 | the Arabic page's header name in Latin letters | 4: "its own Arabic title, one h1..." (2) and "the name at the right and the way in at the left" (2); both wait for the Arabic name in the banner and fail on it; the "name at the right" test gives up after two minutes |

**Regression.** A clean build, then the whole `unit` and `api` projects and the related browser specs (`landing-screens`, `landing-ar-screens`, `auth-logo`, `sign-in`, `brand`, `csp`): **2,412 passed, 0 failed, 0 skipped** in the whole `unit` and `api` projects (49.9 minutes, one worker), and **141 passed, 6 skipped, 0 failed** in the six browser specs (2.1 minutes; the skips are the same by-design phone-only or desktop-only checks as before), on a clean build (`pnpm build` exit 0). After that run `landing-ar-copy.spec.ts` was edited (its two character ranges became `\\uXXXX` escapes, see below); it and `source-hygiene` were run again on the final files: 13 passed. `tsc --noEmit`, `eslint` on the changed files and `prettier --check` on every changed file are clean.

**Found by reading the result, not by a test:** my first copy of `landing-ar-copy.spec.ts` held a literal U+0600 as the start of a character-class range, which the repository's `source-hygiene` test forbids in any tracked file (found while the whole-suite run was building, by scanning my own files after the same defect failed Octalve Edu's whole-suite run for task 0045). It is a `\u0600` escape now.

**Not tested, and not claimed.** Nobody on the project reads Arabic: the words, their register, the branch names, "الإيمان" as the school's name and the word for the portal have not been read by a person who does. No real screen reader or phone was used (Axe, keyboard order, focus rings, the 320 px reflow, a script-free read and layout measured with boxes were). The metadata (`hreflang`) is on the visible links only, not in the head (no `metadataBase`).
