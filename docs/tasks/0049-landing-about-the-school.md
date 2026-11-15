# 0049: The landing page talks about the school, not about the software

- **Period / Focus:** 2026-11-11 (public pages; a correction to task 0048 asked for by the maintainer: "the landing page is supposed to be talking about the school")
- **Status:** Built; PR into `dev`
- **Priority:** Medium
- **Assignee:** Claude (the school supplies what the repository cannot know: section 5)
- **Target Branch / PR:** `claude/school-landing` / PR into `dev`
- **Started:** 2026-11-11

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Someone who opens AlEemaan's address and is not signed in reads about the school: where it is, what its four branches are, and how a parent, a pupil or a member of staff gets in. Task 0048 copied the page Octalve Edu sells its software with ("What it covers", "Made for the people in a school"); this product is one school's own, so its front page is the school's. The words change; the shared component stays the one Octalve Edu has, used through the props of Octalve's task 0044.

## 2. Context

- `brand.landing` (task 0048) says: "School management", "One school, four branches, one login.", six software features (pupils and staff, attendance, marks, report cards, fees, the end of the year), four kinds of people, "Already part of AlEemaan?". It describes the product.
- The repository records these facts about the school: it is Aleeman School in Ibadan, Nigeria (`README.md`, `CLAUDE.md`); it has four branches, named `Secondary (English)`, `Primary (English)`, `Secondary (Arabic)` and `Primary (Arabic)` (`src/app/api/v1/setup/route.ts`, `docs/development-history/phases/phase-0.5.0-setup-wizard.md`); parents and pupils have a portal at `/portal` (overview with attendance, results, fees, learning) and staff have the dashboard. It records nothing about admissions, fees, an address, a telephone number, history, ethos, term dates or pictures.
- The two products' `LandingPage.tsx` must stay byte-identical. Octalve's task 0044 gave it optional props and made a card's icon optional (a branch is not a software feature, and has no icon in the set).
- The sign-in panel's headline (`brand.login.headline`, "One school, four branches, one login.") is about signing in and stays as it is. Task 0048's unit test pinned the landing headline to it; that pin is replaced (D6).

## 3. Decisions

- **D1. Only what the repository can vouch for.** Every sentence on the page rests on a line of section 3a. Nothing about admissions, fees, results, an address, a telephone number, a history, an ethos, a number of pupils or a year founded is written, because none of it is in the repository: the school supplies it (section 5) and each addition is one more entry in `brand.landing`.
- **D2. The page, in order.**
  - Header: the name, the theme button, "Sign in".
  - Hero: eyebrow "Ibadan, Nigeria"; headline "Secondary and primary education, in English and in Arabic."; a lead that says there are four branches and who signs in here; "Sign in" and the portal link.
  - "Our branches": four cards, in the order the school lists them, each titled with the branch's name and one plain sentence, no icon.
  - "For families and staff": parents and guardians, pupils, teachers, branch administrators and the school's head, each with what they do after signing in.
  - Closing band: "Part of the AlEemaan community?" with "Sign in".
  - Footer: the rights line, "Sign in" and the portal.
