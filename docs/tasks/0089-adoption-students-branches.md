# 0089 (adoption): Students, Branches and a branch's people on the list/grid kit

- **Period / Focus:** 2026-11-18, part of task 0089 (`docs/tasks/0089-list-grid-views.md`, phase 1 adoption)
- **Status:** Built on `claude/views-students`; browser specs to be run by the maintainer's lane
- **Branch:** `claude/views-students` (from `claude/list-grid-views`, with `claude/toasts` merged in because these screens use `useNotice`)

## What changed

| List | Key | Default | Page size | Notes |
|---|---|---|---|---|
| Students (`components/students/StudentsPanel.tsx`) | `students` | list | 25 (the size it always had; the grid's equivalent is 24), server-paged: the kit's size is sent as `limit` | `ListToolbar` (search "Search students", the **Show** filter in its panel, `ViewToggle` in `trailing`), `Collection`, one `Item` per pupil, kit `Pager` ("Pages of students"), `BranchPicker`, `useNotice` |
| Branches (`(app)/branches/BranchesView.tsx`) | `branches` | list | none: every branch is shown, as before | a `ViewToggle` above the list; `Item` with a building tile, the name as the link "<name>, open", the member count, the code, Rename and Delete buttons; `useNotice` |
| A branch's people (`(app)/branches/[id]/BranchDetailView.tsx`) | `branch-people` | list | 10 (as before), client-paged | `ListToolbar` with the toggle, `Item` with initials, role and status badges; `useNotice` for the rename |

## Decisions

- **A pupil's actions.** Edit and Archive / Restore stay buttons. Suspend, Lift suspension, Expel, Reinstate and Standing history move into the row's one "Actions for <pupil>" list (the existing `ActionsMenu`), five buttons being too wide for a row that also holds facts and badges. Every one keeps its full accessible name ("Suspend Amina Musa"), and the list opens by its own button. What a viewer may do is unchanged: the same `kindsFor` and `branch.canEdit` decide, the API still checks everything.
- **The row's text.** Title: the full name. Subtitle: admission number and gender. Facts, each only when known: Class ("No class yet" when none), Guardian (name and phone, or the phone alone), Born (the date of birth is optional, task 0090: a pupil without one shows no Born and no placeholder). Badges: the standing (nothing for a pupil in good standing) and "Archived".
- **Show is a filter.** It sits in the panel of the toolbar's Filters button like the filters of every other list (the Filters button says "1 set" when it is not "Current students"), so a phone shows a search line, not a stack of controls. The info icon beside it stays.
- **Branches are not paged.** A school has a handful, and the page has always shown all of them; a pager would also put a branch on page 2 of a list somebody is looking for it in. Only the view is chosen.
- **A stale answer is ignored.** Changing the view or the size moves the page and the size in the same moment; a counter in `StudentsPanel.load` drops the answer to the older request so it cannot land after the newer one.
- **Messages.** Outcomes are toasts (`useNotice`, task 0096). The "was deleted" message that arrives with the redirect from a branch's page (`/branches?deleted=`) is raised once, on arrival. A failure to load the list stays inline. The namesake / restore-anyway questions stay inline (they ask something).
- **No kit file was changed.** Not adopted: a "Clear filters" button in the no-match box of a branch's people (the toolbar's own panel has it, and two buttons of that name would be ambiguous).

## Specs

`tests/e2e/students-screen.spec.ts`, `tests/e2e/standing-and-payment-rules.spec.ts` and `tests/e2e/info-tips.spec.ts` open the Filters panel before they use "Show", and the standing spec opens the pupil's Actions list before it uses a standing action or the history. The new `tests/e2e/list-grid-students-branches.spec.ts` holds what the kit adds on these three lists.
