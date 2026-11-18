# 0089: One list/grid kit for every list in the app: view toggle, redesigned item card, real pagination, responsive tabs

- **Period / Focus:** 2026-11-18 (the maintainer, on a phone screenshot of Academics: "list and grid for many places that are listing items and pagination as well", "redesign the item card for better UI/UX, make better use of the spaces", "a margin on top of the tabs", "the tab and the entire page including the list and grid very responsive, mobile and tablet and in between", "the grid and list will be used in many places so plan it well")
- **Status:** Designed; building
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/list-grid-views` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Every list of records can be shown as a **list** (a row each) or a **grid** (a card each), the person's choice is remembered, every list pages the same way, every item is drawn by the same well-designed component, and all of it fits every width from 320 px up without a sideways scroll. This is built **once**, as a kit, and each page adopts it by describing its items, not by drawing them.

## 2. What exists today (the survey)

Every list was drawn by hand, each differently: Classes (two-column cards), Subjects (rows), Users (a CSS-grid row that becomes a card on a phone), Students and Staff (rows with five buttons), Branches (rows with an icon), Programs (cards), Approvals (rows), tables (invoices, fee structures, dispatch logs: left alone, see section 8). Paging is three different things: `Pager` + `paginate` (client slices), `usePagedList` (server pages), and a hand-made "Previous/Next" in Students. Tab strips are two copies (`ui/Tabs.tsx` and a private one in `AcademicsSections.tsx`). Nothing has a view choice.

## 3. Decisions

- **D1. One kit, four small parts**, all under `components/ui/`: `ViewToggle` (List / Grid), `useCollectionView` (the remembered view and page size), `Collection` + `Item` (the container and the item card), and the upgraded `Pager`. `ListToolbar` gets a slot for the toggle. A page adopts it with a few lines: the toolbar, `<Collection>`, one `<Item>` per record, `<Pager>`.
- **D2. An item is described, not drawn.** `Item` takes `title`, `subtitle`, `leading` (an icon tile or initials), `badges`, `facts` (short label/value pairs), `children` (anything else: arm chips, a subject line), `href` (the whole item opens a page) and `actions`. The **same props render as a row or as a card**; the layout comes from the collection (a context), so a page cannot get the two out of step.
- **D3. Space comes from the container, not the viewport.** The collection is a CSS container (`@container`). The grid is `repeat(auto-fill, minmax(min(100%, 17rem), 1fr))`: one column when there is room for one, two, three or four as the available width allows, with no breakpoints to get wrong between phone and tablet (the app has a side bar on a desktop, so the viewport is not the width the list has). A list row is stacked below 42 rem of container width and one line above it (`@2xl`). Classes only, so the CSP is unaffected.
- **D4. The card.** A header (leading tile, title that wraps to two lines instead of being cut, one status badge), a **facts row** (up to three: the number big, the label small: "1 arm / 0 subjects / 0 pupils"), the content, and a footer of actions set apart by a rule. Equal-height cards in a row, the footer pinned to the bottom. In a list the same parts run left to right: leading, title and subtitle, facts, badges, actions at the end.
- **D5. Actions stay real buttons with their full accessible names** ("Rename Primary 1", "Subjects of Primary 1"), so screen-reader users and the existing tests meet the same controls. A page that has many (Students: five) passes `primary` ones as buttons and the rest as one **Actions** disclosure (the existing `ActionsMenu`). The whole-item link is a stretched link on the title (actions sit above it), never a click handler on the `li`.
- **D6. Each list names its default view and its key.** The default is what the page looks like today (Classes = grid; Subjects, people, branches = list), so nothing changes for anyone until they choose. The choice and the page size are kept per list in `localStorage` (`aleemaan.view.<key>`, `aleemaan.size.<key>`): a convenience of the viewer's browser, never data, wrapped in try/catch, read with `useSyncExternalStore` so server and first client render agree.
- **D7. Paging.** Sizes by view: list 10 / 25 / 50, grid 12 / 24 / 48 (12 divides into 1, 2, 3, 4 and 6 columns, so the last row is rarely ragged). **Changing the view or the size keeps the first item you were looking at on screen** (the page is recomputed from its offset). The `Pager` shows "Showing 13 to 24 of 57", Previous / Next (44 px targets), numbered pages from `sm` up (first, last, current and its neighbours, with gaps), "Page 2 of 5" on a phone, an optional "per page" choice, `aria-current="page"`, and the range in a polite live region. Server-paged lists pass the size as `limit` (the API cap, 50, still holds); client-sliced lists use `paginate`.
- **D8. Tabs.** One shared `Tabs`. **A margin above the strip** (the maintainer's request: it touched the text above it). Labels never wrap on a phone: the strip scrolls sideways, snaps to a tab, fades at the edge that has more, and scrolls the chosen tab into view; from `md` all tabs sit in one row. 44 px minimum height. Academics, Users, Finance, Settings and the Forms sections use it (Academics' private copy is removed).
- **D9. The toolbar is responsive too.** On a phone the search takes the first line; Filters and the view toggle share the second; from `sm` everything is on one line. The "n items" count sits with the toggle.
- **D10. Empty, loading and error states are the kit's** (`Collection` draws "Loading…" with `aria-busy`, the dashed "nothing here / nothing matches, Clear filters" box), so every list says the same thing the same way.

## 4. Adoption

| Phase | Lists | Default |
|---|---|---|
| **1 (this task)** | Academics: Classes, Subjects, Staff · Users: People, Pending invitations · Students · Branches and a branch's people · Approvals: Email changes, Requests · Programs | as today |
| **2 (next)** | LMS (materials, assignments, quizzes), Question bank, Announcements, Forms, Results review, Program tabs (people, fees) | to decide per list |
| **Not lists** | Tables of figures (invoices, fee structures, dispatch logs, promotion preview): a table is the right shape for columns of numbers; on a phone they may later get a card view | table |

A new list needs only: a `useCollectionView("<key>", { defaultView })`, the toolbar with `<ViewToggle>`, `<Collection>` with `<Item>`s, `<Pager>`. `docs/components/shared.md` has the contract and an example.

## 5. Not in this task

New data on a card (only what the list already had, laid out better); drag-to-reorder; saved views on the server; a table view; the Phase 2 lists; the walkthrough.

## 6. Tests

- **Unit** (`tests/unit/collection-model.spec.ts`): the pager's page list (gaps, first/last, small counts), the range text, the page after a size or view change (the first visible item stays), `paginate`, the stored view and size (a bad stored value falls back to the default).
- **Browser** (`tests/e2e/list-grid-views.spec.ts`): the toggle changes the layout and is remembered after a reload and per list; switching view or size keeps the item; the pager's numbers and size; **no sideways scroll at 320, 360, 390, 600, 768, 820, 1024 and 1280 px** on Academics (both tabs), Users, Students and Branches, in both views; the tab strip fits or scrolls and the active tab is in view; the gap above the tabs is at least 16 px; the grid has more than one column on a tablet; axe (WCAG 2.2 AA) on both views.
- The existing specs that touch these lists keep their accessible names (D5); those that depended on the old structure are updated and listed in the build record.

## 7. Risks

- Remembered views mean two people on one browser share a choice (a convenience, not data). Container queries need a 2023 browser: older browsers get the one-column grid and the stacked row, which still work.
- Adopting many lists in one change touches many specs: they are run in the batched lanes, and every failed line is read before anything is merged.

## 8. Build record and tests

(filled in with the real counts when the suites have run)
