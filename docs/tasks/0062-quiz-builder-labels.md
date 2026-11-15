# 0062: Coursework's create dialogs: the quiz builder's controls had no names, and the assignment's Publish button was below AA contrast

- **Period / Focus:** 2026-11-12 (found by reading the Coursework screens for the product walkthrough's chapter C13, task 0033, and confirmed by the new spec on the unfixed build: the quiz builder's "Question Type" and "Points" labels belong to nothing, and axe reports a serious `color-contrast` failure on the assignment dialog)
- **Status:** Done
- **Priority:** Medium (a teacher who uses a screen reader, or who tabs through the form, cannot tell the question's type select, its points field or its correct-answer radios apart; the product holds itself to WCAG 2.2 AA)
- **Assignee:** Claude
- **Target Branch / PR:** `claude/quiz-builder-labels` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

`src/components/lms/QuizModal.tsx` builds a quiz from questions. Each question block draws:

- a `<label>Question Type</label>` and `<label>Points</label>` that are siblings of their controls, with no `for` and no wrapping, so the select and the number field have no name (axe: `select-name`; for the field, `label`);
- a question prompt that has a placeholder and no name;
- for a multiple-choice question, one radio per option that is named only by its `title`, "Mark as correct answer", the same for every option, and option text fields named only by their placeholders;
- a short-answer question whose "Expected exact keyword or phrase" label is not tied to its field;
- a "Remove" button that does not say which question.

Nothing is stored wrongly; the form works with a mouse. The fix gives every control a name and the blocks a name: each question is `role="group"` named "Question N", the labels are tied to their controls (`htmlFor` with an id made from the form's `useId` and the question's position), the prompt and the option fields have `aria-label`s, the correct-answer radios say which option ("Option 2 is the correct answer"), and Remove says which question.

**Second defect, found by the new spec's first run on the unfixed build:** the assignment dialog's **Publish Assignment** button is filled with the raw brand green (`bg-brand`, `#2e8b57`) with white text, which is **4.25:1**, under the 4.5:1 that AA asks of 14 px text (the design notes in `brand.css` say so themselves: filled buttons with white text use `--brand-strong`, `#2a7f4f`, 4.94:1). Its hover class, `hover:bg-brand-hover`, names a token that does not exist, so it did nothing. The material and quiz dialogs' buttons already use `bg-brand-strong hover:bg-brand-strong-hover`; the assignment dialog now does too. Axe named the element as `.hover:bg-brand-hover` in the dark theme (the first theme the spec scans).

## 2. Context

- **Why no test saw it:** `lms-a11y.spec.ts` scans the three lists and the Speed Grader and never opens a create dialog; no spec opens the quiz builder at all (`grep` of `tests/` for the dialog's title finds only the walkthrough matrix).
- **What is not changed:** the assignment and the material dialogs already tie every label to its field with `htmlFor` (checked by reading, and by the new spec's axe scan of both themes); the portal's quiz dialog is a different component.

## 3. Decisions (mine; the maintainer may correct)

- **D1. Names, not looks.** No visual change: the visible label text stays as it was ("Question Type", "Points", "Expected exact keyword or phrase"); the new names are `aria-label`s where there is no visible label (the prompt, the option fields, the radios, Remove).
- **D2. Each question is a group.** `role="group"` with `aria-label="Question N"`, so a screen reader announces which question a control belongs to and a test can scope to one question.

## 4. Work breakdown

- [x] Design (this file).
- [x] The test first: `lms-create-a11y.spec.ts` (the assignment and material dialogs; the quiz builder with one question of each kind), run on the unfixed build and every failure read (section 6).
- [x] The fix in `QuizModal.tsx` and the Publish button of `AssignmentModal.tsx`.
- [x] The new spec and the existing LMS specs pass on the fixed build, desktop and phone.
- [x] Docs: the tracker.

## 5. Not in this task

- Mutation passes (deferred to the end of PHASE 2, the maintainer's call); an edit mode for a quiz or an assignment (there is none; see the Coursework note in task 0033, section 6.10).

## 6. Build record and tests

From the logs of these runs (the AlEemaan test lane, a production build of each state), not from memory.

- **The new spec on the UNFIXED build** (desktop): 1 passed (setup), **2 failed**. (1) The assignment dialog: `color-contrast [serious]` on the Publish button (`.hover:bg-brand-hover`), dark theme. (2) The quiz builder: `getByRole("group", { name: "Question 3" })` not found, because the question blocks were unnamed.
- **A third defect, found by the same spec after the first two were fixed:** on the fixed-label build the quiz builder still failed `color-contrast` in the LIGHT theme, on the question type selects, the points fields, the option fields and the True/False labels: **foreground `#f8fafc` on background `#f1f5f9`, 1.04:1**. It failed on the first run, passed 3 of 3 repeats, then failed 4 of 4 repeats once the spec used the shared `setTheme` helper (which flips the theme and waits for the colour transitions in one step), so it was not the transition flake of `tests/support/theme.ts`. These controls were the only ones in the dialog with no text colour class (`text-fg`, which every other field has), so their colour came from the browser's default for form controls. **I did not establish why that default stayed at the dark theme's near-white after the theme was flipped with the dialog open;** giving each of them `text-fg` removed it: **16 of 16 repeated runs passed** (4 repeats x 2 tests x desktop and phone).
- **On the final tree** (`lms-create-a11y`, `lms-a11y`, `portal-coursework`, `portal-access`, desktop and phone): **25 passed, 0 failed.**
- **Gates:** `tsc --noEmit` 0; `eslint` on the changed files 0; `prettier --check` clean; `next build` 0 (three times).
- **Not run, and not claimed:** the whole suite; the other e2e specs; mutation passes (deferred to the end of PHASE 2, the maintainer's call). Not scanned: the thirteen raw-palette colour uses outside Finance and Coursework (several `bg-brand` with white text in the attendance panel, the offline page and the tools: at 4.25:1 they would fail the same way if the text is 14 px).
