# [0020]: PWA Foundation & Global Quick-Tools Dock

- **Period / Focus:** AlEemaan Port of Quick-Tools Dock and Progressive Web App (PWA) Foundation
- **Status:** [x] Completed (All quality gates passed, full automated suite green)
- **Priority:** High
- **Assignee:** Antigravity / Engineering Team
- **Target Branch / PR:** [PR #46](https://github.com/roji-tech/AlEemaan/pull/46) (`claude/pwa-and-quick-tools` -> `dev`)
- **Started:** 2026-10-16 UTC
- **Ended:** 2026-10-16 UTC
- **Duration:** ~2 hours

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective
Port and adapt the complete Progressive Web App (PWA) Foundation and Global Quick-Tools Dock from Octalve Edu into AlEemaan. This provides offline caching resilience, installable manifest capabilities, offline status banner, and a keyboard-accessible floating quick-tools dock (`Cmd+K` / `Alt+T`) housing a pure Shunting-Yard school calculator, instant student admission lookup, and branch-isolated local scratchpad notes.

---

## 2. Context & Implementation Details

- **PWA Infrastructure:**
  - Standard Web App Manifest at `public/manifest.webmanifest` and `src/app/manifest.ts`.
  - Service worker at `public/sw.js` with network-first caching for navigation, offline fallback to `/offline`, and cache-first for static assets.
  - Dedicated offline indicator and recovery view at `src/app/offline/page.tsx`.
  - Automated service worker registration via `src/components/pwa/ServiceWorkerRegister.tsx` wired into root layout.
- **Quick-Tools Floating Dock & Shell:**
  - Floating trigger button and drawer component at `src/components/quick-tools/QuickToolsDock.tsx`.
  - Global keyboard listener (`Cmd+K` and `Alt+T`).
  - WCAG 2.2 AA compliant high-contrast theme tokens and ARIA dialog properties.
- **Integrated Utilities:**
  - **Universal School Calculator:** Pure Shunting-Yard math evaluator (`src/lib/quick-tools/calculator.ts`) handling operators, parentheses, percentages, decimal points, and tape history.
  - **Student Lookup:** Fast admission number and name searching with branch scoping.
  - **Branch-Isolated Scratchpad:** Persistent local notes stored securely per user and branch in `localStorage`.
- **Quality Gates:**
  - 12/12 unit tests passing in `tests/unit/quick-tools.spec.ts`.
  - `pnpm typecheck`, `pnpm lint`, and `pnpm build` clean with 0 errors.

---

## 3. Work Breakdown

- [x] PWA Assets and Manifest (`public/manifest.webmanifest`, `public/sw.js`, `src/app/offline/page.tsx`)
- [x] Service Worker Registration Component (`src/components/pwa/ServiceWorkerRegister.tsx`)
- [x] Pure Calculator Engine (`src/lib/quick-tools/calculator.ts`)
- [x] Quick-Tools Dock & Drawer UI (`src/components/quick-tools/QuickToolsDock.tsx`)
- [x] Root Layout integration (`src/app/layout.tsx`)
- [x] Automated unit test suite (`tests/unit/quick-tools.spec.ts`)
- [x] Verification, build check, and tasks ledger sync
