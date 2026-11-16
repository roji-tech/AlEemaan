# 0082: The app's favicon and icons are the school's logo

- **Period / Focus:** 2026-11-16 (the maintainer: "please update Aleemaan favicon")
- **Status:** Built (the record is section 4)
- **Priority:** Low (what a browser tab, a phone's home screen and a bookmark show)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/school-favicon` / PR into `dev`
- **Started:** 2026-11-16

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`/favicon.ico` (the tab), `/icon` (512 px, the web manifest's icon) and `/apple-icon` (180 px, the iOS home-screen icon) show the school's logo instead of a white "A" on navy.

## 2. Decisions

- **D1. Which picture: the school's logo** (`public/school-site/aleeman-logo.png`, the one on the school website and in the old site's tab). The request did not name a picture; the logo is the only mark the school has, and the old school site already used it as its favicon. If a different mark was meant, only the three files below change.
- **D2. A white tile.** The logo is green with a transparent background, which disappears on a dark browser tab; each icon puts it on white (rounded for `/icon` and the `.ico`; square for `/apple-icon`, because iOS rounds the corners itself, with the logo inside the middle 80 %, the "maskable" safe zone the manifest declares for it).
- **D3. The generated routes stay generated.** `src/app/icon.tsx` and `apple-icon.tsx` still use `ImageResponse`, so `/icon` and `/apple-icon` (named in `manifest.ts`) keep their addresses; the logo is an embedded 9 kB picture (`src/lib/brand-icon.ts`: the logo cropped to its drawing, 420 px wide, 48 colours) so they need no file read or network at build or run time. Static `icon.png` files would have changed the addresses Next serves and the manifest's `src`.
- **D4. `favicon.ico` is a file** with four pictures (16, 32, 48 and 256 px) made from the same logo with Pillow (one-off; the logo file is the source).
- **D5. Not changed:** the manifest's `theme_color` (`#0f172a`, the application's dark colour), the names, the sizes and the addresses.
- **D6. The logo is wide (549 x 354), so a square tile has white above and below it** and the logo is small at 16 px. A mark designed for a square (a monogram) would read better in a tab; that is for the school to decide.

## 3. Work breakdown

- [x] Design (this file).
- [x] `tests/e2e/app-icons.spec.ts` (6 tests): the browser decodes each picture and counts green and navy pixels; failing first on dev's icons.
- [x] `src/app/favicon.ico`, `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `src/lib/brand-icon.ts`.
- [x] Docs: `docs/pages/public.md`, `docs/functions/shared.md`, tracker TASK-0082.

## 4. Build record and tests

**Build record (2026-11-16, worktree `AlEemaan-favicon`, off `origin/dev` `a0a5381`, a production build of exactly the tree tested, database `aleemaan_favicon_test`).**

- Gates: `tsc --noEmit` clean; `eslint` on the changed files clean (after removing two `eslint-disable` comments the rule did not need; comments only, so the built icons are unchanged); Prettier `--check` clean on every changed file; the catalogue verifier 773 rows, 0 missing.
- **Failing first**, on `dev`'s own icons (the unfixed build): `tests/e2e/app-icons.spec.ts`, desktop: **5 failed, 2 passed**. `/icon` and `/apple-icon` had **0 green pixels** and about **94 % and 93 % navy** (0.94 and 0.93); the favicon test failed on its green share too. The 2 that passed are the control (every icon the page names is served as an image, the manifest names `/icon` and `/apple-icon`) and the favicon-not-navy check where the old file has no navy at the sizes read.
- **The fixed build:** the icons spec on desktop and on a phone, plus `security-headers` and `csp` (API): **34 passed, 0 failed** (they list `/favicon.ico` among the paths whose headers they check).

**Not run, and not claimed:** the rest of the suite (nothing else reads these files); how the icon looks in each browser and on a phone's home screen (the pictures were checked by pixel counts and a preview sheet, not on devices); mutation passes (deferred). No schema, migration or environment change.
