# 0066: Coursework can be saved as a draft, edited, closed and archived; a PATCH no longer resets what it did not send

- **Period / Focus:** 2026-11-12 (the maintainer's "fix the flaws and gaps" after the walkthrough's chapter C13 found that Coursework cannot be edited, drafted, closed or archived from the screens, and that a material's type and draft state were never stored)
- **Status:** Done (the walkthrough's chapter C13 still has to cover the new actions; that is on its own branch)
- **Priority:** Medium to High (a PATCH that sends one field resets status, points, attachments and the exam flag: found while designing the edit screens)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/coursework-gaps` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

What the screens could not do before this task (all recorded under "For the maintainer" in tasks 0062 to 0065; the maintainer asked for them to be built):

1. **Assignments** could only be created already published. The API has `PATCH` and a `status`, the screens used neither: no draft, no edit, no way to stop hand-ins, no archive. The status filter offered "Closed" and "Archived", but the stored statuses are DRAFT, PUBLISHED and ARCHIVED (and nothing ever set ARCHIVED); "Closed" matched nothing.
2. **Materials** could only be added and deleted. A material had no type and no draft state; both were removed from the dialog in task 0065 because nothing stored them.
3. **A defect found while designing the edit:** `updateAssignmentSchema`, `updateMaterialSchema` and `updateQuizSchema` are `createXSchema.partial()`. Zod 4 applies the defaults of a partial field, so a `PATCH` that sends only `{ "title": "x" }` is read as `{ title, status: "DRAFT", totalPoints: 100, allowLate: true, attachments: [] }` for an assignment (a published assignment is unpublished and loses its link and points), `{ attachments: [] }` for a material (the link of task 0065 is wiped), and `{ status: "DRAFT", isExamTemplate: false }` for a quiz. Verified with the installed Zod (a one-line parse of a partial schema). Any edit screen built on the current schemas would corrupt rows.

## 2. Decisions (mine; the maintainer may correct)

- **D1. One migration, `20261112210000_coursework_states`** (the maintainer applies it to the hosted databases; the tests and the walkthrough apply it with `prisma migrate deploy` to their own databases): `AssignmentStatus` gains `CLOSED`; a new enum `MaterialStatus` (`DRAFT`, `PUBLISHED`) and a new enum `MaterialType` (`DOCUMENT`, `VIDEO_LINK`, `PRESENTATION`, `NOTES`, `OTHER`, the five options the dialog had before task 0065); `LearningMaterial` gains `status` (default `PUBLISHED`: every existing material was visible to pupils) and `materialType` (default `OTHER`: the honest value for rows that never had one); an index on `(branchId, status)`. No data is rewritten.
- **D2. Meaning of each assignment state**
  - DRAFT: staff only. PUBLISHED: pupils see it and hand in. CLOSED: pupils still see it (and their own hand-in and mark), the hand-in form is closed and the server refuses a hand-in. ARCHIVED: staff only, kept with its hand-ins (the Speed Grader still opens it). "Delete" is unchanged (it stamps `archivedAt` and the row disappears for everyone).
  - Actions on the card: DRAFT: Edit, Publish. PUBLISHED: Edit, Close hand-ins, Archive. CLOSED: Edit, Reopen, Archive. ARCHIVED: Restore (back to a draft, so a teacher looks before pupils see it). The Speed Grader and Delete stay on every card.
- **D3. The create dialog gets "Save as Draft"** next to "Publish Assignment" (the name of the existing button is kept: the existing specs and the walkthrough use it). The same dialog edits an assignment (title "Edit Coursework Assignment", button "Save Changes", and "Publish Assignment" while it is a draft).
- **D4. Materials:** the dialog gets the type select and "Save as Draft" back (stored this time); the same dialog edits (the link is read from the first web attachment). The card shows a type chip and a "Draft" chip; actions Edit, Publish or Unpublish, Delete. Pupils and parents never receive a draft: not from `GET /lms/materials`, not from `GET /lms/materials/[id]`, not from the portal's list. (`GET /lms/materials` answered a pupil's session with every material of the branch; drafts would have leaked through the same route.)
- **D5. The update schemas are built from field definitions without defaults.** The create schema adds the defaults; the update schema is the same fields, all optional, no defaults. A test for each of the three routes sends only a title and checks that nothing else changed.
- **D6. Not changed:** quizzes already have draft and publish in their own dialog; only the schema defect of D5 touches them. A closed assignment still lets staff grade. The portal's own deadline rule (`closed` when the due date has passed and late work is not accepted) is kept; `closed` is now also true for the CLOSED status.

## 3. Work breakdown

- [x] Design (this file).
- [x] Tests: `tests/api/lms-patch-keeps-fields.spec.ts` (D5, written and run on the unfixed build first), `tests/api/lms-coursework-states.spec.ts` (8 API tests: material type and draft stored, drafts hidden from a pupil's and a guardian's membership and from the portal, an edit changes only what it sends; a pupil lists published and closed assignments only, single read, the state changes, a hand-in to a closed or draft assignment refused on the staff route and the portal) and `tests/e2e/lms-coursework-states.spec.ts` (the screens, both lifecycles).
- [x] Migration, `schema/lms.prisma`, `validation.ts`, `service.ts`, routes (materials list and single read, assignments list and single read), `portal/service.ts` (published and closed assignments, published materials, `closedBy`).
- [x] Screens: `AssignmentModal`, `AssignmentsList`, `MaterialModal`, `MaterialsList`, and the portal's closed note (it said "The deadline has passed" for every closed assignment; it now says the teacher closed it when that is so).
- [x] Docs: `docs/components/school-app.md`, `docs/functions/school-app.md`, the HANDOVER (item 7 of "Waiting on the maintainer": the migration), the tracker.
- [ ] The walkthrough's chapter C13 covers the new actions (branch `claude/walkthrough-c13`).

## 4. Build record and tests

Same setup as task 0064 (no lanes, fixed ports, database `aleemaan_test`, one run at a time, a production build before each run).

- **Build without the fix (`origin/dev` at f6dea70), `lms-patch-keeps-fields`, run 1: 3 failed.** The assignment test received `DRAFT` where `PUBLISHED` was expected; the material test received `[]` for the link; the quiz test received 404, which was my test's fault (an exam template whose window has not ended is hidden from every teacher except its creator): the quiz got an `examWindowEnd` in the past and the spec was run again.
- **Same build, run 2: 3 failed, 1 passed (the setup).** Assignment: status `DRAFT` instead of `PUBLISHED`; material: attachments `[]` instead of the link; quiz: status `DRAFT` instead of `PUBLISHED`. This is the defect of section 1, proven on the unfixed code.
- **The state specs could not be run on the unfixed code:** they use a column (`LearningMaterial.status`, `.materialType`) and an enum value (`CLOSED`) that did not exist there. The mutation passes (deferred to the end of PHASE 2) are where "remove the `publishedOnly` filter" and "remove the closed check" will be shown to fail these tests.
- **Fixed build, 46 passed, 0 failed** (setup, API, desktop and phone): the three new specs, and the existing `lms`, `lms-attachment-links`, `portal-coursework` (API and end to end), `staff-assignments`, `lms-material-link`, `lms-number-fields`, `lms-a11y` and `lms-create-a11y`.
- **Migration check:** `prisma migrate diff` from the migrated test database to the schema names no line for `LearningMaterial`, `AssignmentStatus`, `MaterialStatus`, `MaterialType` or `CLOSED`. It does report four other tables whose column types differ from the schema (`FormMarkingAudit`, `FormTurnInAudit`, `FormTurnIn`, `QuestionBankPrintLog`): older than this task; fixed in task 0068 (the schema was brought to the database, and a test now fails on any drift).
- **Gates:** `tsc --noEmit` exit 0; `eslint` on the changed files exit 0; Prettier `--check` on the changed files: the new files and the modals are clean; `AssignmentsList.tsx`, `lms/service.ts` and `portal/service.ts` were NOT Prettier-clean on `dev` already (checked against `origin/dev`), so they were left as they were and only this task's lines were edited.
- **Not run:** the whole suite; mutation passes (deferred); the phone width for the new end-to-end spec was run (it is in the 46); a hosted-database migration (the maintainer's).
