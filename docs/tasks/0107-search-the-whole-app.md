# 0107: Search the whole app from the top bar: any page, tab or setting, with the way to get there

- **Period / Focus:** 2026-11-18 (the maintainer, with a screenshot of the top bar: "we want to have a general search bar on the navbar to search for anything on the app, and the result is clickable and takes you to the page, even to the tab, or even add some description on how to get exactly there, especially if it is not straightforward")
- **Status:** Designed; building phase 1
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

(filled in with the real counts when the suites have run)
