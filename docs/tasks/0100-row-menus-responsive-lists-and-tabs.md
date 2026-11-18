# 0100: Rows fold into a three-dots menu, lists fit every width, our own branch dropdown, session terms as cards, the open tab in the address

- **Period / Focus:** 2026-11-18 (the maintainer, from screenshots: "fold those actions into a 3 dots option icon for responsiveness ... and you can do that for any other UI"; "this UI is not good at all, redesign and make sure it is very responsive across screen sizes"; "this is a bad dropdown design"; "the overlay is not right when I click actions"; "it's shrinking the name even though there are lots of spaces"; "can we switch branch on this dashboard" (the bulk dialog); "in the title that says Edit Aluko Fuad, can you make the name more distinct"; "I think we need to make this more responsive around 850px and others"; "why is this not responsive, maybe we should just use overflow x scroll?" (the Settings tabs); "start adding tab= as query param to denote the current tab")
- **Status:** Built; the record is section 6
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/row-actions-menu` / PR into `dev`
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What was wrong (read from the maintainer's screenshots)

1. **Rows were walls of buttons.** A class row ran Add arm, Subjects, Edit and Archive; a pupil row Edit, Archive and an Actions button. At 850 px that left the name about 100 px: "Abdullahi / Zainab / Ajibike" on three lines, and a session's terms were chips in a column 90 px wide.
2. **The open Actions list was drawn under the next row's buttons.** The buttons of a row sat in a `relative z-10` block; the popover inside it was `z-20` within that block's own stacking context, and the next row's block (also `z-10`, later in the page) painted over it.
3. **The branch dropdown was the browser's.** A native `<select>` laid invisibly over a styled label: its list took the select's light text over the browser's white (unreadable in the dark theme), was narrower than the button, and opened over the page.
4. **A one-line row reserved a fixed 22 rem for its facts** (and switched to one line at a fixed width), so one short fact ("Class: Prep B") kept a third of the row from the name.
5. **The Timetable's five day columns were a fixed five from 768 px** (about 150 px each); the Settings tabs were hand-made buttons whose labels wrapped to two lines.

## 2. Decisions

- **D1. Two or more actions of an item fold into ONE three-dots button** (`Item`'s `actions` and `menu` are merged; one action alone stays a button; `actionsStyle="buttons"` keeps them visible, used for Approve / Reject / Deny, the decision a screen exists for). Nothing at the call sites changes except what is named: the three dots are "Actions for <name>" (the title when it is plain text, or `name`). Danger actions (`variant: "danger"`: branch Delete, invitation Revoke) are set apart and red in the list.
- **D2. The list is a popover at every screen size** (it was in-row on a phone): right edge to the button's right edge, 14 rem at least, never wider than the screen less a margin, upward when there is no room below. Behaviour lives in one hook (`usePopover`) shared with the branch picker.
- **D3. The open menu is raised above everything after it** (`has-[[aria-expanded=true]]:z-30`), so no later row can draw over it. A browser test checks, for every item of an open list, that it is the topmost element at its own centre, at 360, 850 and 1280 px.
- **D4. When a list row is one line depends on how much it carries**: one short fact from 42 rem of list width, two facts from 48 rem, three or more from 56 rem; below that it stacks (name, then facts). The name always takes what the facts and the three dots leave; the facts are 11 / 20 / 26 rem wide, not a fixed 22 rem. Container queries (the list's width, not the screen's), so a list inside a narrow panel behaves too. Badges moved under the title, where a long one ("Suspended until 12 Nov 2026") has room. No overflow-x on rows: scrolling sideways hides the actions off-screen on a touch device; wrapping is the answer for rows, scrolling stays for tab strips and tables.
- **D5. `Item` has a `below` slot**: full width, under everything else. Used by a session's terms and a class's arms.
- **D6. Session terms are cards** (`SessionTerms`): a grid of as many 16 rem columns as fit; each card has its dates, a Current badge, its breaks, and its own three dots (Make current, Add a break); each break has its own (Change, Remove). Accessible names are the ones the specs already used.
- **D7. The branch dropdown is ours** (`BranchPicker`): readable colours, a tick on the current branch, keyboard, on the screen. Native selects in dialogs stay native (a phone's own picker is the best control there) but their list now takes the page's colours (`select option` in `globals.css`).
- **D8. The bulk dialogs (pupils, classes and subjects, staff) can switch branch while the first step is open**; once a file or the grid has rows the branch is fixed again, so rows cannot be loaded for one branch and saved into another. The page behind follows the dialog.
- **D9. Dialog titles**: "Edit Aluko Fuad" draws the action quietly and the name in bold accent (`splitTitle`; the text is unchanged).
- **D10. `?tab=`** names the open tab of a page (`useTabParam`, `tab-param.ts`): a reload, a bookmark, a link and the Back button land on the same tab; choosing a tab rewrites the address with `replaceState`, other parameters kept, `new` and the older `section` dropped. An unknown value opens the default. Adopted on Academics (the older `?section=` still opens the right tab), Approvals, Users and Settings. The Settings strip is now the shared `Tabs` (labels never wrap, the strip scrolls sideways when they do not fit): its tabs are `role="tab"` now, not buttons. The Overview's links say `tab=`.
- **D11. Timetable**: day columns are as many as the width holds at 13 rem each (five on a wide screen, three at 850 px, one on a phone); a day's header wraps instead of crowding, and its add button is 44 px.

## 3. Not in this task (asked for, planned next)

The compact branch bar on the other pages that still carry a native "Active branch" select (Timetable and about 15 more); `?tab=` on the remaining tab strips (Finance, Communication, LMS, Question bank, Forms, Promotion); the info-icon audit; draft pupils and staff, staff with no branch yet, a draft (unsent) invitation, and a profile per branch (task 0101).

## 4. Files

`components/ui/` `usePopover.ts` (new), `ActionsMenu.tsx`, `BranchPicker.tsx`, `Collection.tsx` (`Item`), `Dialog.tsx`, `dialog-title.ts` (new), `tab-param.ts` and `useTabParam.ts` (new), `Tabs.tsx` unchanged; `academics/` `SessionTerms.tsx` (new), `SessionsPanel.tsx`, `ClassesPanel.tsx`, `AcademicsSections.tsx`; `bulk/BulkImportDialog.tsx`; `students/StudentsPanel.tsx`, `academics/StaffPanel.tsx`; approvals (`actionsStyle`), `users/InvitationsList.tsx`, `UsersPanel.tsx`, `ApprovalsSections.tsx`; `app/(app)/settings/SettingsView.tsx`, `timetable/TimetableCanvas.tsx`; the Academics page and the Overview's links; `app/globals.css`.

## 5. Tests

Unit: `dialog-title.spec.ts`, `tab-param.spec.ts`. Browser: `row-menu.spec.ts` (students at 360 / 850 / 1280: no sideways scroll, the name keeps its room, one three-dots button per row, every item of the open list is topmost and the list is on the screen, also for the last row; keyboard; the dialog title's two colours; sessions' term cards at three widths; the branch dropdown's contrast at least 4.5 : 1, tick, switching; the bulk dialog's branch switch). A helper `clickAction(scope, name)` in `tests/e2e/helpers.ts` opens the right three-dots menu; the specs that clicked a folded button use it, and the specs that clicked a Settings tab as a button click it as a tab.

## 6. Build record and tests

Gates in this order, on this branch: `tsc --noEmit` clean; `eslint` 0 errors (two old warnings in the anthem player); `next build` clean; `prettier --check` on every changed file clean. Unit: `dialog-title`, `tab-param`, `route-role-guard`, `info-tips`: 19 of 19. Browser (Chromium, one worker, the shared test database, read from the run logs and not from my own summary):

| Run | What | Result |
| --- | --- | --- |
| Pass 1 | the 168 tests of every spec the change touches | 139 passed, 29 failed. All 29 were specs still written for the old screen (a button that is now an item in a three-dots list, the Settings tabs that are now role "tab", the native branch select) plus one real bug found by the new spec: at 360 px the last row's open list was half under the phone's bottom bar (fixed: the list scrolls itself into view clear of the bars, `pb-44`). |
| Pass 2 | 111 tests, rebuilt from the fixed tree | 101 passed, 10 failed. approvals-screen and login-switch: spec fixes made after the run began. standing-and-payment-rules (open list drawn over the Filters button: the spec now presses Escape) and students-screen, both themes (Restore is in the row's list: spec fixed). **row-menu at 850 px was a real bug**: the last row's list opened downward and its last item, "Standing history", was under the bottom navigation bar and the tools button. Fixed in `usePopover`: the room below stops at the top of any element marked `data-fixed-bottom` (the navigation bar and the tools button), so the list opens upward there. Four more were 30 s timeouts of the long axe tests while two builds ran beside them. |
| Pass 3 | the 6 spec files of pass 2's failures, rebuilt | 39 passed, 6 failed: only the three long both-themes tests (axe on many screens), 30 s timeouts with two other builds running on the machine. |
| Pass 4 | those three tests alone, nothing else running | see the line at the end of this section |

Not run: the `e2e-mobile` project for the changed specs, and the walkthrough chapters whose Settings tab clicks were changed from button to tab (the walkthrough is deferred until everything is in production; those two edits are mechanical).
