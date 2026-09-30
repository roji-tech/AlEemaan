# Phase 0.5.A — AlEemaan's own look (the design artifact), the admin shell, and a real "Keep me signed in"

**Status: BUILT AND VERIFIED (2026-09-30) — awaiting the maintainer's merge.** Branch
`claude/design-tokens-shell` of `roji-tech/AlEemaan`, **stacked on `claude/octalve-auth-sync`** (the
0.5.1.6 sync, itself awaiting merge): merge that first. This file is a live work log until the merge; after
it, append-only like every file in this folder.

Design of record: `docs/development-history/domain-implementation-plan.md` → "Phase 0.5 addenda" → **0.5.A**
(written before any code). Source of the look: the private design canvas *"Octalve Edu & AlEemaan — UI
Design"* (`https://claude.ai/artifact/8wGBA2trirEDaTQq1sUf74`) — *"Admin app — same shell, one brand tweak"*.
Sibling record (same design; the tokens, theme, brand mechanism and remember-me semantics are specified there
in full, with the contrast numbers): Octalve Edu's `docs/development-history/phases/phase-0.5.A-design-language.md`.
Test guide: `tests/README.md`.

0.5.1.6 shipped AlEemaan's new screens in Octalve Edu's palette "as a stand-in" and said the re-skin was
*tracked, not decided*. **Decided ("do it") and done here.**

## What this phase delivers

1. **AlEemaan's own colours and words** on every screen — sea green, "One school, four branches, one
   login." — from the artifact, via the shared token system (only `app/brand.css` and `lib/brand.ts` are
   AlEemaan-specific; every shared component is code-identical with Octalve Edu's).
2. **A light theme and a dark theme**, dark by default, chosen with a toggle and rendered by the server on
   first paint (no flash, no inline script).
3. **The admin app shell** from the artifact: a 248 px sidebar and 60 px top bar on a desktop (breadcrumb,
   theme toggle, account menu); on a phone a compact top bar, a floating bottom tab bar and a "More" sheet.
   Skip link first in the tab order.
4. **Three real pages inside it**: *Overview* (`/dashboard`) with figures read from the database, *Branches*
   (`/branches`) with live member counts and a working "New branch" form on the existing
   `POST /api/v1/branches`, and *Account* (`/account`, the target of "Profile").
5. **"Keep me signed in on this device", made real** (semantics in Octalve Edu's plan §0.5.A and identical
   here): unchecked → a browser-session cookie and a 12-hour server-side cap; ticked → the existing 30 d idle
   / 90 d absolute policy (7 d for admins).
6. Tests for all of it in both themes, and mutation checks of every new security-relevant behaviour.

## Behaviour changes worth naming (this repo has a live school)

- **The default session is now shorter.** Before, every sign-in got the 30-day/90-day policy. Now that is
  what "Keep me signed in" gives; without it the session is a browser-session cookie capped at **12 hours**.
  Existing sessions are untouched (nobody is signed out by the deploy). A teacher on a shared staff-room
  computer no longer stays signed in for a month by accident; ticking the box restores today's behaviour.
- **`/dashboard` moved into the shell** and now shows real school-wide figures to administrators and the
  person's own branches to everyone else. The URL is unchanged.
- **Sign-out lives in the account menu** (avatar, top right) instead of a header button — as in the artifact.

## Work log

### 1. Design first
Read the artifact's login, branches, settings and mobile canvases and wrote plan §0.5.A before any code:
what the artifact fixes for AlEemaan, the shared mechanism, every deviation with numbers, the pages and the
responsive behaviour of the shell, the verification plan.

### 2. Brand and shared components
`app/brand.css` — `--brand #2E8B57`, `--brand-strong #2A7F4F` (filled buttons: white on `#2E8B57` is 4.25 : 1,
under AA; `#2A7F4F` is **4.94 : 1**, hover `#267349` 5.78 : 1), `--brand-deep #0b3d24` (white text 12.3 : 1),
`--brand-fg #6ee7b7` dark / `#1a5c3e` light (11.71 : 1 / 7.94 : 1), `--brand-tint #052e22` / `#f0fdf4`.
`lib/brand.ts` — name, tagline "Secondary & Primary • English & Arabic", the artifact's login copy.
Everything else was brought over from Octalve Edu's verified work: `globals.css` (tokens for both themes),
`theme.ts` + `ThemeProvider` + `ThemeToggle`, re-skinned `Button` / `TextField` / `PasswordField` / `Alert`,
`Card`, `CheckboxField`, `AuthShell`, the icon set (plus shell icons), `useSignOut()`, the sign-in and setup
screens, `session.ts` and the login route (remember-me).

### 3. The shell (`components/shell/`)
- `nav.ts` — the **one** navigation list (Overview, Branches, Settings *soon*, Users *soon*); sidebar, tab
  bar and More sheet are all derived from it, so they cannot disagree. Admin-only entries are hidden from
  everyone else (a courtesy — the page and the API enforce).
