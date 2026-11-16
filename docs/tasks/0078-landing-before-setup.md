# 0078: The landing page is shown at `/` and `/ar` even before first-run setup is finished

- **Period / Focus:** 2026-11-16 (the maintainer, on the new production site: "why can't I access landing page? https://aleemanschool.com ... can we exclude /")
- **Status:** Done (design first, then built; the record is section 6)
- **Priority:** Low to medium (a public address that redirects every visitor to an administrator's wizard until one person has run it)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/landing-before-setup` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`/` and `/ar` draw the landing page for a signed-out visitor **whatever the state of first-run setup**. Until now an instance whose setup was not finished sent every visitor of `/` and `/ar` to `/setup` (tasks 0048 and 0050), so a freshly deployed site showed no public page at all until its first administrator existed.

## 2. What changes, and what does not

- **Changes:** `leaveUnlessVisitor()` in `src/lib/landing/start.ts` keeps one job: a signed-in person goes to their dashboard. It no longer asks whether setup is finished. It is read by two pages only, `/` and `/ar`.
- **Does not change:** `/login` still sends a visitor to `/setup` while setup is not finished (so the landing page's way in still leads to the wizard on a new instance); `/setup` still refuses once setup is complete; `/api/v1/setup`; who can finish setup (the token). Nothing is written by the landing page.
- **Why it is safe:** the landing page already draws without the school profile when the database cannot be read, and an empty profile on a new instance shows the brand's own words. It shows no administrator information and reads nothing a visitor may not see.

## 3. Decisions

- **D1. Reverse the old rule in the one place that held it**, rather than add an exclusion list: a start page that must also be a router for setup was the reason for the redirect ("a fresh deployer need not know the `/setup` address"); the way in (`/login`) still does that job.
- **D2. The two API tests that pinned the old rule (`landing-router.spec.ts`, one for `/`, one for `/ar`) are rewritten**, not deleted: they now assert a 200 landing page with no `Location` while setup is unfinished and still after it is finished. A control keeps the sentence "`/login` still goes to the wizard".
- **D3. Not in this task:** a visible hint on the landing page that the instance is not set up yet (a deployer is expected to know the `/setup` address and the token); the Octalve equivalent (a different product, not asked).

## 4. Work breakdown

- [x] Design (this file).
- [x] `tests/api/landing-router.spec.ts`: the two "setup not finished" tests now expect the landing page (200, no `Location`, the page's headline); a control that `/login` is still sent to `/setup`. Failing first on the unfixed build.
- [x] `src/lib/landing/start.ts`, and the comments in `src/app/page.tsx` and `src/app/ar/page.tsx`.
- [x] Tracker TASK-0078, HANDOVER, the walkthrough row's wording if it says setup-first.
- [x] Gates in the order tsc, lint, build, tests; Prettier `--check` on the changed files.

## 5. Build record and tests

**Build record (2026-11-16, worktree `AlEemaan-cloudinary`, off `origin/dev` `93f6784`; local Postgres, throwaway `aleemaan_landing0078_test` database; a production build of exactly the tree tested).**

- Gates in order: `tsc --noEmit` clean; `eslint` on the three changed source and test files clean; `pnpm build` exit 0; Prettier `--check` clean (`start.ts` and `page.tsx` were clean at `HEAD`, so `--write` touched only my lines); the catalogue verifier 747 rows, 0 missing.
- **Failing first**, `tests/api/landing-router.spec.ts` on the unfixed build (`src` as on `dev`): **2 failed, 15 passed**. The two are the rewritten tests for `/` and `/ar` with setup unfinished: each read `Expected: 200, Received: 307` (the old redirect to `/setup`). The 15 that passed include the control that `/login` still goes to the wizard, true before and after.
- **The fixed build:** the API spec plus the two landing browser specs (`landing-screens`, `landing-ar-screens`), desktop and phone: **80 passed, 0 failed, 1 skipped** (a spec's own viewport condition; not looked at one by one).

**Not run, and not claimed:** the other projects and specs (`integration`, `https`, the rest of `api` and the browser suites), the browser landing specs against an **unfinished** instance (they use a finished one; the API spec covers the unfinished one over real HTTP), the walkthrough, mutation passes (deferred to the end of PHASE 2). **No migration, no environment change.**
