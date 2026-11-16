# 0064: A number field of the Coursework dialogs rewrote what was typed

- **Period / Focus:** 2026-11-12 (found by the product walkthrough's chapter C13, task 0033: typing 20 over 100 in the assignment's Total Points showed "020")
- **Status:** Done
- **Priority:** Low (the value sent was right; the screen showed a wrong number while it was being typed)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/lms-number-fields` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Two controlled number fields turned an empty field into a number at once:

- the assignment dialog's **Total Points** (`useState(100)`, `onChange` set `Number(value)`): clearing it set 0, and the next key made "020";
- a quiz question's **Points** (`onChange` set `Number(value) || 1`): clearing it set 1 at once, and typing "7" made "17".

A person who selects the field and types a new number gets a wrong one on screen (and, for the quiz question, a wrong one saved). The time limit and the passing score of the quiz dialog already keep an empty field as empty (`number | ""`); these two now do the same: the field keeps what is typed, and the value is read when the form is sent (`Number(...)`, and for a question left empty, 1 point as before).

## 2. Decisions (mine)

- **D1.** No change to what is sent for a filled field; an empty assignment points field is refused by the browser's own `min` check (it has `min={1}`), as a field cannot be both empty and valid.
- **D2.** Not changed: the other number fields of the app (not scanned).

## 3. Work breakdown

- [x] Design (this file).
- [x] The test first: `lms-number-fields.spec.ts`, on the unfixed build.
- [x] The fix in `AssignmentModal.tsx` and `QuizModal.tsx`.
- [x] The new spec and the LMS specs pass on the fixed build.
- [x] Docs: the tracker.

## 4. Build record and tests

Runs on the lane-less AlEemaan test setup (fixed ports, database `aleemaan_test`), desktop project and phone project, one run at a time, each after a production build:

- **Unfixed build, the new spec only (desktop): 2 failed.** The assignment's Total Points showed "0" after the field was cleared (expected an empty field); a quiz question's Points showed "1" after the field was cleared (expected an empty field). Each would then have made the typed digit land after the wrong number ("020", "17").
- **Fixed build: 15 passed** (desktop and phone): `lms-number-fields.spec.ts` (2 tests each), `lms-create-a11y.spec.ts`, `lms-a11y.spec.ts`, `portal-coursework.spec.ts`, plus the database setup. The assignment is made with 20 points (the list shows "20 pts"); the quiz question is stored with 7 points; a question left empty is stored as 1 point.
- Not run: the whole suite; mutation passes (deferred to the end of PHASE 2); the other number fields of the app (D2).
