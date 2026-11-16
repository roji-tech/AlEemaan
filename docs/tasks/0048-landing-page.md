# 0048: The landing page — what a signed-out visitor sees at `/`

- **Period / Focus:** 2026-11-10 (public pages; the `/` row of `docs/pages/public.md` said "A pure router that never renders UI"; the same task as Octalve Edu's 0041)
- **Status:** Built; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude
- **Target Branch / PR:** `claude/landing-page` / PR into `dev`
- **Started:** 2026-11-10

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A person who opens AlEemaan's address and is not signed in sees a real page that says what the product is, what it covers, who it is for and how to get in, instead of being thrown at a sign-in form. A signed-in person still lands on their dashboard and an instance whose first-run setup is not finished still lands on its wizard. This closes the open point of task 0047 ("a real landing page at `/` is a product decision, not built").

## 2. Context

- `src/app/page.tsx` is a pure router: signed in goes to `/dashboard`; setup not finished to `/setup`; everyone else to `/login`. It renders nothing.
- Every signed-out screen (`AuthShell`) has the logo linking to `/`, "the start page" (task 0047). Today that is the sign-in page by way of the redirect. Two specs pin the redirect: `sign-in.spec.ts` (a signed-out visitor at `/`) and `auth-logo.spec.ts` (the logo from another signed-out screen). `setup-handoff.spec.ts` (`/` to `/setup`) stays true, and so does the walkthrough, which opens `/` on an empty instance and lands on the wizard.
- Octalve Edu built the same page as its task 0041 and moved the extra links into the brand file as its task 0042, so that `LandingPage.tsx` is **code-identical** in both products (the repositories' rule: every product-specific word is in `src/lib/brand.ts`). This task copies the component as it is and writes AlEemaan's own words.
- AlEemaan has no `/verify` page without a code (its check is `/verify/[token]`), so the page's extra link is the parent and pupil portal, `/portal`, which anyone may open.
- The shared UI here lacked two icons the component draws (a printer and a receipt); they are copied from Octalve's `icons.tsx`, which this repository's file is a copy of.

## 3. Decisions

- **D1. The order of the router does not change; only its last line does.** Signed in: `/dashboard`. Setup not finished (`isSetupComplete()` is `false`): `/setup`. Otherwise (a signed-out person, or a setup state that could not be read, which has never redirected to `/setup`): the landing page, not `/login`. Still `force-dynamic`; sets nothing.
- **D2. Only what is built here.** Octalve's page speaks of PDF report cards, remarks, the payment gate and mark import: AlEemaan has none of them, and the copy says none of them. Every sentence names something this product does today, and section 3a lists each claim with the screen it rests on. No sign-up, price, trial, testimonial or figure (the headline's "four branches" is the product's own line from the sign-in panel, a word, and the page uses that same headline).
- **D3. The words are `brand.landing`, the page is the shared component.** There is no `howRun` (this is one school's own product: how it is installed is not the visitor's business), so the "managed or on your own server" section is not drawn. The extra link is `brand.landing.links`: "Parent and pupil portal", `/portal`.
- **D4. What is on the page.** The same as Octalve's: a header (name, theme switch, "Sign in"); the hero ("Sign in" and the portal link); "What it covers" (six items); "Made for the people in a school" (four roles); a closing band in the deep brand colour with "Sign in"; a footer with the two links and the copyright. No image, script, font or storage of its own.
- **D5. Accessible and responsive by construction, and tested** (as Octalve's D6): one `h1`, landmarks, headings in order, focus rings, works without JavaScript, Axe (WCAG 2.2 A/AA) in both themes, no sideways scrolling at 320 px even with larger text, and the text on the deep band (over a patterned background, which Axe cannot judge) measured at 4.5:1 or better.
- **D6. The logo keeps pointing at `/`.** On a signed-out screen it now takes a visitor to the landing page, whose "Sign in" is one press away. `AuthShell`'s comment says so.
- **D7. Tests that pinned the redirect say what is true now.** `sign-in.spec.ts` and `auth-logo.spec.ts`. The test helper that flips the theme and waits for the colour transitions (`tests/support/theme.ts`, from Octalve Edu's task 0034) is copied here and used by the new screens spec only, so that the spec is the same file in both products. AlEemaan's other specs do not need it: its `page` fixture already emulates reduced motion (the flake fix of PR #158), so colours do not fade during a test here.
- **D8. Title and description.** The tab says "AlEemaan: school management" (absolute, since the root template would repeat the name). The page is open to search engines.

### 3a. Each claim and what it rests on

| On the page | Built in |
| --- | --- |
| The pupils of each branch, with search and a spreadsheet import; the staff who work there with their roles | `/students` (search, register, edit, archive, CSV import), `/academics` (staff) |
| A daily roll for every class, taken by its teacher; the permissions to take it managed by the branch's administrator | `/attendance` (the "Manage Permissions" dialog, administrators) |
| Teachers enter marks, administrators review them, results are published to pupils and parents | `/results` (entering, review and publishing tabs), the portal's results tab |
| Report cards for every pupil; a public page that checks a mark against the school's own record | `/results` (reading report cards), `/verify/[token]` |
| Fee invoices for each branch, part payments when the school allows them | `/finance` (task 0046, Payment Rules) |
| Promote, repeat or graduate a class at the end of the session | `/academics` (the promotion decisions `PROMOTED`, `REPEATED`, `GRADUATED`, `WITHDRAWN`) |
| One account sees every branch and sets the branches up | The superadmin and `/branches` |
| Branch administrators run their branch: classes, staff, fees, approvals | `/academics`, `/finance`, `/approvals` (administrators) |
| Teachers take the roll and enter marks for their own classes | `/attendance`, `/results` |
| Pupils and parents use the portal to read results, fees and learning | `/portal` (overview, results, finance and learning tabs) |

## 4. Work breakdown

- [x] Design (this file).
- [x] `brand.landing` (the words); `LandingPage` (copied from Octalve, identical); the two icons; `page.tsx` renders the page for a signed-out visitor; metadata.
- [x] `AuthShell` comment; `docs/pages/public.md`, catalogues, tracker, HANDOVER, CLAUDE.md banner.
- [x] Tests: unit (the words and the links), API (what `/` answers), screens (desktop and phone), the two specs that pinned the redirect, the theme helper, mutation check, regression.

## 5. Not in this task

- A sign-up page or a "request a demo" form (there is none to link to).
- Pricing, screenshots, a features page, translations (an Arabic version of the page is a product decision).
- Octalve's PDF report cards, remarks, payment gate and mark import, which this product does not have.
- Changing `/login`, `/setup` or what they redirect to.

## 6. Build record and tests (2026-11-10)

**What changed.** No migration, no API, no data. `src/app/page.tsx` renders the landing page for a signed-out visitor instead of redirecting to `/login` (signed in to `/dashboard` and setup not finished to `/setup` are untouched and still come first); it has its own absolute tab title and description and is open to search engines. New: `src/components/landing/LandingPage.tsx` (copied from Octalve Edu's and checked byte for byte identical to it) and `brand.landing` in `src/lib/brand.ts` (AlEemaan's own words, no `howRun`, the extra link `/portal`). `src/components/ui/icons.tsx` gains `PrinterIcon` and `ReceiptIcon` (copied from Octalve's file). `tests/support/theme.ts` (Octalve's test-only theme-flip helper) is copied in and used by the new screens spec. `AuthShell`'s comment now says the logo leads to the landing page. Docs: the `/` row, the catalogues (the icon count was stale at 36; it is 41), the tracker.

**Deployment.** Nothing to run: no migration, no setting.

**Gates (order tsc, lint, build, tests).** `tsc` clean except one error that exists on a fresh checkout before a build and is not from this task (`LayoutProps`, a type Next writes during `next build`; it is gone after the build); eslint 0 errors on every changed file; `pnpm build` OK (`/` stays dynamic); Prettier clean on every file changed; catalogues in sync.

**Tests (fixed ports, one run at a time, the production build).**
- Unit `landing-copy` (new): no sign-up, price, trial, demo or free plan in the words (which caught my own first draft: it said "a register of the pupils", which is a pupil register and not a sign-up, so the sentence was reworded); no digit; every text trimmed, non-empty, a sentence; six things it covers each with its own icon and title; four kinds of people; the links are paths on this site, never `/login`, no offer of a sign-up; title and description lengths; the headline is the sign-in panel's.
- API `landing-router` (new, over real HTTP with no cookie jar): signed out `/` is a 200 page with its one `h1`, not a redirect, no cookie, no session written; the only links are `/login` and `/portal` and both answer 200; there is no "how it is run" section; the tab title and description are the page's own and there is no `noindex`; forged or empty session cookies are a signed-out visitor; a signed-in person is redirected to `/dashboard`; an instance whose setup is not finished is redirected to `/setup` and a finished one gets the page.
- Screens `landing-screens` (11 tests, desktop and phone, new): the title, one `h1`, the headings in order and the header, main and footer landmarks; the list items and their words and no extra section (four regions: the hero, what it covers, the people, the closing band); the way in and the portal each lead to a page that works; "Sign in" four times and the portal link twice, to the right addresses; the theme switch and its cookie; the keyboard goes through the controls in order and each shows a focus ring of at least 2 px; Axe (WCAG 2.2 A/AA) and horizontal overflow in both themes at the default width, at 320 px and at 320 px with larger text; the text on the deep brand band measured at 4.5:1 or better; the page and its links work with JavaScript off; a signed-in person never sees it and `/dashboard` still sends a signed-out visitor to `/login`.
- Changed: `sign-in.spec` and `auth-logo.spec`, which pinned the redirect. `setup-handoff.spec` (`/` to `/setup`) is unchanged and passed; the walkthrough, which opens `/` on an empty instance and lands on the wizard, is unaffected.
- **Mutation check, in three rounds.** *Round 1*, nine rules broken together in one build: a signed-in person not routed to the dashboard; setup not routed to the wizard; a dead sign-in link in the hero; no `main` landmark; a skipped heading level; the portal link gone from the footer; copy that offers "sign up free"; `noindex`; the page's description taken from the wrong place. 19 tests failed. Five rules have a test that failed for it alone (signed in, the wizard, the dead link, the footer link, the copy). Two pairs share one test, so the first is known only from the shared failure: the missing `main` landmark and the skipped heading level (one landmarks-and-headings test) and `noindex` and the description (one tab-and-description test). *Round 2*, five other rules broken together: the missing `main`, the wrong description, low contrast on the closing text, no focus ring, a fixed width that overflows a phone. 13 tests failed, and each of the five has its own test (the landmarks test, the description test, the measured contrast test, the keyboard test, and the overflow check at 320 px, read from the failure messages); the skipped heading level and `noindex` stay known only from round 1's shared tests. *Round 3*: only the old redirect to `/login` restored: 21 tests failed (API, screens, the logo spec). The sources were restored from copies made beforehand, checked identical file by file, and rebuilt.
- **Regression** on the final build: the whole `unit` and `api` projects and the related screens (`landing-screens`, `auth-logo`, `sign-in`, `setup-handoff`, `brand`, `responsive-and-a11y`, `shell`, `account-self-service`, `password-reset`, `accept-invite`): **2,702 passed, 1 failed, 46 skipped** (the skips are the existing project-scoped tests: the shell's phone tests on the desktop project and its desktop tests on the phone project, two sign-in keyboard tests, the logo panel's decorative test, two brand tests and the More sheet's phone test; none is in a spec of this task). The one failure was `responsive-and-a11y` "/accept-invite" on the phone project: a browser timeout inside Axe's `newPage` ("Test timeout of 120000ms exceeded", reported as 11.1 minutes for a 120-second limit), on a screen that this task changed only by a comment. It passed three times out of three when run again on the same build, so I read it as a stalled browser, not a defect; I did not find a cause beyond that.
- **What the work found.** Octalve's keyboard test read the outline width in the instant of the key press and failed here: AlEemaan's test fixture emulates reduced motion, and under it the stylesheet makes every property "transition" over 0.01 ms, so a read that early saw the width from before the ring. The test now waits for the element's running transitions to settle (Octalve's fixture does not emulate reduced motion, so the race cannot occur there; the wait keeps the file identical in both products). A region count in my screens spec assumed three regions where the hero makes a fourth.
- **Not run:** the HTTPS project; the rest of the browser suite (45 of the 55 browser specs were not part of this run: ten were, the new one among them); a real screen reader and a real phone; the walkthrough; anything against a hosted database.

**Left for the maintainer.** The words are a product decision: every claim is in section 3a with the screen it rests on, and nothing on the page promises what the product does not do (no PDF report cards, remarks, payment gate or mark import, which only Octalve has). The headline is the product's own line from the sign-in panel ("One school, four branches, one login"). There is no Arabic version of the page. `/video-guide` is not linked because it depends on its media files.
