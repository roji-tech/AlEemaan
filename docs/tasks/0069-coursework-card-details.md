# 0069: The assignment cards show how many pupils have handed in, name their Speed Grader button, and a pupil's list no longer carries that count

- **Period / Focus:** 2026-11-12 (inconsistencies found while writing the walkthrough's chapter C13, task 0033, after tasks 0062 to 0066; the maintainer asked for the issues and inconsistencies found to be fixed)
- **Status:** Done
- **Priority:** Low (the count leak is small; the rest is a missing field and an unnamed button)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/coursework-card-details` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Three inconsistencies on the Coursework assignment cards (`AssignmentsList.tsx`) and the list route:

1. **A dead field.** The card's item type has `submissionsCount`; the API sends `_count: { submissions }` (the `include` of `listAssignments`). Nothing reads either, so a teacher never sees how many pupils have handed in, which is the first thing they want before opening the Speed Grader.
2. **An unnamed button.** Every other button on a card names its assignment (`Delete assignment <title>`, `Edit assignment <title>`, `Close hand-ins: <title>` ...); "Speed Grader" does not. With two cards, a screen-reader user hears two identical buttons, and the walkthrough had to pick one by position (`.last()`).
3. **A count that leaks.** `GET /api/v1/lms/assignments` sends `_count.submissions` to everyone, so a pupil's or a guardian's session learns how many classmates have handed in. (The single read already empties `submissions` for them: `hideSubmissions`.)

## 2. Decisions (mine; the maintainer may correct)

- **D1.** The card shows "N hand-ins" ("1 hand-in") to staff (`canManage`), read from `_count.submissions`; the dead `submissionsCount` is replaced by `_count`.
- **D2.** The Speed Grader button's name is `Speed Grader: <title>`. It still contains "Speed Grader", so the existing specs (`getByRole("button", { name: "Speed Grader" })`) match it; the dialog it opens is already named `Speed Grader: <title>`.
- **D3.** The list route strips `_count` from the answer for a caller who is not staff of the branch (`hideSubmissionCount` in `audience.ts`, next to `hideSubmissions` and `hideAnswerKey`).
- **D4. Not changed:** an assignment cannot get resource links from the dialog (the API takes `attachments`; the dialog and the portal's assignment card have none). That is a feature, recorded for the maintainer, not built here.

## 3. Work breakdown

- [x] Design (this file).
- [x] The tests first, on the unfixed build: `tests/api/lms-assignment-count.spec.ts` (a teacher's list carries `_count`, a pupil's and a guardian's does not) and `tests/e2e/lms-card-details.spec.ts` (the card says "1 hand-in" and "0 hand-ins"; `Speed Grader: <title>` opens its own dialog).
- [x] The change: `audience.ts`, the list route, `AssignmentsList.tsx`.
- [x] The new specs and the existing LMS and portal specs pass (desktop and phone).
- [x] Docs: the component and function catalogues, the tracker. The walkthrough's chapter C13 keeps `.last()` (it works, and the chapter's PR is separate); it may use the name later.

## 4. Build record and tests

Same setup as task 0064 (no lanes, fixed ports, database `aleemaan_test`, one run at a time, a production build before each run).

- **Unfixed build (`origin/dev` at 51b1f40 plus the two new specs): 2 failed, 1 passed (the setup).** The API spec failed because the pupil's list still had `_count` among its keys (`Expected value: not "_count"`, received the full list of keys); the end-to-end spec failed because the card said nothing about hand-ins (the element was not found).
- **Fixed build: 41 passed, 0 failed** (setup, API, desktop and phone): the two new specs and the existing `lms`, `lms-coursework-states`, `lms-patch-keeps-fields`, `staff-assignments`, `portal-coursework` (API and end to end), `lms-a11y`, `lms-create-a11y` and `lms-material-link`.
- **Gates:** `tsc --noEmit` exit 0; eslint on the changed files exit 0; Prettier: `assignments/route.ts` and the new specs are clean; `AssignmentsList.tsx` and `audience.ts` were NOT Prettier-clean on `origin/dev` already (checked), so they were left as they were and only this task's lines were edited.
- **Not run:** the whole suite; mutation passes (deferred).
