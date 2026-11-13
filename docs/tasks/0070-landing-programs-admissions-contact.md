# 0070: The landing page says what the school teaches, how to ask for a place and how to reach it

- **Period / Focus:** 2026-11-13 (public pages; the maintainer's word on 2026-11-13: "port" the old static marketing site's content into the landing page, "make sure they fit in to what we currently have", and "you can update them to fit in with what we currently have in the application")
- **Status:** Built; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude (the school supplies the facts the repository cannot know: section 5)
- **Target Branch / PR:** `claude/landing-school-content` / PR into `dev`; the one-line change to the shared component is mirrored in Octalve Edu's own PR (D2)
- **Started:** 2026-11-13

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

A visitor who opens `/` or `/ar` learns, besides the school's four branches, what the school teaches, what it stands for, how to ask about a place for a child, and how to reach the school (telephone, e-mail, address, website), and sees the school's motto. The words come from the old static page (`out/aleemanschool/index.html`), adapted to what the application is today; the school's own contact details and motto come from the school profile in Settings, so the person who runs the school types them once and the front page follows.

## 2. Context

- Task 0049 made the page about the school and decided (D1) to say only what the repository can vouch for, leaving admissions, contacts and the rest "for the school to supply" (its section 5). The maintainer has now supplied the source, the old marketing page, and asked for it to be adapted, not pasted.
- The old page contradicts itself and is out of date in places, so it cannot be copied as it stands: two different sets of telephone numbers and e-mail addresses (a contact section with `+234 801 234 5678`, `+234 802 345 6789` and `info@aleemanschool.edu.ng`; a footer with `+234 815 300 5393` and a Gmail address), two sets of office hours (8:00 to 16:00 and 7:00 to 16:30), "applications are now open for the 2025/2026 session", three testimonials from named people, four counters that start at 0, a newsletter box and four "quick access" links to pages that do not exist (curriculum, the principal's message, admission requirements, the academic calendar). It also writes the name "Aleeman" where the product says "AlEemaan", and mentions SS2, SS3 and JSS3, which the four branches do not use.
- What the application already has: four branches (Secondary and Primary, in English and in Arabic), the portal at `/portal`, the school profile in Settings (`SchoolSettings`: name, principal, phone, motto, address, email, website; edited by an administrator at `PATCH /api/v1/settings/school`), a landing page for English (`/`) and one for Arabic (`/ar`) with their own words (`brand.landing`, `landingAr`), a shared `LandingPage` component that is the same file as Octalve Edu's, and unit tests that pin the words (`landing-copy`, `landing-ar-copy`).

## 3. Decisions

- **D1. Adapt, do not paste: what is taken, what is changed, what is left out.**
  - *Taken, in the application's plain voice* (full sentences, no figure, no offer the product does not make): the three programs (science; science with Arabic and Islamic studies; Arabic and Islamic studies), the four things the school says it stands for (academic excellence, Islamic character, discipline and values, the whole child), the invitation to ask about a place. Each item is the old page's claim, shortened and with its adjectives ("modern", "most popular", "certified", "small class sizes", "daily Morning Adhkar and Salah", "annual inter-house sports") removed where the application cannot show them. "Preparation for the WAEC and NECO examinations" stays: the old page says it of the science program, and it says preparation, not certification.
  - *Changed:* the name is the product's ("AlEemaan"); "Apply Now" has nowhere to go (there is no application form), so it becomes "contact the school office" with the contact details beside it; "applications are open for 2025/2026" is not carried (a dated claim goes stale, and the page states no year); the programs are not mapped onto the four branches (the old page does not say which branch teaches which, so the page does not either).
  - *Left out, and why:* the two contradictory sets of telephone numbers, e-mails and office hours (the school's real ones go in Settings, D3); the three testimonials (quotes from named people the page cannot show consent for); the counters (the figures are not in the page's source, only `0`; and the page states no figure, task 0049); the newsletter box (nothing receives it); the four quick-access links (their pages do not exist); the SS and JSS class names.
- **D2. One optional `children` slot on the shared `LandingPage`, placed before the closing band; the same three lines in Octalve Edu's copy.** The two products' `LandingPage.tsx` must stay byte-identical (task 0049, D5), the component draws only title-and-text cards and has no place for a section that reads data. The slot is the whole change; it changes nothing when it is not given. AlEemaan's new sections are `SchoolInfo`, a server component of its own (`src/components/landing/SchoolInfo.tsx`), passed through the slot on both pages. The component's two existing optional sections (`howRun`, the cards) are not used for this: `landing-ar-copy` pins "no how it is run section", and the programs are not a software description.
- **D3. The contact details and the motto are read from the school profile, not written into the page.** The profile is the one place the school edits them, and it already holds the fields. A new read-only `getPublicContact()` (`src/lib/landing/contact.ts`) selects only `motto`, `phone`, `email`, `address` and `website` (never the principal or anything else), trims them and drops the empty ones. It is NOT `getSchoolSettings()`, which upserts: the landing page "sets nothing and writes nothing", and still does not. If the database cannot be read, or the profile has none of the fields, the page is drawn without them and does not fail. The motto goes into the hero's eyebrow (`Ibadan, Nigeria · "Second To None"`); the contact section is not drawn at all while the profile has no contact detail, so a school that has not filled the profile in shows no empty heading.
- **D4. Every value from the profile is escaped by React and is linked only when it is safe.** The e-mail is a `mailto:` link of the address as validated on save; the telephone is a `tel:` link of its digits and a leading plus only; the website is a link only when it is an `http:` or `https:` address (`isWebLink`, the helper of task 0065); anything else is shown as plain text and is never an `href`. The settings schema now refuses a website that is not an `http:` or `https:` address (it accepted `javascript:alert(1)`, which was then stored and would have been a link on a public page), with a test that fails on the old schema. Values are drawn with `dir="auto"`, because the motto and the address are in whatever language the school typed them in, also on the Arabic page.
- **D5. Both pages, same shape.** `brand.landing.about` and `landingAr.about` have the same shape (programs, values, contact heading and text and the four labels); the Arabic words are an AI's translation and carry the same warning as the rest of `landing-ar.ts` (a reader of Arabic must go through them; the note at the top of the file is extended to name them). The Arabic text has no Latin letter and no digit, and "WAEC and NECO" are written as the Arabic press writes them.
- **D6. The tests of the words are extended, not weakened.** `landing-copy` and `landing-ar-copy` hold the new texts to the same rules as the old (no sign-up, price, trial, demo or free plan; no figure; sentences end with a full stop; nothing about software; no doubled spaces or placeholders; Arabic only in Arabic) and pin the shape (three programs, four values, the same shape in both languages). A new unit spec holds `contact.ts` (trimming, dropping the empty, the safe links). The browser specs (`landing-screens`, `landing-ar-screens`) read the headings from the words, check the sections and the safe links with the profile filled and empty, and put the profile back as they found it.
- **D7. No migration, no new route, no new page.** `/` still decides in the same order (a signed-in person to `/dashboard`, an unfinished set-up to `/setup`, everyone else the page).

### 3a. Each claim and what it rests on

| On the page | Rests on |
| --- | --- |
| The three programs and their subjects (Physics, Chemistry, Biology, Mathematics, Computer Science; the Qur'an, Hadith, the Arabic language, Islamic jurisprudence; WAEC and NECO preparation; practical laboratory work; Qur'an memorisation) | The school's own page (`out/aleemanschool/index.html`, "Our Programs"), taken at the maintainer's word of 2026-11-13. The repository cannot show them; the maintainer may strike any. |
| The four things the school stands for | The same page ("Why Aleeman School"), shortened. |
| The motto, the telephone, the e-mail, the address, the website | The school profile in Settings, as typed by the school. Nothing is written into the page. |
| "To ask about a place for your child, contact the school office" | There is no application form in the application; the contact details are the way. |

## 4. Work breakdown

- [x] Design (this file), written before the code.
- [x] `getPublicContact()` and the safe links (`src/lib/landing/contact.ts`) with a unit spec.
- [x] `LandingPage` gets the `children` slot (and Octalve Edu's copy, byte-identical).
- [x] `SchoolInfo`, `brand.landing.about`, `landingAr.about`, the eyebrow with the motto on both pages.
- [x] The settings schema refuses a website that is not `http:` or `https:` (a test that fails on the old schema).
- [x] The unit specs of the words and the browser specs updated; the specs that count headings read them from the words.
- [x] Docs: `docs/pages/public.md`, the components catalogue, the tracker, HANDOVER (the maintainer fills in the profile), the README of the public pages if it names the sections.
- [ ] Mutation check deferred to the end of PHASE 2 (the maintainer's call, said in the build record).

## 5. Not in this task

- The facts only the school has: its real telephone numbers, e-mail addresses, address, office hours, and whether every program claim is true (the maintainer's "port" is taken as the school's own claim; the table in 3a lists them so any can be struck).
- An application form for admissions, an admissions page, a calendar, a principal's message page, testimonials, counters, a newsletter: each would be a feature with its own data and its own task.
- A second-language field for the motto and the address in the profile (the profile has one of each).

## 6. Build record and tests

**What exists.** `src/lib/landing/contact.ts` (`getPublicContact()`, a read-only `findUnique` of the five public fields; `toPublicContact`, `mailtoHref`, `telHref`, `websiteHref`, `eyebrowWithMotto`); `src/components/landing/SchoolInfo.tsx` (programs, values, and the contact section while the profile has a contact detail); `brand.landing.about` and `landingAr.about`; the `children` slot of the shared `LandingPage` (byte-identical copy in Octalve Edu, its task 0061); the eyebrow with the motto on `/` and `/ar`; `schoolSettingsUpdateSchema.website` refuses anything but `http:` and `https:` (the old rule, evaluated alone, accepted `javascript:alert(1)`, `data:text/html,<b>x</b>` and `ftp://school.example/files`: shown with `node -e` before the change). No migration, no route.

**Gates (order tsc, lint, build, tests).** tsc clean (apart from `LayoutProps`, a type that `next build` generates and a fresh worktree lacks before its first build); eslint clean on every changed file; `pnpm build` OK; Prettier clean on every changed file (checked against `HEAD` first, so no file that was already unformatted was rewritten); catalogues checked with `verify_catalogs.py` (745 files, 745 rows, none missing).

**Tests, run on the built tree (setup, unit, API, browser on desktop and on a phone).**
- First run, 11 spec files (`landing-copy`, `landing-ar-copy`, `landing-contact`, `school-settings-and-academics`, `landing-router`, `landing-screens`, `landing-ar-screens`, `auth-logo`, `sign-in`, `brand`, `csp`): **200 passed, 5 failed, 6 skipped.** The 5 failures were old assertions that pinned the page's shape by COUNTING: `landing-router` ("three h2 elements") and, on the desktop and on the phone, `landing-screens` and `landing-ar-screens` ("four regions"). The new sections change those counts on purpose, so they were rewritten to NAME the sections (the h2 texts in order; six regions with no contact detail in the profile), not loosened. Every new test passed on this first run: the programs and values lists, the profile reaching the motto and the contact section with each value a safe link, an unsafe website shown as text and never an `href`, no contact section while the profile is empty, the Arabic page with the telephone left to right, and Axe plus horizontal overflow in both themes with the profile filled in on both pages.
- Second run, the three corrected specs on the same build: **79 passed, 0 failed, 1 skipped** (the skip is a `test.skip(isMobile ...)` line already in the spec).
- Unfixed-code runs: the unit specs of `contact.ts` could not run before it existed. The settings test is shown on the old rule (above). The browser tests for the new sections had nothing to fail on before the sections existed.

**Not run.** The whole unit, integration and API suites and the whole browser suite (only the specs that touch the landing pages, the settings API, sign-in, the logo, the brand panel and the policy ran); the HTTPS project; mutation passes (deferred to the end of PHASE 2, the maintainer's call); a screen reader or a real phone; the Arabic read by someone who reads Arabic; the programs' claims read by someone from the school.

**Decisions made while building (beyond D1 to D7).** The motto goes into the hero's small line and not into a section of its own, so it sits where a school puts it and the shared component needed nothing more. The contact section is one section (admissions sentence and details together), because a sentence about contacting the school with no contact details beside it would send the visitor nowhere. The contact values have no fallback written in the code: a school that has not filled in its profile shows none, which is the honest state. The old page's `Learn more` buttons are not carried (nothing to link to).

**Left for the school.** Its real telephone numbers, e-mail addresses, address, motto and website, typed into Settings; whether each program claim is true (section 3a); an Arabic reader's check of the new Arabic lines.
