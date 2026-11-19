# 0107: Search the whole app from the top bar: any page, tab or setting, with the way to get there

- **Period / Focus:** 2026-11-18 (the maintainer, with a screenshot of the top bar: "we want to have a general search bar on the navbar to search for anything on the app, and the result is clickable and takes you to the page, even to the tab, or even add some description on how to get exactly there, especially if it is not straightforward")
- **Status:** Phase 1 built; the record is section 5
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/global-search` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. The problem

The app has grown to about twenty pages and, inside them, tabs inside tabs (Settings has seven, Academics four, Finance three, Users two, Approvals several), and some things are several steps down ("Turn on pupil sign-in" is Settings, then Sign-in access, then a switch per branch). A person who does not know where something lives has only the sidebar, which names pages and not what is on them.

## 2. Decisions

- **D1. One field in the top bar** (a search field from the `lg` width, a magnifier button on a phone that opens a full-screen sheet). `/` focuses it from anywhere that is not a text field (Ctrl or Cmd with `/` also works inside one). Not Ctrl+K: Quick Tools already owns it.
- **D2. A result says three things**, so nobody has to guess: its **title** with the part that matched marked; its **trail** ("Settings > Sign-in access"); and a **line of words** about what is there. A destination that is not obvious (more than one step down, or an action rather than a page) also has **steps** ("Open Settings, choose the Sign-in access tab, then turn the switch on for each branch"), drawn under the result. Choosing a result (click, Enter, tap) goes to its page and to its **tab** (`?tab=`, task 0100), and the search closes.
- **D3. The index is a list in the code** (`lib/search/destinations.ts`): for each destination an id, a title, its address (page and tab), its trail, one line, optional steps, and the words people use for it that its title does not contain ("fees", "school fees", "invoice" for Finance; "login", "password" for Sign-in access). Written by hand because the words and the steps are the point; **kept honest by a test** that reads the real tab ids of each page and fails when a tab exists that no destination reaches or a destination names a tab that does not exist.
- **D4. The viewer sees only what they can open.** Visibility is decided by the SAME function the sidebar uses (`navFor`, with the person's page overrides), plus the few tabs that are narrower than their page (all of Settings is for superadmins, as its page is). A teacher never sees Finance in a result. This is courtesy, not security: the page and the API behind it refuse whoever they refuse, as before; nothing here grants a page.
- **D5. Matching is on the device and instant** (no request per keystroke): the query is split into words; every word must match something in the destination (title, trail, keywords, line, steps); ranking is title start, then a word start in the title, then keywords, then the rest; one slip in a word of five letters or more is forgiven ("setings"). Accents and case are ignored. At most six results per group, with "show all N" at the end of a group.
- **D6. When the box is empty it shows the last five destinations this person chose** (kept on the device, only destination ids, never the text typed), then a short list of common questions ("Add a pupil", "Record a payment", "Close a session").
- **D7. Accessible as a combobox:** the field is `role="combobox"` with a listbox, Up and Down move (the field keeps the focus, `aria-activedescendant`), Enter chooses, Escape closes and gives the focus back, a polite live region says how many results there are, every result is at least 44 px high, the phone sheet is a native `<dialog>` like the More sheet.
- **D8. Phase 2, separate PR (task 0108): the records themselves** (pupils by name or admission number, staff and users by name or e-mail, classes, subjects, invoices by number) through ONE scoped endpoint, with its own security review: results only from the branches the viewer may read, no more than a few per kind, rate limited, nothing about a record in the response beyond what its own list shows. Not built here.

## 3. Work

- [ ] `lib/search/match.ts` (pure: normalise, tokenise, score, forgive one slip) and `lib/search/destinations.ts` (the index) and `lib/search/visible.ts` (the role rule over `navFor`)
- [ ] `components/shell/GlobalSearch.tsx` (the field, the sheet, the list, the keyboard), `useRecentDestinations`
- [ ] The tab id lists exported by each page that has tabs, so the drift test reads the real ones
- [ ] `AppShell` header: the field and the phone button
- [ ] Unit tests (matching, ranking, role visibility, drift); browser tests (type, see the trail and steps, click lands on the page AND the tab, a teacher cannot find Finance, the phone sheet, the keyboard, axe in both themes)
- [ ] Docs: `docs/components/shared.md`, `school-app.md`; this file's build record

## 4. Not in this task

Records (D8), searching the text inside a page, and AI answers. The index is a map of the app, not of its data.

## 5. Build record and tests

Gates in this order: `tsc --noEmit` clean; `eslint` on the changed files clean; `next build` clean; `prettier --check` on every changed file clean.

Unit: the WHOLE project in the first run, 1503 passed and 3 failed (all in `search.spec.ts`: the index had no entry for the Users and Approvals pages themselves, only their tabs; fixed). `tests/unit/search.spec.ts` covers matching (case and accents, every word must be found, a title beats a trail beats a keyword beats the description, one slip forgiven in a word of five letters or more and never in a short one, ranking and ties, highlighting that gives back exactly the text), what people type (login finds Sign-in access, "add a pupil" finds the task, "fees" and "invoice" find Finance), who sees what (superadmin, branch administrator, teacher, other staff, a person's page overrides, an override can never offer an administrators' page), and that the index cannot drift from the app (every id unique, every destination on a page the sidebar knows, every tab named is a real tab and every real tab can be found, every task has steps in whole sentences).

Browser (Chromium, one worker, the shared test database, read from the logs):

| Run | What | Result |
| --- | --- | --- |
| s1 | the whole unit project, the new `global-search.spec.ts` and the shell specs | 1503 passed, 28 failed. 3 were the unit failures above. **23 were one real bug**: when the panel was closed the field still pointed `aria-activedescendant` at a result that is not drawn, which axe flags as a critical ARIA error on every screen of the app (fixed: set only while the list is open). 1 was my test: it counted Next's own link prefetches as "requests made while typing" (now it asserts that no request carries the typed words and none goes to the API). 1 was **a stale spec already on `dev`**: `responsive-and-a11y` expected "Send again" visible on the invitations list, which task 0100 folded into a three-dots menu (the spec was not in the 0100 run list). |
| s2 | the search specs, the shell specs, `responsive-and-a11y` and `theme`, and six specs that the 0100 batch did not run (results-approval-settings, program-people, announcements-draft, finance-fee-edit, portal-practice, question-bank-questions) | 156 passed, 4 failed. 3 were **stale specs already on `dev`** (portal-practice expected the practice screens' messages inside the panel; since task 0096 they are toasts: fixed). 1 was **a collision my change caused**: 47 existing spec lines find a list's field with `getByLabel("Search")`, a substring match, and my field was named "Search the app", so it matched too. Renamed the controls' accessible name to "Find a page or setting" (the placeholder still says "Search"); this also keeps a screen reader from meeting two controls called Search on one page. |
| s3 | the search specs, `portal-practice`, `responsive-and-a11y`, `report-tool`, and every spec that finds a field by "Search" (branch-manage, lists-filters, responsive-and-a11y, users) after a rebuild | 112 passed, 1 failed: the long `/account` accessibility test timed out at the default 30 s |
| s4, s5 | that test alone | s4 failed again at 30 s; s5 with a 120 s limit passed (about 40 s): a long test that visits many screens and checks each with axe, borderline against the default limit. It now declares its own 90 s timeout. |

What the browser tests prove, on a wide screen: `/` focuses the field from anywhere that is not a text field; a result shows its title, its trail ("Settings › Sign-in access"), its kind, and for the active one the numbered steps; Enter lands on the page AND the tab (`/settings?tab=signin`, and "Start a new academic session" ends on Academics, Sessions); a slip in a word is forgiven and a made-up word says nothing was found; a teacher searching for fees finds no Finance and no invoices, and finds Students; Up, Down, Escape (clears, then closes) with the focus staying in the field; the last choices are remembered on the device (only ids, never the words typed); nothing typed leaves the browser; axe at WCAG 2.2 AA in both themes with results and with the empty box. On a 360 px phone: the magnifier is a 44 px button that opens a full-screen sheet with the box focused, choosing a result goes there and closes it, nothing scrolls sideways, axe clean, and Close gives the focus back.

Not run: the `e2e-mobile` project; the walkthrough (deferred). Records (pupils, staff, invoices by name) are NOT searched: that is phase 2 (D8), with its own security review.