- `AppShell` (server) — sidebar, top bar, `<main id="main" tabIndex={-1}>` reserving room (`pb-32`) for the
  tab bar, skip link. `SidebarNav`, `Breadcrumb` (`Admin / Branches`, `aria-current` on the last crumb),
  `ProfileMenu`, `MobileNav` are client components.
- `ProfileMenu` is a **disclosure**, not an ARIA `menu`: ordinary links and a button in the normal tab order.
  Closes on Escape (focus back on the button), on an outside click, when Tab moves focus to another control,
  and on navigation. It deliberately does *not* close on a `blur` with no `relatedTarget`: Safari doesn't
  focus buttons on click, so that would close the panel before a click on Sign out landed.
- `MobileNav` — tab bar (`min-h-14` tabs, `aria-current="page"`) and the "More" sheet on a native modal
  `<dialog>`: the focus trap, Escape, an inert page behind it and focus returning to "More" come from the
  platform rather than hand-rolled code. A tap on the (transparent, full-screen) dialog outside the sheet
  closes it.
- "Not built yet" is honest: Settings and Users are visible, tagged *Soon* (with "coming soon" for screen
  readers), and **not links**. The artifact's search box and notification bell (with its hard-coded "3") are
  omitted — nothing sits behind them.

### 4. Pages
- `lib/auth/page-session.ts` — `requirePageSession()` (React `cache`d per request): redirect to `/login`
  without a session; `isAdmin` by the same rule as the API's `withAuth({ roles: [ADMIN] })`. **Every page
  calls it itself**: a layout is not re-rendered when someone navigates between the pages it wraps, so the
  layout only *displays* who is signed in — it is never the guard.
- **Overview**: totals (branches, people with a role, your role), the first six branches with member counts.
  Non-admins see their own memberships only. No fabricated numbers, no placeholder charts.
- **Branches**: server-rendered list with `_count` of memberships; `BranchesView` (client) with the "New
  branch" form. Every outcome of the API call has its own message — created (announced, listed, focus back
  on the button), blank (caught locally, nothing sent), duplicate (409), rejected (400), refused (403),
  session ended (401 → `/login`), server error, offline. Non-administrators get a clear "no access" page and
  **no branch data is fetched**.
- **Account**: name, email, and the branches/roles a person holds — read-only; change-password and MFA cards
  arrive with 0.5.C / 0.5.D.

### 5. Remember-me, ported
`createSession({ remember })` (default **false** at the function *and* the API), the 12-hour cap, the strict
boolean on `POST /api/v1/auth/login`, the checkbox on the sign-in form, and the tests — all as built and
mutation-checked in Octalve Edu (its phase record has the detail).

## Findings and decisions during the build

