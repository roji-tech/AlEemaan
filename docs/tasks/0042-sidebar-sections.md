# 0042: The sidebar in sections, collapsible to icons, with the person pinned at the foot

- **Period / Focus:** requested 2026-11-03 by the maintainer, for this repo and for Octalve Edu
- **Status:** Built and tested 2026-11-03; merged into `dev` as PR #148 (merge commit `bea6529`, 2026-11-03)
- **Priority:** High (the walkthrough, task 0033, films the sidebar, so it changes first)
- **Assignee:** next AI / maintainer
- **Target Branch / PR:** one branch (`claude/sidebar-sections`) and one PR off `dev`

> **How to tick:** change `[ ]` to `[x]`.

## 1. Objective
The desktop sidebar is one flat list of up to 16 links. It becomes **sections with sub-items**, where each section can be folded; the **whole sidebar can be folded to a rail of icons**, and the rail opens by itself while the pointer is over an icon; the **signed-in person stays pinned at the foot** of the sidebar however short the list is. Nothing about who may see what changes: the list is still filtered by `navFor`, and the pages and APIs still decide access.

The maintainer's words (2026-11-03): sections and subsections where sections are collapsible; the entire sidebar collapsible on desktop, showing only the icons when collapsed; it opens by itself when an icon is hovered, but nothing happens when the toggle button is hovered; the user section at the bottom starts fixed there even when there is space above it.

## 2. Context & Related Docs
- The code: `src/components/shell/` (`nav.ts` is the single source of truth for the list; `AppShell.tsx`, `SidebarNav.tsx`, `MobileNav.tsx`). Tests: `tests/e2e/shell.spec.ts`, `tests/e2e/responsive-and-a11y.spec.ts`. Walkthrough matrix: `tests/walkthrough/coverage/rows.json` (rows SHL-01 to SHL-08 describe the shell).
- Conventions to follow: the theme is a cookie read on the server (`src/lib/theme.ts`, `src/app/layout.tsx`) so the first paint is right and no inline script is needed (the CSP forbids one). The sidebar's two preferences use the same pattern.

## 3. Rules the sidebar keeps
1. **The list is derived from `NAV`, nowhere else.** Sections are a property of an entry (`section`), so the sidebar, the phone More sheet and the tests cannot disagree. The order of `NAV` is unchanged because the phone tab bar is the first four entries without `inMore` in that order.
2. **A section with one visible entry is a plain link** (no heading, nothing to fold); a section with none does not exist. A teacher therefore sees "Announcements" as a link, not as a section of one. A plain link that comes after a section has a thin rule above it, so it does not read as one of that section's pages (found in the first screenshots: it looked like part of "Assessment").
3. **The page you are on is never hidden**: the section that holds the current page opens when you arrive on it (a link, a card, the address bar), and the current link keeps `aria-current="page"`.
4. **Hover is a courtesy, not the only way**: everything the hover does is also done by keyboard focus, and a touch screen never opens it by tap-hover (the phone has its own bar; a tablet in landscape taps the toggle).
5. **No layout shift from hover**: the open-by-hover rail is an overlay on top of the page; the page stays where it is. Only the toggle (a pinned choice) moves the page.
6. **Preferences are cookies, read on the server**, so the first paint is right (no flash of the wrong width). They are not secrets and not authentication; values are whitelist-parsed, so a hand-edited cookie can only select one of the known states.
7. **Both themes, phone width untouched, axe clean, reduced motion honoured** (the width change is instant when the person asks for less motion).

## 4. Design

### 4.1 Sections (AlEemaan)
| Section | Entries (in `NAV` order) |
| --- | --- |
| (none) | Overview |
| Classroom | Students, Coursework, Attendance, Timetable |
| Assessment | Results, Question bank, Forms |
| Communication | Announcements, Communication |
| Administration | Branches, Settings, Academics, Finance, Approvals, Users |

`groupNav(items)` is a pure function in `nav.ts`: entries without a section first (one group, no heading), then the sections in the fixed order above, each with its visible entries; a section of one entry comes out without a heading; an empty section is dropped. It is also used for the More sheet on a phone, so the sheet has the same headings (not foldable: a sheet is already short-lived).