- **D3. No `howRun`**, as before (how the product is installed is not the visitor's business). The six software-feature cards and the "Made for the people in a school" section are gone from this product's page.
- **D4. The title and description name the school:** tab "AlEemaan School, Ibadan"; description "AlEemaan School in Ibadan, Nigeria, has four branches: secondary and primary, in English and in Arabic."
- **D5. The component is Octalve's, copied, byte-identical** (`cmp`). It is called with no props: this page is in English.
- **D6. The unit test of the words is updated, not weakened.** Kept: no sign-up, price, trial or demo; no figure (the number of branches is a word); sentences end with a full stop; the title and description's length; the links are paths on this site. Changed: "six things it covers, four kinds of people" becomes "the school's four branches, named as the setup wizard seeds them, each once" and "four kinds of people"; the headline is no longer pinned to the sign-in panel's.
- **D7. The browser spec of task 0048 counts from the words** (`landing.covers.length`, `landing.people.length`) instead of the literals six and four, and a new check says the page speaks of the school: each branch's name is on the page, and none of the six software-feature titles is.
- **D8. Nothing else changes:** `/` still decides in the same order (signed in to `/dashboard`, setup not finished to `/setup`, everyone else the page), the logo still points at `/`, no migration, no new route.
- **D9. Four cards sit two by two.** With the shared component's three-column grid the fourth branch card sat alone on a second row (found when the page was photographed). Octalve's task 0044 follow-up (PR #114) makes the grid follow the number of cards: four go two by two, six stay three by three; the component here is that version. The browser spec measures it (two columns and two rows on a wide screen; one column and four rows on a phone).

### 3a. Each claim and what it rests on

| On the page | Rests on |
| --- | --- |
| AlEemaan School, Ibadan, Nigeria | `README.md` and `CLAUDE.md` ("Aleeman School, Ibadan, Nigeria"). The spelling differs ("Aleeman" there, "AlEemaan" in the product's name): the page uses the product's name, and the school confirms the spelling (section 5). |
| Four branches: Secondary (English), Primary (English), Secondary (Arabic), Primary (Arabic) | The names the setup wizard seeds (`INITIAL_BRANCHES`). |
| "in English" and "in Arabic" | The branch names. That the branch is taught in that language is read from the name; the school confirms (section 5). |
| Parents read their children's results, see fees and payments and follow attendance in the portal | `/portal` (overview with attendance, results and finance tabs). |
| Pupils read published results and learning materials in the portal | `/portal` (results and learning tabs). |
| Teachers take the roll and enter marks for their own classes | `/attendance`, `/results` (task 0048's claim). |
| Branch administrators run a branch; the school's head sees every branch from one account | `/academics`, `/finance`, `/approvals`; the superadmin (task 0048's claims). |

## 4. Work breakdown

- [x] Design (this file).
- [x] `LandingPage.tsx` and `ThemeToggle.tsx` copied from Octalve's task 0044 (`cmp`); `brand.landing` rewritten.
- [x] The unit test of the words (D6) and the browser spec (D7); the API and screen specs of task 0048 pass.
- [x] Docs: `docs/pages/public.md` and the components catalogue, tracker, HANDOVER, CLAUDE.md banner, and the open points.
- [x] Mutation check; regression.

## 5. Not in this task

- Anything the repository does not know, which the school must supply before it can be said: admissions and how to apply; a contact address, telephone and email; the school's history and ethos; term dates; fees (not as figures: a landing page states no figure); photographs; the legal owner's name for the footer; the spelling of the school's name; whether each branch is taught in the language its name gives.
- An Arabic version (task 0050).
- A language chooser.

## 6. Build record and tests

**What exists.** `brand.landing` (`src/lib/brand.ts`) is about the school: title "AlEemaan School, Ibadan"; eyebrow "Ibadan, Nigeria"; headline "Secondary and primary education, in English and in Arabic."; a lead; "Our branches" with the four branch cards (no icon); "For families and staff" with four kinds of people; the closing "Part of the AlEemaan community?"; the portal link. `LandingPage.tsx` and `ThemeToggle.tsx` are Octalve Edu's after its tasks 0044 (props, optional icon; PR #113, `7bf1442`) and its D7 (the grid; PR #114, `15fafc3`), copied and checked byte-identical with `cmp` against Octalve's `origin/dev`. No migration, no route, no change to what `/` decides.

**Gates (order tsc, lint, build, tests).** tsc clean (apart from `LayoutProps`, a type that `next build` generates and a fresh worktree lacks before its first build); eslint clean on every changed file; `pnpm build` OK; Prettier clean; catalogues checked with `verify_catalogs.py` (729 files, 729 rows, none missing, extra, duplicate or broken).

**Tests.** Unit `landing-copy` updated (the four branches named as the setup wizard seeds them, in order; four kinds of people; the page speaks of the school and not of software: the town is named, and no sentence says software, platform, system, product, management or feature; the headline is no longer pinned to the sign-in panel's). Browser `landing-screens` updated (counts come from the words) with two new tests: the page is about the school (the town and the four branches are on it, none of task 0048's six feature titles or "What it covers" is, and no branch card has an icon) and the four cards sit two by two (D9).

**First run (clean build, the unmutated tree): 127 passed, 0 failed, 5 skipped** over unit `landing-copy`, API `landing-router`, browser (desktop and phone) `landing-screens`, `auth-logo`, `sign-in`, `brand` and `csp`. The 5 skips are all `test.skip(isMobile / !isMobile ...)` lines already in the specs (the brand panel, the logo panel and the keyboard order are desktop concerns; the compact brand header is a phone one).

**Mutation check (three rounds, each on its own build; `brand.ts` restored from a saved copy and checked identical with `cmp`; the failing tests were read one by one).**
- Round 1 (eyebrow changed to "School management"; the second and third branches swapped; an icon given to the fourth card): 4 failed of 34. The swap fails only the unit test of the four branches (expected order differs). The eyebrow fails the unit "page speaks of the school" test (expected "Ibadan, Nigeria", received "School management") and the browser test of the same name at its first assertion ("Ibadan, Nigeria" not found in `main`). **The icon was NOT proven in this round**: that browser test stopped at the eyebrow assertion before it reached the card-icon assertion.
- Round 2 (the headline changed to "School management software for AlEemaan."; the fourth branch removed): 4 failed of 34. The headline fails the unit "page speaks of the school" test at "the copy must not mention software". The missing branch fails the unit test of the four branches (one fewer) and the browser test (the heading "Primary (Arabic)" not found).
- Round 3 (the icon alone): 2 failed of 34, the browser test of the school page on desktop and phone, at "getByRole('region', { name: 'Our branches' }).locator('svg')" (expected 0, received 1). So the icon assertion is proven, by this round alone.
- The D9 test (two by two) was mutated after the other rounds: the grid rule of the shared component changed back to three by three for four cards (one build, restored from a saved copy and checked identical with `cmp` to Octalve's `origin/dev`): exactly one test fails, the two-by-two browser test on the desktop project (the phone project passes it, as it should: one column there); 26 passed.

**Final regression (clean build of the unmutated tree):** **the whole unit and API projects (the setup project runs with them): 2395 passed, 0 failed (1.6 hours); then the browser specs `landing-screens`, `auth-logo`, `sign-in`, `brand` and `csp` on desktop and phone: 112 passed, 0 failed, 5 skipped** (the same five `test.skip(isMobile ...)` lines as in the first run).

**Not run.** The HTTPS project; the whole browser suite (only the specs that touch the landing page, sign-in, the logo, the brand panel and the CSP ran); a screen reader or a real phone; the words read by someone from the school.

**Decisions made while building (beyond D1 to D9).** The branch cards say "in English" and "in Arabic" because the branch names do; the school confirms. The spelling is the product's ("AlEemaan"): the repository's README says "Aleeman School". The closing text says staff "open their dashboard" because that is what a staff sign-in opens, so "dashboard" is not one of the words the test forbids.

**Left for the school.** Everything in section 5: admissions, contacts, history, ethos, term dates, photographs, the legal owner for the footer, the spelling of the name, the language of each branch.