| # | Found by | What | Resolution |
| :-- | :-- | :-- | :-- |
| 1 | The first full run | **Copying Octalve's `session.ts` wholesale carried its cookie *name* into this repo** (`octalve.session-token`). The drift comparison hadn't caught it — it normalises product names on purpose. 58 tests failed at once, from the API suite (it looks the cookie up by AlEemaan's name) to the real-HTTPS run. On a live school it would have signed everyone out and split the cookie across two names. | Cookie names and the file's header comment restored; a raw diff of every wholesale-copied file was then read for other lost repo-specific text (none). Lesson recorded in `CLAUDE.md`: product-specific constants are *not* shared, and a normalised comparison can hide them. |
| 2 | Branches page tests | **After a rejected name the caret did not return to the field** — `focus()` was called while the input was still `disabled` (a request in flight), and focus on a disabled input silently does nothing. The same trap the sign-in form fell into in 0.5.1, reintroduced in new code. | The handler now *asks* (`setFocusRequests`) and an effect focuses after the re-render that re-enabled the input; a mutation (focus never applied) is caught by the duplicate-name and 400 tests. |
| 3 | The phone shell tests | On a phone the open account menu spans most of the width, so a "click elsewhere" test aimed at the heading hit the menu itself. | The test clicks the page's left edge, which the panel can't cover. |
| 4 | The More-sheet focus test | Assumed Tab wraps inside a modal dialog. Chromium instead hands focus to the browser's own UI past the last control (nothing in the page focused). | The assertion is what actually matters: focus **never lands on the page behind** the sheet (it may be in the sheet or nowhere). |
| 5 | Retargeting existing specs | `getByText("Administrator")` is now ambiguous (sidebar card, the "Your role" tile, the menu); a `Sign out` button is no longer in the header. | Scoped selectors; a shared `signOut(page)` helper (uses the account menu here, the header button in Octalve Edu). |
| 6 | Building the pages | A `<dl>` grouping icon + text in a `div` would not be valid definition-list content. | The stat tiles are a plain list. |
| 7 | Phone tap-target check | Inline text links ("Manage branches", "Back to overview") were 20 px tall — under this repo's ≥ 44 px rule. | `inline-flex min-h-11 items-center`. |

## Verification results

`pnpm test` (production build, then every project; `aleemaan_test`; Playwright, Chromium, Postgres 16, one
worker, no retries):

| Project | Tests |
| :-- | --: |
| `setup` | 1 |
| `unit` | 23 |
| `integration` | 46 |
| `api` | 103 |
| `e2e-desktop` | 92 + 10 skipped by design |
| `e2e-mobile` | 94 + 8 skipped by design |
| `https` | 8 |
| **Total** | **367 passed, 18 skipped, 0 failed** (7.0 min) |

Static: `tsc --noEmit` clean, ESLint 0 problems, `next build` clean (every route dynamic).
The first full run was 288 passed / 58 failed (finding 1 — the cookie name — accounted for most; findings
2–5 the rest); the second was 363 / 2 (one selector that the new shell made ambiguous); the third, after
fixing it and adding the in-app-navigation guard test, is the table above.

### Mutation testing — 20 injected bugs, 20 caught

Each row: one deliberate bug, the named specs run against a fresh build, the file restored (and re-checked).

| # | Bug injected | Failures |
| :-- | :-- | --: |
| S1 | `/branches` admin gate switched off (a teacher would see the list) | 1 |
| S2 | page session guard doesn't redirect when signed out | 6 |
| S3 | everyone sees the admin navigation | 1 |
| S4 | everyone is treated as an admin | 2 |
| S5 | `/branches` has no page-level guard of its own (only the layout's) — caught by the in-app-navigation test | 2 |
| S6 | account menu ignores Escape | 1 |
| S7 | account menu ignores outside clicks | 1 |
| S8 | the More sheet is not modal (`show()` instead of `showModal()`) | 1 |
| S9 | the More sheet ignores backdrop taps | 1 |
| S10 | the page doesn't reserve room for the tab bar | 1 |
| S11 | the sidebar doesn't mark the current page | 1 |
| S12 | the skip link goes nowhere | 1 |
| B1 | duplicate name (409) not recognised | 1 |
| B2 | blank names are sent to the server | 1 |
| B3 | no double-submit protection | 1 |
| B4 | focus not applied after a rejected name | 1 |
| B5 | "1 member" pluralised as "1 members" | 1 |
| R1 | the sign-in form never sends `remember` | 1 |
| R2 | the session cookie is always persistent | (API + integration) |
| R3 | the default flipped to "remembered" | (API + integration) |

The first pass was interrupted by an environment restart after S6 (it left one file mutated; restored,
verified, and S7 onward re-run). The remember-me logic itself was mutation-checked more exhaustively — nine
mutations — in Octalve Edu's record; the same tests run here.

## Screenshot review

Drove the real flow in Chromium against a production build and a fresh database — setup, sign-in (both
themes), Overview, Branches (list, the duplicate-name error, a branch just created), Account, the open account
menu, and on a phone the tab bar and the More sheet in both themes — at 1440×900 and 390×844, and read the
screenshots. It matches the artifact: green active-nav tint, "SOON" tags on Settings and Users, breadcrumb
`Admin / Overview`, the avatar menu with role in brand colour, floating tab bar with the current page tinted,
the More sheet with its dimmed backdrop. Real numbers throughout (4 branches, 1 person, "1 member" /
"No members yet"). No page errors beyond the deliberate 409. Nothing needed changing; the only thing that
looks odd in a *viewport* capture — the floating tab bar sitting over content mid-page — is by design (the
page reserves room at its end, and a test pins it).

## Cross-repo: Octalve Edu

Everything shared was built and verified there first (`claude/design-tokens-theme` on
`roji-tech/octalve-edu-fork`, its `phase-0.5.A-design-language.md`) and ported here. **Kept different on
purpose:** the brand (`brand.css`, `brand.ts`, `brand.spec.ts`), the cookie names, the app shell and the pages
inside it (Octalve Edu adopts the shell with its §0.5.2, when tenant routing gives it `/schools/[code]/…`),
`page-session.ts` (Octalve's will be tenant-aware), and the setup wizard's fields. Back-ported to Octalve Edu
from this work: `useSignOut()`, `Button`'s `ref`, the shell icons, the `signOut()` test helper, and the two
a11y-scan waits (CSS transitions, page title).

## Explicitly not done in this phase
Settings and Users pages (Phase 0.5.2 / 1.7 — shown as *Soon*); branch rename/delete/detail pages (no API
yet); search and notifications (nothing behind them); a "Forgot password?" link (0.5.C — a dead link would be
a lie); Arabic/RTL. **Still to come in this series:** 0.5.B nonce-based CSP, 0.5.C password reset / change,
0.5.D TOTP MFA.
