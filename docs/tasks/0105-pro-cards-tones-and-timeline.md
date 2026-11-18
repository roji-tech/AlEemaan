# 0105: Cards that read at a glance: a shared colour tone for state and for actions, a year timeline for a session, stat chips for a class

- **Period / Focus:** 2026-11-18 (the maintainer, with two phone screenshots of the live Sessions and Classes screens: "can you use matching and blending different colors for the button", "please redesign the card, it needs a better UI/UX, redesign like a PRO")
- **Status:** Built; the record is section 5
- **Priority:** High
- **Assignee:** Claude
- **Target Branch / PR:** `claude/ui-polish` / PR into `dev` (builds on task 0100, PR #284)
- **Started:** 2026-11-18

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. What was wrong

The live screens (and, once 0100 is in, my own first redesign of them) are one colour: grey cards, grey chips, white-outlined buttons. Nothing tells you at a glance which term is the current one, which has ended, how far through the year you are, or which action is safe and which is not. A session was a column of text; a class was three numbers and a row of identical buttons.

## 2. Decisions

- **D1. One palette for meaning, taken from the theme's own tokens** (`ui/tone.ts`): `ok` (green: current, active, add, restore), `info` (blue: upcoming, planned, edit), `warn` (amber: breaks, archive, close), `danger` (rose: remove, expel, revoke), `brand` (the school's green: subjects), `neutral` (ended, closed, everything else). Each is a background, a border, a text colour and an icon colour that already exist for both themes, so contrast is the theme's (the tone chips are the same `*-bg` / `*-line` / `*-fg` trios the alerts use).
- **D2. Colour never carries meaning alone.** Every tone has a word beside it (Current, Upcoming, Ended; the action's own label), and a state is also told by its position and its text; the timeline has a text summary for a screen reader.
- **D3. Menu items are matched to what they do.** `ActionsMenu` draws a small tinted icon tile before each item, chosen from the action (`ui/action-look.tsx`: Add is green with a plus, Edit blue with a pencil, Archive amber with a box, Restore green with an undo arrow, History neutral with a clock, Remove / Expel / Revoke rose with a bin). An action it does not know is drawn as before, without a tile. Nothing at a call site has to change; an action can pass its own `tone` and `icon`.
- **D4. A session is a timeline.** A segmented bar across the card, one segment per term, each as wide as the term is long: ended terms muted, the current term filled green up to today, upcoming terms blue. Under it, one line says where you are ("1st Term, day 66 of 107, 41 days left"; or "Starts in 12 days", or "Ended"). Then a card per term with a coloured rail, a state chip, dates and length in weeks; its breaks are amber blocks with their own three dots.
- **D5. A class is stat chips and arm chips.** Arms, subjects and pupils each get an icon and a tone (blue, green-brand, green); an arm is ONE button (the whole chip opens its editor, a 44 px high target instead of a 24 px "Edit" link), named as before ("Edit arm A of Nursery 1").
- **D6. Today is the browser's `new Date()`**, read where the card is drawn; the cards are drawn after the data arrives, so the server never renders a date that the browser then disagrees with.

## 3. Not in this task

Re-colouring the buttons that stay visible (Approve / Reject keep their meaning colours as they are); a tone for every other list in the app (the kit now has it; the other lists adopt it as they are touched).

## 4. Files

`ui/tone.ts` (new), `ui/action-look.tsx` (new), `ui/icons.tsx` (+ Archive, Undo, Clock, Book, Layers), `ui/ActionsMenu.tsx`, `ui/Collection.tsx` (a fact can carry an icon and a tone), `academics/SessionTimeline.tsx` (new, pure parts in `lib/academics/session-progress.ts`), `academics/SessionTerms.tsx`, `academics/SessionsPanel.tsx`, `academics/ClassesPanel.tsx`.

## 5. Build record and tests

Gates in this order: `tsc --noEmit` clean; `eslint` on the changed files clean; `next build` clean; `prettier --check` on every changed file clean.

Unit: the whole project in the first run (1439 passed with the new `session-progress.spec.ts`: days and weeks, a term's state, how far through a term, the bar's segments, the one line of where the year is, and which tone and icon each menu action gets).

Browser (Chromium, one worker, the shared test database, read from the logs):

| Run | What | Result |
| --- | --- | --- |
| r9 | the new and the touched specs after the redesign (row-menu, academic-sessions, session-breaks, academics-structure, list-grid-views, students-screen) | 8 failed, the rest passed. **One real bug**: the new term card had `overflow-hidden` (to round its coloured rail), which clipped its own three-dots list, so the list's items sat under the text beneath and could not be clicked (five specs hit it: a menu item "intercepted" by the timeline's sentence). Fixed: the card no longer clips, the rail rounds its own left corners. **Two mistakes in my new tests**: "today" was computed in UTC and the page reads the viewer's own calendar day (they differ for an hour or two every night east of Greenwich: found because it is just past midnight in the maintainer's time zone), and axe's `target-size` flagged the view toggle that an open menu partly covers (the open menu is now checked on its own, the toolbar with the menu closed). |
| r10 | row-menu, academic-sessions, session-breaks, academics-structure, list-grid-views, after the fixes and a rebuild | **43 of 43 passed** (3.6 minutes) |

What the new browser tests prove, at 360, 850 and 1280 px in the dark and the light theme, each with axe at WCAG 2.2 AA: the session card says where the year stands in a sentence ("2nd Term, day 31 of 90, 59 days left."), draws one bar of three segments with the progress laid over the current one, shows Ended, Current and Upcoming in three different colours, shows a break as its own block with its own three dots, and does not scroll sideways; the class card's arms are one 44 px button each named as before, arms, subjects and pupils are three different colours, the open menu's Rename, Archive and Add arm items have three different tile colours, and neither the open menu nor the card has an accessibility violation.

Not run: the `e2e-mobile` project; the walkthrough chapters (deferred).