### 4.2 The frame
- One client component, `SidebarFrame`, owns the state: `collapsed` (pinned, from the cookie), `peek` (opened by hover or focus while collapsed) and `closedSections` (from the cookie). `open = !collapsed || peek` decides whether labels are shown.
- Width: `w-62` (248 px) when open, `w-16` (64 px) in the rail. The page's left padding follows the **pinned** state only (`lg:pl-62` or `lg:pl-16`), through a `data-sidebar="expanded|collapsed"` attribute on the shell, so a peek never moves the page. The frame is `fixed inset-y-0` with `flex-col`: brand `shrink-0`, nav `min-h-0 flex-1 overflow-y-auto`, footer `shrink-0`.
- Icons keep the same position in the rail and when open (link padding is `px-2.5` so the 20 px icon sits at the same x in both), so nothing jumps when the rail opens. Labels are `sr-only` in the rail (still the link's name for assistive technology); section headings keep their height and show only the chevron in the rail, as a divider that is also the handle to fold the section.
- **The toggle** is a round arrow, 28 px, solid brand colour with a white arrow (visible in both themes), fixed on the sidebar's right edge near the top (left to fold, right to open; `aria-label` "Collapse sidebar" / "Expand sidebar"). It is not a hover trigger: hovering it does nothing. History of the decision: a footer row with a label was built first and replaced at the maintainer's request; the arrow was first 32 px and touched the brand mark in the rail (a circle centred on a 64 px strip reaches 16 px inward, the icons end 12 px from the edge), so it is 28 px and sits 2 px further out. The frame is two boxes: the outer one does not clip (the arrow overhangs the edge, so the sidebar is `z-30`, above the top bar's `z-20`, below dialogs' `z-50`), the inner one clips the labels while the width changes.
- **Opening by hover**: while collapsed, `pointerenter` of a mouse or pen on the **navigation or the person block** (the icons) sets `peek`; the toggle and the brand row are not triggers. The pointer leaving the whole frame clears `peek` after 120 ms (so a diagonal move to a label does not flicker). Touch pointers never set it. **Focus** moving into the navigation or the person block sets `peek` as well, focus leaving the frame clears it, and Escape clears it. The overlay has the menu shadow so it reads as above the page.
- **Folding a section**: the heading is `<h2><button aria-expanded aria-controls>`; the entries are a `<ul hidden>` when folded (out of the tab order and the accessibility tree). A fold is remembered; the section of the current page opens on arrival (client effect on `pathname`; it is not written to the cookie, so a deliberate fold is kept for the next visit).

### 4.3 Preferences
`src/lib/shell-prefs.ts` (pure, unit-tested): `SIDEBAR_COOKIE = "sidebar"` (`"collapsed"`, anything else is expanded), `SIDEBAR_SECTIONS_COOKIE = "sidebar-sections"` (comma-separated ids of **folded** sections, whitelist-parsed against the known ids, de-duplicated), and the serialisers. The signed-in layout reads both with `cookies()` and passes them to the shell; the client writes them with `document.cookie` (`Path=/; Max-Age=1y; SameSite=Lax`, `Secure` on https), like the theme. Defaults: expanded, nothing folded, so existing screens and tests behave as before.

### 4.4 The pinned person
Already `flex-col` with a growing nav (the foot is the person only: the toggle is the edge arrow); this task makes it a tested rule: the person block's bottom edge equals the viewport's bottom for a list far shorter than the viewport (a teacher, or an administrator with every section folded) and stays on screen when the viewport is shorter than the list (the nav scrolls, the foot does not).

## 5. Work Breakdown
- [x] `nav.ts`: `section` on `NavItem`, `SECTIONS`, `groupNav`, `sectionOfPath`; `NAV` order unchanged
- [x] `src/lib/shell-prefs.ts` and its unit tests
- [x] `ChevronLeftIcon` and `ChevronRightIcon` in `icons.tsx`
- [x] `SidebarFrame` (state, hover, focus, Escape, cookies, the edge arrow), `SidebarNav` (sections), `BrandMark`, `AppShell` (frame, `data-sidebar`), `(app)/layout.tsx` (reads the cookies)
- [x] `MobileNav`: section headings in the More sheet
- [x] Tests: unit (`groupNav`, `sectionOfPath`, `shell-prefs`) in `tests/unit/shell-nav.spec.ts`; e2e in `tests/e2e/shell.spec.ts` (sections, fold and remember, a hand-edited cookie, current section opens, a teacher's lone link with its rule, the arrow on the edge and clear of the brand mark, rail width, labels and page shift, hover on an icon opens, hover on the person opens, hover on the toggle and the brand does nothing, a finger does not open it, focus opens and Escape and leaving close it, icons do not move when it opens, the person pinned with a short list / all sections folded / the rail / a short window, axe and horizontal overflow in both themes for open, rail and peek, phone sheet headings)
- [x] Walkthrough matrix: rows SHL-09 (sections) and SHL-10 (rail, hover, pinned person) added; `coverage.mjs --structure` passes (226 rows)
- [x] Docs: this file, `current-tasks.md`, `HANDOVER.md`, the component and function catalogs

## 6. Not in this task
- A resizable sidebar, a pinned-favourites section, or a search in the sidebar.
- Hover-to-open on a touch device. A tablet in landscape uses the toggle.
- Octalve Edu: the same design is its task 0026 (its list is role-based and has a school switcher).

## 7. Results
Run on 2026-11-03 against a production build, desktop and phone projects, with the fixed AlEemaan ports and `aleemaan_test`:
- **The whole suite** (every project: setup, unit, integration, API, desktop and phone browser, HTTPS), on the build of this branch: **2971 passed, 46 skipped, 0 failed** (3.1 hours on a shared, loaded machine). The skips are the desktop-only sidebar tests on the phone project and the other tests that skip on a project by design.
- **The shell specs again on the final test files** (`tests/unit/shell-nav.spec.ts` and `tests/e2e/shell.spec.ts`, after the last test-only edit made during the full run): **84 passed, 40 skipped, 0 failed**.
- `tests/unit/shell-nav.spec.ts` (new, 17 unit tests) and `tests/e2e/shell.spec.ts` (26 new browser test cases: 20 written out and 6 generated, two themes by open, rail and peek) are in those numbers.
- Found by the tests while building, all test mistakes and not sidebar bugs: a page-shift assertion measured `#main`, which is centred in a max width and so moves by half the change (it now measures the top bar); re-focusing a link that already has focus is not a new arrival (the test moves focus away first); a section heading was measured while the 200 ms width change was still running (it now waits for the rail width); the administrator test account is a school-wide administrator (it has Branches and Settings).
- Found by looking at the screenshots, fixed: a lone link after a section read as part of that section (now a rule above it); the toggle arrow touched the brand mark in the rail (now 28 px and 2 px further out, and a test keeps it clear).
- Not run: a failing-first run on an unfixed `dev` (the tests are for new behaviour, so they cannot pass there); the touch path was tested with a synthetic touch `pointerover`, not on a real touch screen; no real screen reader was used; a scroll hint for a list longer than the window is not built (the list scrolls; folding sections is the way to shorten it); mutation passes (deferred to the end of Phase 2).
